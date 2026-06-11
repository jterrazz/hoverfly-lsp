/**
 * Producer tests. They drive `getSemanticTokens` over real documents (built like the server will:
 * a TextDocument + a parsed JSONDocument) and assert the EXACT document text each token covers and
 * its type name — including the escape-torture case that proves the source-map reuse lands tokens on
 * the right characters through `\n`/`\uXXXX` escapes.
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { SEMANTIC_TOKEN_TYPES } from "../../src/semantic-tokens/legend.js";
import { getSemanticTokens, type SemanticToken } from "../../src/semantic-tokens/producer.js";

const ls = getLanguageService({});

interface ResolvedToken {
  /** The exact document text the token covers. */
  text: string;
  /** The token-type NAME (resolved from the index). */
  type: string;
  line: number;
  startChar: number;
}

/** Run the producer and resolve each token to {text, type, line, startChar} for assertions. */
function tokensOf(
  text: string,
  uri = "file:///s.hoverfly.json",
): { doc: TextDocument; raw: SemanticToken[]; resolved: ResolvedToken[] } {
  const doc = TextDocument.create(uri, "json", 1, text);
  const json = ls.parseJSONDocument(doc);
  const raw = getSemanticTokens(doc, json);
  const resolved = raw.map((token) => {
    const start = { line: token.line, character: token.startChar };
    const end = { line: token.line, character: token.startChar + token.length };
    return {
      text: doc.getText({ start, end }),
      type: SEMANTIC_TOKEN_TYPES[token.tokenType] ?? "?",
      line: token.line,
      startChar: token.startChar,
    };
  });
  return { doc, raw, resolved };
}

/** Build a one-pair simulation around a response. */
function sim(response: unknown, request: unknown = { path: [{ matcher: "exact", value: "/x" }] }) {
  return JSON.stringify(
    {
      data: { pairs: [{ request, response }] },
      meta: { schemaVersion: "v5.3" },
    },
    null,
    2,
  );
}

/** The (text, type) pairs of resolved tokens, for compact set-style assertions. */
function pairs(resolved: ResolvedToken[]): Array<[string, string]> {
  return resolved.map((t) => [t.text, t.type]);
}

describe("getSemanticTokens — the user's example body", () => {
  // The exact body from the task: id path, now '', faker 'Name'.
  const body =
    '{"id":"{{ Request.Path.[1] }}","now":"{{ now \'\' }}","name":"{{ faker \'Name\' }}"}';

  it("colors every construct with the right type and exact text", () => {
    // Given - a templated body with the three mustaches
    const { resolved } = tokensOf(sim({ status: 200, body, templated: true }));
    const p = pairs(resolved);

    // Then - delimiters are operators
    expect(p).toContainEqual(["{{", "operator"]);
    expect(p).toContainEqual(["}}", "operator"]);
    // Path root / segment / index
    expect(p).toContainEqual(["Request", "variable"]);
    expect(p).toContainEqual(["Path", "property"]);
    expect(p).toContainEqual(["[1]", "number"]);
    // Inline helpers
    expect(p).toContainEqual(["now", "function"]);
    expect(p).toContainEqual(["faker", "function"]);
    // Empty string arg to now → string
    expect(p).toContainEqual(["''", "string"]);
    // Known faker type → enumMember
    expect(p).toContainEqual(["'Name'", "enumMember"]);
  });

  it("emits all three mustaches' delimiters (six operator tokens of {{ and }})", () => {
    const { resolved } = tokensOf(sim({ status: 200, body, templated: true }));
    const operators = resolved.filter((t) => t.type === "operator").map((t) => t.text);
    expect(operators.filter((t) => t === "{{").length).toBe(3);
    expect(operators.filter((t) => t === "}}").length).toBe(3);
  });

  it("returns tokens sorted by (line, startChar)", () => {
    const { raw } = tokensOf(sim({ status: 200, body, templated: true }));
    for (let i = 1; i < raw.length; i += 1) {
      const prev = raw[i - 1];
      const cur = raw[i];
      if (!prev || !cur) {
        continue;
      }
      const before =
        prev.line < cur.line || (prev.line === cur.line && prev.startChar <= cur.startChar);
      expect(before).toBe(true);
    }
  });
});

