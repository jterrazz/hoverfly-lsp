/**
 * The legend is a WIRE CONTRACT: the server advertises this exact ordered array and the producer
 * emits indices into it. These tests freeze the order and the name→index map so an accidental
 * reorder (which would mis-color every token) is caught.
 */

import { describe, expect, it } from "vitest";

import {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPE_INDEX,
  SEMANTIC_TOKEN_TYPES,
} from "../../src/semantic-tokens/legend.js";

describe("semantic-tokens legend", () => {
  it("freezes the exact ordered token-type array (research/16 §3.1)", () => {
    // Given/Then - the frozen order; any change here is a wire-contract break.
    expect([...SEMANTIC_TOKEN_TYPES]).toEqual([
      "namespace",
      "keyword",
      "function",
      "variable",
      "property",
      "parameter",
      "enumMember",
      "string",
      "number",
      "operator",
    ]);
  });

  it("has no modifiers in v1", () => {
    expect(SEMANTIC_TOKEN_MODIFIERS).toEqual([]);
  });

  it("uses only standard LSP token types", () => {
    // The 22 standard LSP 3.17 token types — using only these is what makes themes color us.
    const standard = new Set([
      "namespace",
      "type",
      "class",
      "enum",
      "interface",
      "struct",
      "typeParameter",
      "parameter",
      "variable",
      "property",
      "enumMember",
      "decorator",
      "event",
      "function",
      "method",
      "macro",
      "label",
      "comment",
      "string",
      "keyword",
      "number",
      "regexp",
      "operator",
    ]);
    for (const type of SEMANTIC_TOKEN_TYPES) {
      expect(standard.has(type)).toBe(true);
    }
  });

  it("maps every type name to its array index", () => {
    SEMANTIC_TOKEN_TYPES.forEach((name, index) => {
      expect(SEMANTIC_TOKEN_TYPE_INDEX[name]).toBe(index);
    });
  });
});
