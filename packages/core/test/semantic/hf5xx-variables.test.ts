/**
 * Focused unit tests for the HF5xx variables/structural rule (`hf5xx-variables.ts`):
 *   - HF510 (built-in function) vs HF511 (otherwise-unknown function) precedence,
 *   - HF512 arity vs the helper's HelperSpec (fixed / variadic / requestBody),
 *   - HF214 templatable-name charset on variables AND literals,
 *   - HF213 destination full-URL (exact/default matcher only).
 * They build a RuleContext via the framework helper and run the exported rule directly.
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf5xxVariablesRule } from "../../src/semantic/rules/hf5xx-variables.js";

const ls = getLanguageService({});

function run(sim: unknown) {
  const text = JSON.stringify(sim, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  const context = createRuleContext(doc, ls.parseJSONDocument(doc));
  return hf5xxVariablesRule.run(context);
}

/** Build a one-pair simulation with the given `data` extras (variables/literals) and request. */
function runData(dataExtras: Record<string, unknown>, request: unknown = {}) {
  return run({
    data: { pairs: [{ request, response: { status: 200 } }], ...dataExtras },
    meta: { schemaVersion: "v5.3" },
  });
}

function codes(diagnostics: ReturnType<typeof run>): string[] {
  return diagnostics.map((d) => String(d.code));
}

