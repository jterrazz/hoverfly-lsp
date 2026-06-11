/**
 * Focused unit tests for the HF23x matcher-value-SYNTAX rule (research/14). They build a
 * {@link RuleContext} and run the exported rule directly (like hf2xx.test.ts), so they pass
 * independent of when the integrator wires `MATCHER_SYNTAX_RULES` into `ALL_RULES`.
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import { matcherSyntaxRule } from "../../src/semantic/rules/matcher-syntax.js";

const ls = getLanguageService({});

/** Run the rule over a simulation whose single pair has the given `request` object. */
function runOnRequest(request: unknown) {
  const sim = {
    data: { pairs: [{ request, response: { status: 200 } }] },
    meta: { schemaVersion: "v5.3" },
  };
  const text = JSON.stringify(sim, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  const context = createRuleContext(doc, ls.parseJSONDocument(doc));
  return matcherSyntaxRule.run(context);
}

/** The codes a run emits, for terse assertions. */
function codes(diagnostics: ReturnType<typeof runOnRequest>): string[] {
  return diagnostics.map((d) => String(d.code));
}

describe("HF230 — invalid RE2 regex (via re2js, not new RegExp)", () => {
  it("flags an unbalanced-group pattern", () => {
    // Given - a pattern that fails to compile under RE2
    const diags = runOnRequest({ path: [{ matcher: "regex", value: "a(b" }] });
    // Then - one HF230 error
    expect(codes(diags)).toEqual(["HF230"]);
    expect(diags[0]?.message).toContain("RE2");
  });

  it("catches a lookbehind that is VALID in JS but invalid in RE2", () => {
    // Given - (?<=foo)bar compiles under new RegExp but Go's regexp rejects lookbehind
    const diags = runOnRequest({ path: [{ matcher: "regex", value: "(?<=foo)bar" }] });
    // Then - HF230 still fires (re2js is the real grammar; new RegExp would miss this)
    expect(codes(diags)).toEqual(["HF230"]);
  });

  it("catches a backreference (invalid in RE2)", () => {
    // Given - \1 backreference, valid JS, rejected by RE2
    expect(codes(runOnRequest({ path: [{ matcher: "regex", value: "(x)\\1" }] }))).toEqual([
      "HF230",
    ]);
  });

  it("does NOT flag a Python-style named group (?P<n>…) — valid RE2, invalid JS", () => {
    // Given - (?P<id>…) which new RegExp would false-positive on
    const diags = runOnRequest({ path: [{ matcher: "regex", value: "(?P<id>[0-9]+)" }] });
    // Then - nothing (re2js accepts it, as Go does)
    expect(codes(diags)).toEqual([]);
  });

  it("does NOT flag a complex valid RE2 pattern", () => {
    // Given - a rich but valid pattern
    expect(
      codes(runOnRequest({ path: [{ matcher: "regex", value: "^/v[0-9]+/[a-z-]+(\\?.*)?$" }] })),
    ).toEqual([]);
  });

  it("defers an empty regex value to HF211 (no HF230)", () => {
    // Given - an empty regex value (HF211's territory)
    expect(codes(runOnRequest({ path: [{ matcher: "regex", value: "" }] }))).toEqual([]);
  });

  it("defers a non-string regex value to HF203 (no HF230)", () => {
    // Given - a numeric regex value (wrong type)
    expect(codes(runOnRequest({ path: [{ matcher: "regex", value: 5 }] }))).toEqual([]);
  });
});

describe("HF231 — json/jsonpartial/jwt value must be JSON text", () => {
  it("flags the motivating jwt $.username bug as an HF231 JSON-syntax error", () => {
    // Given - the exact Zed bug: jwt value is a JSONPath string, not JSON text
    const diags = runOnRequest({ body: [{ matcher: "jwt", value: "$.username" }] });
    // Then - HF231 (the JSON-syntax code), naming jwt
    expect(codes(diags)).toEqual(["HF231"]);
    expect(diags[0]?.message).toContain("jwt");
    expect(diags[0]?.message).toContain("JSON");
  });

  it("flags broken json text", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "json", value: "{not valid" }] }))).toEqual([
      "HF231",
    ]);
  });

  it("flags broken jsonpartial text", () => {
    expect(codes(runOnRequest({ path: [{ matcher: "jsonpartial", value: "{broken" }] }))).toEqual([
      "HF231",
    ]);
  });

  it("does NOT flag valid JSON text for json", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "json", value: '{"a":[1,2,3]}' }] }))).toEqual(
      [],
    );
  });

  it("does NOT flag a valid partial JSON spec for jwt", () => {
    // Given - a valid {"payload":…} partial spec
    expect(
      codes(
        runOnRequest({ body: [{ matcher: "jwt", value: '{"payload":{"username":"alice"}}' }] }),
      ),
    ).toEqual([]);
  });

  it("defers a non-string jwt value to HF203 (no HF231)", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "jwt", value: { payload: {} } }] }))).toEqual([]);
  });
});

