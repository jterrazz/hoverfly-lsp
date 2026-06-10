import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf3xxResponseRule } from "../../src/semantic/rules/hf3xx.js";

const ls = getLanguageService({});

/** Build a rule context from raw simulation text. */
function contextOf(text: string) {
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  return createRuleContext(doc, ls.parseJSONDocument(doc));
}

/** Wrap one response object into a single-pair simulation and run HF3xx over it. */
function diagnoseResponse(response: Record<string, unknown>) {
  const sim = {
    data: { pairs: [{ request: { path: [{ matcher: "exact", value: "/" }] }, response }] },
    meta: { schemaVersion: "v5.3" },
  };
  return hf3xxResponseRule.run(contextOf(JSON.stringify(sim)));
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

describe("HF301 — body and bodyFile both set", () => {
  it("warns and points at the bodyFile key", () => {
    // Given - a response with both body and bodyFile
    const diags = diagnoseResponse({ status: 200, body: "hi", bodyFile: "out.txt" });
    // Then - one HF301 warning
    expect(codes(diags)).toEqual(["HF301"]);
    expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });

  it("stays silent when only one of body/bodyFile is set", () => {
    // Given - body only, then bodyFile only
    expect(diagnoseResponse({ status: 200, body: "hi" })).toEqual([]);
    expect(diagnoseResponse({ status: 200, bodyFile: "out.txt" })).toEqual([]);
  });
});

describe("HF302 — Content-Length and Transfer-Encoding both set", () => {
  it("warns on the second header key (case-insensitive names)", () => {
    // Given - both conflicting headers, with array-shaped header values
    const diags = diagnoseResponse({
      status: 200,
      headers: { "content-length": ["3"], "Transfer-Encoding": ["chunked"] },
    });
    // Then - one HF302 warning
    expect(codes(diags)).toEqual(["HF302"]);
  });

  it("stays silent with only one of the two", () => {
    // Given - just Content-Length
    expect(diagnoseResponse({ status: 200, headers: { "Content-Length": ["3"] } })).toEqual([]);
  });
});

describe("HF303 — Content-Length mismatch", () => {
  it("warns when Content-Length disagrees with UTF-8 byte length", () => {
    // Given - a 5-byte body declared as length 3
    const diags = diagnoseResponse({
      status: 200,
      body: "hello",
      headers: { "Content-Length": ["3"] },
    });
    // Then - one HF303 carrying declared (3) and actual (5)
    expect(codes(diags)).toEqual(["HF303"]);
    expect(diags[0]?.message).toContain("3");
    expect(diags[0]?.message).toContain("5");
  });

  it("uses UTF-8 byte length, not code-unit length", () => {
    // Given - a 2-codepoint body that is 6 UTF-8 bytes ("€€"), declared as 2
    const diags = diagnoseResponse({
      status: 200,
      body: "€€",
      headers: { "Content-Length": ["2"] },
    });
    // Then - HF303 reports actual byte length 6, not 2
    expect(diags[0]?.message).toContain("6");
  });

  it("is silent when length matches", () => {
    // Given - a correct Content-Length
    expect(
      diagnoseResponse({ status: 200, body: "hello", headers: { "Content-Length": ["5"] } }),
    ).toEqual([]);
  });

  it("skips when templated/encodedBody/bodyFile makes the body unmeasurable", () => {
    // Given - templated body with a stale Content-Length
    expect(
      diagnoseResponse({
        status: 200,
        body: "{{ Request.Body }}",
        templated: true,
        headers: { "Content-Length": ["3"] },
      }),
    ).toEqual([]);
    // Given - encodedBody true
    expect(
      diagnoseResponse({
        status: 200,
        body: "aGVsbG8=",
        encodedBody: true,
        headers: { "Content-Length": ["3"] },
      }),
    ).toEqual([]);
  });
});

describe("HF304 — status out of range", () => {
  it.each([99, 600, 0, 700])("warns on status %i", (status) => {
    // Given - an out-of-range status
    const diags = diagnoseResponse({ status });
    // Then - one HF304
    expect(codes(diags)).toEqual(["HF304"]);
  });

  it.each([100, 200, 404, 599])("accepts in-range status %i", (status) => {
    // Given - an in-range status
    expect(diagnoseResponse({ status })).toEqual([]);
  });
});

describe("HF305 — encodedBody but invalid base64", () => {
  it("warns on a non-base64 body when encodedBody is true", () => {
    // Given - encodedBody true with an obviously non-base64 body
    const diags = diagnoseResponse({ status: 200, body: "not base64!!", encodedBody: true });
    // Then - one HF305 on the body
    expect(codes(diags)).toEqual(["HF305"]);
  });

  it("accepts valid padded base64", () => {
    // Given - "hello" base64-encoded
    expect(diagnoseResponse({ status: 200, body: "aGVsbG8=", encodedBody: true })).toEqual([]);
  });

  it("accepts an empty body (decodes to empty) and ignores when encodedBody is false", () => {
    // Given - empty body / encodedBody false
    expect(diagnoseResponse({ status: 200, body: "", encodedBody: true })).toEqual([]);
    expect(diagnoseResponse({ status: 200, body: "not base64!!", encodedBody: false })).toEqual([]);
  });
});

describe("HF306 — negative fixedDelay", () => {
  it("warns on a negative fixedDelay and is silent on >= 0", () => {
    // Given - negative delay
    expect(codes(diagnoseResponse({ status: 200, fixedDelay: -100 }))).toEqual(["HF306"]);
    // Given - zero and positive delay (both ignored / valid)
    expect(diagnoseResponse({ status: 200, fixedDelay: 0 })).toEqual([]);
    expect(diagnoseResponse({ status: 200, fixedDelay: 250 })).toEqual([]);
  });
});

describe("HF307 — logNormalDelay constraints", () => {
  it("accepts a valid log-normal delay", () => {
    // Given - min<=median<=mean<=max, all > 0
    expect(
      diagnoseResponse({
        status: 200,
        logNormalDelay: { min: 10, max: 100, mean: 50, median: 40 },
      }),
    ).toEqual([]);
  });

  it("warns when mean or median <= 0", () => {
    // Given - mean 0 (Go: mean <= 0 fails)
    const diags = diagnoseResponse({ status: 200, logNormalDelay: { mean: 0, median: 5 } });
    expect(codes(diags)).toEqual(["HF307"]);
    expect(diags[0]?.message.toLowerCase()).toContain("mean");
  });

  it("warns when min is negative", () => {
    // Given - negative min
    const diags = diagnoseResponse({
      status: 200,
      logNormalDelay: { min: -1, max: 100, mean: 50, median: 40 },
    });
    expect(codes(diags)).toEqual(["HF307"]);
  });

  it("warns when max < min", () => {
    // Given - max below min
    const diags = diagnoseResponse({
      status: 200,
      logNormalDelay: { min: 100, max: 10, mean: 50, median: 40 },
    });
    expect(codes(diags)).toEqual(["HF307"]);
  });

  it("warns when median > mean", () => {
    // Given - median above mean (no max bound)
    const diags = diagnoseResponse({
      status: 200,
      logNormalDelay: { mean: 30, median: 50 },
    });
    expect(codes(diags)).toEqual(["HF307"]);
    expect(diags[0]?.message.toLowerCase()).toContain("median");
  });
});

describe("HF3xx — exported rule shape", () => {
  it("declares the seven HF3xx codes and never throws on a malformed model", () => {
    // Given - the rule's advertised codes
    expect(hf3xxResponseRule.codes).toEqual([
      "HF301",
      "HF302",
      "HF303",
      "HF304",
      "HF305",
      "HF306",
      "HF307",
    ]);
    // Then - running over junk input yields no throw and no diagnostics
    expect(hf3xxResponseRule.run(contextOf(`{"data":123}`))).toEqual([]);
  });
});
