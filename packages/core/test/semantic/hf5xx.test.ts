/**
 * Focused unit tests for the HF5xx templating rule. They build a {@link RuleContext} via the
 * framework helper and run the exported rule directly. Coverage spans every code, the
 * source-map-into-document mapping, the body-vs-headers templated scope, and the precision
 * rules (HF501 only when not templated; HF510 for variables[].function built-ins; etc.).
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf5xxTemplateRule } from "../../src/semantic/rules/hf5xx.js";

const ls = getLanguageService({});

/** Run the HF5xx rule over a full simulation object. */
function run(sim: unknown) {
  const text = JSON.stringify(sim, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  const context = createRuleContext(doc, ls.parseJSONDocument(doc));
  return hf5xxTemplateRule.run(context);
}

/** Run with a single pair whose response is `response`, plus optional top-level `data` extras. */
function runResponse(response: unknown, dataExtras: Record<string, unknown> = {}) {
  return run({
    data: {
      pairs: [{ request: { path: [{ matcher: "exact", value: "/x" }] }, response }],
      ...dataExtras,
    },
    meta: { schemaVersion: "v5.3" },
  });
}

function codes(diagnostics: ReturnType<typeof run>): string[] {
  return diagnostics.map((d) => String(d.code));
}

describe("HF501 — template syntax in a non-templated body", () => {
  it("warns when {{ }} appears and templated is absent", () => {
    // Given - a body with template syntax but no templated flag
    const diags = runResponse({ status: 200, body: "Hi {{name}}" });
    // Then - one HF501 warning
    expect(codes(diags)).toEqual(["HF501"]);
    expect(diags[0]?.message).toContain("sent literally");
  });

  it("warns when templated is explicitly false", () => {
    // Given - templated: false with template syntax
    const diags = runResponse({ status: 200, body: "{{now}}", templated: false });
    // Then - HF501 fires
    expect(codes(diags)).toEqual(["HF501"]);
  });

  it("does NOT warn when templated is true (analysis takes over instead)", () => {
    // Given - a valid templated body
    const diags = runResponse({ status: 200, body: "{{randomString}}", templated: true });
    // Then - no HF501 and no analysis findings
    expect(codes(diags)).toEqual([]);
  });

  it("does NOT warn on a plain non-template body", () => {
    // Given - a literal body, no mustaches
    const diags = runResponse({ status: 200, body: "plain text" });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("points HF501 at the first mustache, source-mapped through escapes", () => {
    // Given - a body where a JSON escape precedes the mustache
    const diags = runResponse({ status: 200, body: "a\\nb {{x}}" });
    // Then - the range covers exactly the two `{` characters of the first mustache
    expect(codes(diags)).toEqual(["HF501"]);
    const range = diags[0]?.range;
    expect(range && range.end.character - range.start.character).toBe(2);
  });
});

describe("HF502 — parse errors via doValidation glue", () => {
  it("reports an unclosed mustache in a templated body", () => {
    // Given - templated body with an unclosed mustache
    const diags = runResponse({ status: 200, body: "{{oops", templated: true });
    // Then - HF502 fires with the parser message
    expect(codes(diags)).toContain("HF502");
  });
});

describe("HF503 — unknown helper", () => {
  it("flags an unknown helper call in a templated body", () => {
    // Given - an unknown helper with args
    const diags = runResponse({ status: 200, body: "{{bogus 'x'}}", templated: true });
    // Then - HF503 referencing the name
    expect(codes(diags)).toEqual(["HF503"]);
    expect(diags[0]?.message).toContain("bogus");
  });

  it("does NOT flag {{State.foo}} as an unknown helper", () => {
    // Given - a State path lookup in a templated body
    const diags = runResponse({ status: 200, body: "{{State.foo}}", templated: true });
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF504 — arity", () => {
  it("flags wrong arity in a templated body", () => {
    // Given - replace with too few args
    const diags = runResponse({ status: 200, body: "{{replace 'a'}}", templated: true });
    // Then - HF504
    expect(codes(diags)).toEqual(["HF504"]);
  });
});

describe("HF505 / HF506 — Vars / Literals resolution against data", () => {
  it("resolves Vars against data.variables[].name", () => {
    // Given - Vars.id used, with id declared in data.variables
    const diags = runResponse(
      { status: 200, body: "{{Vars.id}}", templated: true },
      { variables: [{ name: "id", function: "randomUuid" }] },
    );
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("flags an unresolved Vars.X", () => {
    // Given - Vars.missing with no matching variable
    const diags = runResponse({ status: 200, body: "{{Vars.missing}}", templated: true });
    // Then - HF505
    expect(codes(diags)).toEqual(["HF505"]);
  });

  it("flags an unresolved Literals.X", () => {
    // Given - Literals.gone with no matching literal
    const diags = runResponse({ status: 200, body: "{{Literals.gone}}", templated: true });
    // Then - HF506
    expect(codes(diags)).toEqual(["HF506"]);
  });
});

describe("HF507 / HF508 — faker", () => {
  it("flags an unknown faker type", () => {
    // Given - a misspelled faker type
    const diags = runResponse({ status: 200, body: "{{faker 'Nope'}}", templated: true });
    // Then - HF507
    expect(codes(diags)).toEqual(["HF507"]);
  });

  it("flags a parameterized faker method", () => {
    // Given - faker 'Sentence' (needs args)
    const diags = runResponse({ status: 200, body: "{{faker 'Sentence'}}", templated: true });
    // Then - HF508
    expect(codes(diags)).toEqual(["HF508"]);
  });
});

describe("HF509 — now offsets", () => {
  it("flags an invalid now offset unit", () => {
    // Given - now '2w'
    const diags = runResponse({ status: 200, body: "{{now '2w'}}", templated: true });
    // Then - HF509
    expect(codes(diags)).toEqual(["HF509"]);
  });
});

describe("headers are templated too (report 01 §8)", () => {
  it("analyses a templated header value", () => {
    // Given - a header with an unknown helper, templated response
    const diags = runResponse({
      status: 200,
      templated: true,
      headers: { "X-Id": ["{{bogus 'x'}}"] },
    });
    // Then - HF503 fires for the header value
    expect(codes(diags)).toEqual(["HF503"]);
  });

  it("does NOT analyse header values when not templated", () => {
    // Given - template syntax in a header but templated is absent
    const diags = runResponse({ status: 200, headers: { "X-Id": ["{{bogus 'x'}}"] } });
    // Then - nothing fires (HF501 targets the body only, headers are silent)
    expect(codes(diags)).toEqual([]);
  });
});

describe("HF510 — data.variables[].function must be a Hoverfly helper", () => {
  it("flags a raymond block built-in used as a function", () => {
    // Given - a variable whose function is the block built-in `each`
    const diags = runResponse(
      { status: 200 },
      { variables: [{ name: "v", function: "each", arguments: [] }] },
    );
    // Then - HF510
    expect(codes(diags)).toEqual(["HF510"]);
    expect(diags[0]?.message).toContain("block built-ins");
  });

  it("accepts a valid Hoverfly helper function", () => {
    // Given - function: faker (a Hoverfly helper)
    const diags = runResponse(
      { status: 200 },
      { variables: [{ name: "v", function: "faker", arguments: ["Name"] }] },
    );
    // Then - nothing fires
    expect(codes(diags)).toEqual([]);
  });

  it("flags an unknown function name too", () => {
    // Given - function: notAHelper
    const diags = runResponse(
      { status: 200 },
      { variables: [{ name: "v", function: "notAHelper" }] },
    );
    // Then - HF510 (only the 52 Hoverfly helpers are accepted)
    expect(codes(diags)).toEqual(["HF510"]);
  });
});

describe("rich valid templates stay silent", () => {
  it("nested #each with @index, subexpression math, faker, Vars+Literals, now", () => {
    // Given - a dense but fully-valid templated body with all the moving parts
    const body =
      "{{#each (csvAsMap 'pets')}}{{@index}}:{{this.name}}{{#unless @last}},{{/unless}}{{/each}}" +
      "{{multiply (Vars.price) '2' '0.00'}}{{faker 'Email'}}{{Literals.brand}}{{now '-1d' 'unix'}}";
    const diags = runResponse(
      { status: 200, body, templated: true },
      {
        variables: [{ name: "price", function: "randomInteger" }],
        literals: [{ name: "brand", value: "acme" }],
      },
    );
    // Then - zero diagnostics
    expect(codes(diags)).toEqual([]);
  });
});