describe("HF235 — jwt value with non-header/payload top-level keys", () => {
  it("warns when a top-level key is not header/payload", () => {
    // Given - valid JSON but {"username":…} can never match a JWT composite
    const diags = runOnRequest({ body: [{ matcher: "jwt", value: '{"username":"alice"}' }] });
    // Then - HF235 naming the offending key
    expect(codes(diags)).toEqual(["HF235"]);
    expect(diags[0]?.message).toContain("username");
  });

  it("does NOT warn for a header/payload-only spec", () => {
    expect(
      codes(
        runOnRequest({
          body: [{ matcher: "jwt", value: '{"header":{"alg":"HS256"},"payload":{"sub":"a"}}' }],
        }),
      ),
    ).toEqual([]);
  });

  it("does NOT warn for an empty object (matches any JWT)", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "jwt", value: "{}" }] }))).toEqual([]);
  });
});

describe("HF232 / HF233 — JSONPath / XPath balance lint", () => {
  it("warns on unbalanced jsonpath brackets", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "jsonpath", value: "$.a[0" }] }))).toEqual([
      "HF232",
    ]);
  });

  it("warns on unbalanced jwtjsonpath quotes", () => {
    expect(codes(runOnRequest({ path: [{ matcher: "jwtjsonpath", value: "$['sub" }] }))).toEqual([
      "HF232",
    ]);
  });

  it("warns on unbalanced xpath brackets", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "xpath", value: "//a[b='c" }] }))).toEqual([
      "HF233",
    ]);
  });

  it("does NOT warn on a balanced kubectl-style jsonpath with range braces", () => {
    expect(
      codes(runOnRequest({ body: [{ matcher: "jsonpath", value: "{range .items[*]}{.x}{end}" }] })),
    ).toEqual([]);
  });

  it("does NOT warn on a balanced xpath with predicates and quotes", () => {
    expect(
      codes(runOnRequest({ body: [{ matcher: "xpath", value: "//book[@id='42']/title" }] })),
    ).toEqual([]);
  });
});

describe("HF234 — XML well-formedness", () => {
  it("warns on malformed xml", () => {
    const diags = runOnRequest({ body: [{ matcher: "xml", value: "<a><b></a>" }] });
    expect(codes(diags)).toEqual(["HF234"]);
    expect(diags[0]?.message).toContain("xml");
  });

  it("does NOT warn on well-formed xml with CDATA and attributes", () => {
    expect(
      codes(
        runOnRequest({
          body: [{ matcher: "xml", value: '<o id="1"><n><![CDATA[a < b]]></n></o>' }],
        }),
      ),
    ).toEqual([]);
  });

  it("validates the XML skeleton of xmltemplated after neutralizing tokens", () => {
    // Given - xmltemplated whose XML is malformed (missing close) around template tokens
    const diags = runOnRequest({
      body: [{ matcher: "xmltemplated", value: "<a>{{ ignore }}<b></a>" }],
    });
    // Then - HF234 on the skeleton (tokens neutralized, not mistaken for bad XML)
    expect(codes(diags)).toEqual(["HF234"]);
  });

  it("does NOT warn on well-formed xmltemplated with ignore/regex leaves", () => {
    expect(
      codes(
        runOnRequest({
          body: [
            {
              matcher: "xmltemplated",
              value: "<u><id>{{ regex: [0-9]+ }}</id><n>{{ ignore }}</n></u>",
            },
          ],
        }),
      ),
    ).toEqual([]);
  });

  it("flags a bad {{ regex: … }} leaf inside xmltemplated as HF230 (RE2 reuse)", () => {
    // Given - well-formed XML skeleton but the regex leaf is invalid RE2 (lookbehind)
    const diags = runOnRequest({
      body: [{ matcher: "xmltemplated", value: "<u><id>{{ regex: (?<=x)y }}</id></u>" }],
    });
    // Then - HF230 (it IS a regex), not HF234 (the skeleton is well-formed)
    expect(codes(diags)).toEqual(["HF230"]);
  });
});

describe("HF236 — array elements must be strings", () => {
  it("warns once per non-string element with its index", () => {
    // Given - an array value mixing strings and non-strings
    const diags = runOnRequest({ body: [{ matcher: "array", value: ["a", 1, true, "b"] }] });
    // Then - two HF236 warnings (the number and the boolean), each naming its index
    expect(codes(diags)).toEqual(["HF236", "HF236"]);
    expect(diags[0]?.message).toContain("1");
    expect(diags[1]?.message).toContain("2");
  });

  it("does NOT warn on an all-string array", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "array", value: ["a", "b"] }] }))).toEqual([]);
  });

  it("defers a non-array array value to HF203 (no HF236)", () => {
    expect(codes(runOnRequest({ body: [{ matcher: "array", value: "a;b" }] }))).toEqual([]);
  });
});

describe("glob — deliberately silent (no invalid syntax exists)", () => {
  it("never flags any glob value", () => {
    // Given - glob values with chars that LOOK like extended-glob syntax (treated literally)
    expect(codes(runOnRequest({ path: [{ matcher: "glob", value: "*.example.com" }] }))).toEqual(
      [],
    );
    expect(codes(runOnRequest({ path: [{ matcher: "glob", value: "a[b?c\\d" }] }))).toEqual([]);
  });
});

describe("doMatch recursion", () => {
  it("checks syntax inside an object-shaped doMatch chain", () => {
    // Given - a jsonpath whose doMatch nests a jwt with a non-JSON value
    const diags = runOnRequest({
      body: [{ matcher: "jsonpath", value: "$.a", doMatch: { matcher: "jwt", value: "$.x" } }],
    });
    // Then - HF231 fires on the nested jwt value
    expect(codes(diags)).toEqual(["HF231"]);
  });
});
