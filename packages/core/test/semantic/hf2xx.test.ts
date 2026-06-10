/**
 * Focused unit tests for the HF2xx matcher rule. They construct a {@link RuleContext} via the
 * framework helper and run the exported rule directly, so they pass before the integrator wires
 * `HF2XX_RULES` into `ALL_RULES` (the golden runner stays red until then).
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf2xxMatcherRule } from "../../src/semantic/rules/hf2xx.js";

const ls = getLanguageService({});

/** Run the HF2xx rule over a simulation whose single pair has the given `request` object. */
function runOnRequest(request: unknown) {
  const sim = {
    data: { pairs: [{ request, response: { status: 200 } }] },
    meta: { schemaVersion: "v5.3" },
  };
  const text = JSON.stringify(sim, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  const context = createRuleContext(doc, ls.parseJSONDocument(doc));
  return hf2xxMatcherRule.run(context);
}

/** The set of codes emitted by a run, for terse assertions. */
function codes(diagnostics: ReturnType<typeof runOnRequest>): string[] {
  return diagnostics.map((d) => String(d.code));
}

describe("HF201 — unknown matcher", () => {
  it("flags an unregistered matcher name with a panic message on the name node", () => {
    // Given - a matcher whose name is not in the registry
    const diags = runOnRequest({ path: [{ matcher: "xform", value: "x" }] });
    // Then - one HF201 error referencing the name and the runtime panic
    expect(codes(diags)).toEqual(["HF201"]);
    expect(diags[0]?.code).toBe("HF201");
    expect(diags[0]?.message).toContain("xform");
    expect(diags[0]?.message).toContain("panics");
  });

  it("does not flag the empty-string default matcher name", () => {
    // Given - an explicit empty matcher name (the default exact matcher)
    // Then - no name diagnostic
    expect(codes(runOnRequest({ path: [{ matcher: "", value: "x" }] }))).toEqual([]);
  });

  it("does not flag a matcher with no matcher field (default exact)", () => {
    // Given - a matcher object with only a value
    // Then - nothing fires (default exact, string value)
    expect(codes(runOnRequest({ path: [{ value: "x" }] }))).toEqual([]);
  });
});

describe("HF202 — non-canonical casing", () => {
  it("hints the canonical lowercase for jsonPartial", () => {
    // Given - a known matcher in mixed case (lookup is case-insensitive)
    const diags = runOnRequest({ body: [{ matcher: "jsonPartial", value: "{}" }] });
    // Then - one HF202 hint pointing at the canonical name
    expect(codes(diags)).toEqual(["HF202"]);
    expect(diags[0]?.message).toContain("jsonpartial");
  });

  it("hints for upper-cased EXACT and still validates its value type", () => {
    // Given - EXACT (resolves to exact, string-only) with an object value
    const diags = runOnRequest({ path: [{ matcher: "EXACT", value: {} }] });
    // Then - both the casing hint AND the value-type error fire
    expect(codes(diags).sort()).toEqual(["HF202", "HF203"]);
  });
});

describe("HF203 — value type mismatch", () => {
  it("flags an object value on a string matcher", () => {
    // Given - exact (string-only) with an object value
    const diags = runOnRequest({ path: [{ matcher: "exact", value: {} }] });
    // Then - HF203 on the value, naming the expected type from the registry
    expect(codes(diags)).toEqual(["HF203"]);
    expect(diags[0]?.message).toContain("expects a string");
    expect(diags[0]?.message).toContain("never match");
  });

  it("flags a string value on the array matcher", () => {
    // Given - array (array-only) with a string value
    const diags = runOnRequest({ body: [{ matcher: "array", value: "a;b" }] });
    // Then - HF203 expecting a JSON array
    expect(codes(diags)).toEqual(["HF203"]);
    expect(diags[0]?.message).toContain("a JSON array");
  });

  it("does not flag a correct array value", () => {
    // Given - array with an array value
    // Then - nothing
    expect(codes(runOnRequest({ body: [{ matcher: "array", value: ["a", "b"] }] }))).toEqual([]);
  });
});

describe("HF204 — config on a non-array matcher", () => {
  it("flags config on exact, even when empty", () => {
    // Given - exact carrying a config object
    const diags = runOnRequest({ path: [{ matcher: "exact", value: "x", config: {} }] });
    // Then - HF204 error on the config node
    expect(codes(diags)).toEqual(["HF204"]);
    expect(diags[0]?.message).toContain('"array"');
  });

  it("does not flag config on the array matcher", () => {
    // Given - array with a valid boolean config
    const diags = runOnRequest({
      body: [{ matcher: "array", value: ["a"], config: { ignoreOrder: true } }],
    });
    // Then - nothing
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF205 — unknown array config key", () => {
  it("warns on an unrecognised config key", () => {
    // Given - array config with a typo'd key
    const diags = runOnRequest({
      body: [{ matcher: "array", value: ["a"], config: { ignoreCase: true } }],
    });
    // Then - HF205 warning naming the ignored key
    expect(codes(diags)).toEqual(["HF205"]);
    expect(diags[0]?.message).toContain("ignoreCase");
  });
});

describe("HF206 — non-boolean array config value", () => {
  it("flags a string config value as a panic", () => {
    // Given - array config whose value is the string "true"
    const diags = runOnRequest({
      body: [{ matcher: "array", value: ["a"], config: { ignoreOrder: "true" } }],
    });
    // Then - HF206 error describing the offending JSON type
    expect(codes(diags)).toEqual(["HF206"]);
    expect(diags[0]?.message).toContain("a string");
  });
});

describe("HF207 — negate with a non-string value", () => {
  it("warns about vacuous-true on a numeric negate value", () => {
    // Given - negate with a number value
    const diags = runOnRequest({ path: [{ matcher: "negate", value: 5 }] });
    // Then - HF207 (NOT HF203) — vacuous true
    expect(codes(diags)).toEqual(["HF207"]);
    expect(diags[0]?.message).toContain("vacuous");
  });

  it("does not flag negate with a string value", () => {
    // Given - negate with a string value
    // Then - nothing
    expect(codes(runOnRequest({ path: [{ matcher: "negate", value: "x" }] }))).toEqual([]);
  });
});

describe("HF208 — form mis-placed", () => {
  it("flags lowercase form on a header field", () => {
    // Given - form on a header (object value), not the body
    const diags = runOnRequest({
      headers: { "Content-Type": [{ matcher: "form", value: { a: [] } }] },
    });
    // Then - HF208 error (panics elsewhere than body)
    expect(codes(diags)).toEqual(["HF208"]);
    expect(diags[0]?.message).toContain("body");
  });

  it("flags form inside a doMatch chain even on the body", () => {
    // Given - a body jsonpath whose doMatch nests a form matcher
    const diags = runOnRequest({
      body: [
        {
          matcher: "jsonpath",
          value: "$.x",
          doMatch: [{ matcher: "form", value: { a: [] } }],
        },
      ],
    });
    // Then - HF208 for the nested form (jsonpath itself is valid, no HF210)
    expect(codes(diags)).toEqual(["HF208"]);
  });

  it("does not flag lowercase form on the body top level", () => {
    // Given - form correctly placed on body with an object value
    const diags = runOnRequest({
      body: [{ matcher: "form", value: { username: [{ matcher: "exact", value: "a" }] } }],
    });
    // Then - nothing
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF209 — wrong-case form", () => {
  it("flags Form (case-sensitive) on the body", () => {
    // Given - Form (capital F) on the body
    const diags = runOnRequest({ body: [{ matcher: "Form", value: { a: [] } }] });
    // Then - HF209 error naming the offending spelling
    expect(codes(diags)).toEqual(["HF209"]);
    expect(diags[0]?.message).toContain("Form");
    expect(diags[0]?.message).toContain("case-sensitive");
  });

  it("flags FORM regardless of placement", () => {
    // Given - FORM on a header field
    const diags = runOnRequest({ headers: { X: [{ matcher: "FORM", value: { a: [] } }] } });
    // Then - HF209 (case dominates placement)
    expect(codes(diags)).toEqual(["HF209"]);
  });
});

describe("HF210 — doMatch after an identity matcher", () => {
  it("hints that a chain after exact is an AND on one value", () => {
    // Given - exact with a doMatch chain (exact does not transform the value)
    const diags = runOnRequest({
      path: [{ matcher: "exact", value: "/x", doMatch: [{ matcher: "glob", value: "/*" }] }],
    });
    // Then - HF210 hint on the doMatch key, naming the identity matcher
    expect(codes(diags)).toEqual(["HF210"]);
    expect(diags[0]?.message).toContain("exact");
  });

  it("does not hint after a transforming matcher (jsonpath)", () => {
    // Given - jsonpath (transforms the value) with a doMatch chain
    const diags = runOnRequest({
      body: [{ matcher: "jsonpath", value: "$.x", doMatch: [{ matcher: "exact", value: "y" }] }],
    });
    // Then - no HF210 (and the nested exact/string is valid)
    expect(codes(diags)).toEqual([]);
  });

  it("recurses: HF210 fires at every identity level of a chain", () => {
    // Given - exact -> exact -> exact nested doMatch chain
    const diags = runOnRequest({
      path: [
        {
          matcher: "exact",
          value: "a",
          doMatch: [{ matcher: "exact", value: "b", doMatch: [{ matcher: "exact", value: "c" }] }],
        },
      ],
    });
    // Then - two HF210 hints (one per matcher that owns a doMatch)
    expect(codes(diags)).toEqual(["HF210", "HF210"]);
  });
});

describe("HF211 — empty value that never matches", () => {
  it("warns on an empty regex value", () => {
    // Given - regex with an empty-string value
    const diags = runOnRequest({ path: [{ matcher: "regex", value: "" }] });
    // Then - HF211 warning
    expect(codes(diags)).toEqual(["HF211"]);
    expect(diags[0]?.message).toContain("regex");
  });

  it("warns on an empty jwtjsonpath value", () => {
    // Given - jwtjsonpath rejects empty
    const diags = runOnRequest({ body: [{ matcher: "jwtjsonpath", value: "" }] });
    // Then - HF211
    expect(codes(diags)).toEqual(["HF211"]);
  });

  it("does not flag an empty exact value (empty exact can legitimately match)", () => {
    // Given - exact with empty string
    // Then - nothing (HF211 only targets jwtjsonpath/regex/glob)
    expect(codes(runOnRequest({ path: [{ matcher: "exact", value: "" }] }))).toEqual([]);
  });
});

describe("placement / container shapes", () => {
  it("handles query as an object-of-arrays", () => {
    // Given - a query map whose key holds a matcher array with an unknown matcher
    const diags = runOnRequest({ query: { q: [{ matcher: "nope", value: "x" }] } });
    // Then - HF201 fires on the nested matcher (the model flattens the query map)
    expect(codes(diags)).toEqual(["HF201"]);
  });

  it("requiresState is not a matcher field and is ignored", () => {
    // Given - a request with requiresState (a state map, not matchers)
    const diags = runOnRequest({
      path: [{ matcher: "exact", value: "/x" }],
      requiresState: { authed: "true" },
    });
    // Then - no matcher diagnostics from the state map
    expect(codes(diags)).toEqual([]);
  });
});