describe("HF510 / HF511 — variable function precedence", () => {
  it("HF510 for a raymond block built-in, never HF511", () => {
    // Given - function: each (a block built-in)
    const diags = runData({ variables: [{ name: "v", function: "each" }] });
    // Then - HF510 ONLY (the two are mutually exclusive)
    expect(codes(diags)).toEqual(["HF510"]);
    expect(diags[0]?.message).toContain("block built-ins");
  });

  it("HF511 for an otherwise-unknown function, never HF510", () => {
    // Given - a fictional function name
    const diags = runData({ variables: [{ name: "v", function: "notAHelper" }] });
    // Then - HF511 ONLY, naming the function
    expect(codes(diags)).toEqual(["HF511"]);
    expect(diags[0]?.message).toContain("notAHelper");
    expect(diags[0]?.message).toContain("rejects the import");
  });

  it("HF511 for a near-miss misspelling of a real helper", () => {
    // Given - randomStringLenght (typo)
    const diags = runData({ variables: [{ name: "v", function: "randomStringLenght" }] });
    // Then - HF511
    expect(codes(diags)).toEqual(["HF511"]);
  });

  it("accepts a valid Hoverfly helper function (no HF510/HF511)", () => {
    // Given - function: randomUuid (zero-arg helper)
    const diags = runData({ variables: [{ name: "v", function: "randomUuid" }] });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("ignores a missing/non-string function (schema's concern)", () => {
    // Given - no function key
    const diags = runData({ variables: [{ name: "v" }] });
    // Then - HF510/HF511 stay silent (HF102 owns "function is required")
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF512 — argument arity vs the helper's HelperSpec", () => {
  it("flags too few args for a fixed-arity helper", () => {
    // Given - requestBody needs exactly 2, given 1
    const diags = runData({
      variables: [{ name: "v", function: "requestBody", arguments: ["jsonpath"] }],
    });
    // Then - HF512 reporting expected 2, got 1
    expect(codes(diags)).toEqual(["HF512"]);
    expect(diags[0]?.message).toContain("requestBody");
    expect(diags[0]?.message).toContain("2");
    expect(diags[0]?.message).toContain("renders empty");
  });

  it("flags too many args for a fixed-arity helper", () => {
    // Given - randomStringLength needs 1, given 2
    const diags = runData({
      variables: [{ name: "v", function: "randomStringLength", arguments: ["5", "6"] }],
    });
    // Then - HF512
    expect(codes(diags)).toEqual(["HF512"]);
  });

  it("treats missing arguments as zero args", () => {
    // Given - randomStringLength (arity 1) with no arguments key
    const diags = runData({ variables: [{ name: "v", function: "randomStringLength" }] });
    // Then - HF512 (0 ≠ 1)
    expect(codes(diags)).toEqual(["HF512"]);
  });

  it("accepts exact arity", () => {
    // Given - requestBody with exactly 2 args
    const diags = runData({
      variables: [{ name: "v", function: "requestBody", arguments: ["jsonpath", "$.id"] }],
    });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("enforces only a minimum for variadic helpers", () => {
    // Given - concat (variadic, min 0) with several args
    const diags = runData({
      variables: [{ name: "v", function: "concat", arguments: ["a", "b", "c"] }],
    });
    // Then - no arity diagnostic
    expect(codes(diags)).toEqual([]);
  });

  it("does NOT arity-check an unknown function (HF511 owns that)", () => {
    // Given - an unknown function with wrong-looking args
    const diags = runData({ variables: [{ name: "v", function: "nope", arguments: [] }] });
    // Then - HF511 only, no HF512
    expect(codes(diags)).toEqual(["HF511"]);
  });
});

describe("HF214 — templatable name charset", () => {
  it("flags a variable name with a dot", () => {
    // Given - a name that breaks {{Vars.<name>}}
    const diags = runData({ variables: [{ name: "my.var", function: "randomUuid" }] });
    // Then - HF214 naming it
    expect(codes(diags)).toEqual(["HF214"]);
    expect(diags[0]?.message).toContain("my.var");
  });

  it("flags a literal name with a space", () => {
    // Given - a literal name with a space
    const diags = runData({ literals: [{ name: "my name", value: "x" }] });
    // Then - HF214
    expect(codes(diags)).toEqual(["HF214"]);
  });

  it("accepts a word-char-only name on both variables and literals", () => {
    // Given - clean names
    const diags = runData({
      variables: [{ name: "user_id", function: "randomUuid" }],
      literals: [{ name: "brand1", value: "acme" }],
    });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF213 — destination full URL", () => {
  it("flags an exact destination value containing a scheme", () => {
    // Given - destination exact with a pasted full URL
    const diags = runData(
      {},
      { destination: [{ matcher: "exact", value: "http://api.example.com/v1" }] },
    );
    // Then - HF213 (info) naming the value
    expect(codes(diags)).toEqual(["HF213"]);
    expect(diags[0]?.message).toContain("http://api.example.com/v1");
  });

  it("flags a default (no matcher) destination value containing ://", () => {
    // Given - destination with a bare value (default exact)
    const diags = runData({}, { destination: [{ value: "https://host/path" }] });
    // Then - HF213
    expect(codes(diags)).toEqual(["HF213"]);
  });

  it("does NOT flag a glob/regex destination (slashes may be intentional)", () => {
    // Given - a glob destination with ://
    const diags = runData({}, { destination: [{ matcher: "glob", value: "http://*" }] });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("does NOT flag a bare host[:port] exact destination", () => {
    // Given - a correct host:port destination
    const diags = runData(
      {},
      { destination: [{ matcher: "exact", value: "api.example.com:443" }] },
    );
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("does NOT flag :// on a non-destination field (e.g. path)", () => {
    // Given - a path exact with a URL-shaped value
    const diags = runData({}, { path: [{ matcher: "exact", value: "http://x" }] });
    // Then - HF213 is destination-only
    expect(codes(diags)).toEqual([]);
  });
});

describe("a valid variables+literals+destination block stays silent", () => {
  it("correct faker/requestBody arities, clean names, host:port destination", () => {
    // Given - everything correct
    const diags = runData(
      {
        variables: [
          { name: "id", function: "randomUuid" },
          { name: "userId", function: "requestBody", arguments: ["jsonpath", "$.id"] },
          { name: "name", function: "faker", arguments: ["Name"] },
        ],
        literals: [{ name: "brand", value: "acme" }],
      },
      { destination: [{ matcher: "exact", value: "api.example.com:8080" }] },
    );
    // Then - zero diagnostics
    expect(codes(diags)).toEqual([]);
  });
});