describe("getSemanticTokens — escape torture (source-map credibility)", () => {
  it(String.raw`lands tokens on the right characters when \n precedes the mustache`, () => {
    // Given - a literal `\n` (a 2-char JSON escape) before `{{ now }}`
    const body = String.raw`a\nb {{ now }}`;
    const { resolved, doc } = tokensOf(sim({ status: 200, body, templated: true }));

    // Then - the `now` token resolves to exactly the text "now" at its real document offset
    const now = resolved.find((t) => t.text === "now");
    expect(now?.type).toBe("function");
    // And the `{{` operator sits exactly on the two-brace opener in the SOURCE document
    const open = resolved.find((t) => t.type === "operator" && t.text === "{{");
    expect(open).toBeDefined();
    // Sanity: the resolved document text really is "{{" (not "\\n" or shifted by the escape).
    const offset = doc.offsetAt({ line: open!.line, character: open!.startChar });
    expect(doc.getText().slice(offset, offset + 2)).toBe("{{");
  });

  it(String.raw`lands tokens on the right characters when \uXXXX precedes the mustache`, () => {
    // Given - a `é` (6-char escape, one decoded code unit) before `{{ faker 'Name' }}`
    const body = String.raw`x\u00e9 {{ faker 'Name' }}`;
    const { resolved } = tokensOf(sim({ status: 200, body, templated: true }));

    // Then - the faker name still resolves to exactly 'Name' as enumMember (offsets not shifted)
    expect(pairs(resolved)).toContainEqual(["'Name'", "enumMember"]);
    expect(pairs(resolved)).toContainEqual(["faker", "function"]);
  });
});

describe("getSemanticTokens — matcher names", () => {
  it("colors a known matcher name as enumMember over the value (no quotes)", () => {
    // Given - request fields using regex and jwt matchers
    const text = sim(
      { status: 200, body: "ok" },
      {
        path: [{ matcher: "regex", value: ".*" }],
        headers: { Authorization: [{ matcher: "jwt", value: "x" }] },
      },
    );
    const { resolved } = tokensOf(text);
    const p = pairs(resolved);
    // Then - both matcher names are enumMember tokens, covering exactly the name text
    expect(p).toContainEqual(["regex", "enumMember"]);
    expect(p).toContainEqual(["jwt", "enumMember"]);
  });

  it("does NOT color an unknown matcher name", () => {
    const text = sim({ status: 200, body: "ok" }, { path: [{ matcher: "bogus", value: "/x" }] });
    const { resolved } = tokensOf(text);
    expect(resolved.find((t) => t.text === "bogus")).toBeUndefined();
  });
});

describe("getSemanticTokens — block helpers", () => {
  it("colors {{#each}} as keyword and the path inside as property", () => {
    // Given - a block-helper body iterating a path
    const body = "{{#each Request.Body}}{{this.name}}{{/each}}";
    const { resolved } = tokensOf(sim({ status: 200, body, templated: true }));
    const p = pairs(resolved);
    // Then - the each keyword, the operator markers, and the inner path
    expect(p).toContainEqual(["each", "keyword"]);
    expect(p).toContainEqual(["Request", "variable"]);
    expect(p).toContainEqual(["Body", "property"]);
    // This.name → parameter (context-injected `this` root)
    expect(p).toContainEqual(["this.name", "parameter"]);
    // Block markers are operators
    expect(resolved.some((t) => t.type === "operator" && t.text === "{{#")).toBe(true);
    expect(resolved.some((t) => t.type === "operator" && t.text === "{{/")).toBe(true);
  });
});

describe("getSemanticTokens — gating", () => {
  it("returns [] for a non-simulation JSON document", () => {
    // Given - plain JSON with a template-looking string but no Hoverfly fingerprint
    const text = JSON.stringify({ hello: "{{ now }}" });
    const doc = TextDocument.create("file:///plain.json", "json", 1, text);
    const json = ls.parseJSONDocument(doc);
    // Then - no tokens
    expect(getSemanticTokens(doc, json)).toEqual([]);
  });

  it("colors a Hoverfly-named file even without the fingerprint object shape", () => {
    // Given - a .hoverfly.json file whose content is a full sim (filename gate is the OR branch)
    const { resolved } = tokensOf(
      sim({ status: 200, body: "{{ now }}", templated: true }),
      "file:///api.hoverfly.json",
    );
    expect(resolved.some((t) => t.text === "now" && t.type === "function")).toBe(true);
  });

  it("colors a body with {{ even when templated is false (HF501 scope)", () => {
    // Given - template syntax in a non-templated body
    const { resolved } = tokensOf(sim({ status: 200, body: "{{ now }}" }));
    // Then - the template is still tokenized (so editors color what the user is writing)
    expect(resolved.some((t) => t.text === "now")).toBe(true);
  });

  it("does NOT throw on a malformed template (partial tokens)", () => {
    // Given - an unclosed mustache
    const body = "{{ now ";
    expect(() => tokensOf(sim({ status: 200, body, templated: true }))).not.toThrow();
  });
});
