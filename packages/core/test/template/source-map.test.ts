import { describe, expect, it } from "vitest";

import { createStringSourceMap, type StringSourceMap } from "../../src/template/index.js";

/**
 * The JSON-escape-aware source map is the load-bearing piece for HF5xx ranges: it maps an
 * offset in the DECODED template string back to the document offset of the source character.
 * These tests exercise identity runs, every simple escape, `\uXXXX`, surrogate pairs/emoji, and
 * the realistic case of a mustache that lives after escapes inside a JSON string.
 */
describe("createStringSourceMap", () => {
  it("decodes a plain unescaped string and maps offsets through the quote at +1", () => {
    // Given - a JSON token `"hello"` placed at document offset 10
    const map: StringSourceMap = createStringSourceMap('"hello"', 10);
    // Then - content is decoded, and offset 0 maps to the first content char (doc 11)
    expect(map.decoded).toBe("hello");
    expect(map.toDocOffset(0)).toBe(11); // 'h'
    expect(map.toDocOffset(1)).toBe(12); // 'e'
    expect(map.toDocOffset(4)).toBe(15); // 'o'
    // End sentinel maps to the closing quote position.
    expect(map.toDocOffset(5)).toBe(16);
  });

  it("accepts an unquoted raw token (treats the whole token as content)", () => {
    // Given - no surrounding quotes
    const map = createStringSourceMap("abc", 0);
    // Then - identity mapping
    expect(map.decoded).toBe("abc");
    expect(map.toDocOffset(0)).toBe(0);
    expect(map.toDocOffset(2)).toBe(2);
    expect(map.toDocOffset(3)).toBe(3);
  });

  it(
    String.raw`maps a decoded char after a \n escape to the document offset past the escape`,
    () => {
      // Given - `"a\nb"`: source chars a(1) \(2) n(3) b(4), at doc offset 0
      const map = createStringSourceMap(String.raw`"a\nb"`, 0);
      // Then - decoded is "a\nb"; 'b' (decoded index 2) sits at the source 'b' (doc 4)
      expect(map.decoded).toBe("a\nb");
      expect(map.toDocOffset(0)).toBe(1); // 'a'
      expect(map.toDocOffset(1)).toBe(2); // '\n' -> the backslash
      expect(map.toDocOffset(2)).toBe(4); // 'b'
    },
  );

  it("handles all eight simple escapes mapping each to its backslash", () => {
    // Given - every simple escape in sequence
    const map = createStringSourceMap(String.raw`"\"\\\/\b\f\n\r\t"`, 0);
    // Then - decoded has the eight resolved chars
    expect(map.decoded).toBe('"\\/\b\f\n\r\t');
    // Each decoded char originates from a 2-char escape; offsets step by 2 from doc 1.
    expect(map.toDocOffset(0)).toBe(1);
    expect(map.toDocOffset(1)).toBe(3);
    expect(map.toDocOffset(2)).toBe(5);
    expect(map.toDocOffset(7)).toBe(15);
  });

  it(String.raw`decodes \uXXXX escapes and maps the decoded char to the backslash`, () => {
    // Given - `"AZ"` -> "AZ"; the A is 6 source chars
    const map = createStringSourceMap(String.raw`"\u0041Z"`, 0);
    // Then
    expect(map.decoded).toBe("AZ");
    expect(map.toDocOffset(0)).toBe(1); // 'A' from the backslash at doc 1
    expect(map.toDocOffset(1)).toBe(7); // 'Z' after the 6-char escape
    expect(map.toDocOffset(2)).toBe(8); // End sentinel -> closing quote
  });

  it(String.raw`handles a surrogate pair written as two \uXXXX escapes (emoji)`, () => {
    // Given - 😀 = U+1F600 = 😀 (12 source chars) then 'x'
    const map = createStringSourceMap(String.raw`"\uD83D\uDE00x"`, 0);
    // Then - decoded is the emoji (2 UTF-16 units) + 'x'
    expect(map.decoded).toBe("😀x");
    expect(map.decoded.length).toBe(3); // 2 surrogate units + 1
    // High surrogate maps to the first backslash (doc 1), low to the second (doc 7).
    expect(map.toDocOffset(0)).toBe(1);
    expect(map.toDocOffset(1)).toBe(7);
    expect(map.toDocOffset(2)).toBe(13); // 'x' after both escapes
  });

  it("handles a literal (unescaped) emoji in the source as two identity-mapped units", () => {
    // Given - a raw emoji in the JSON content (2 code units), then 'y'
    const map = createStringSourceMap('"😀y"', 0);
    // Then - each surrogate half maps identity into the source
    expect(map.decoded).toBe("😀y");
    expect(map.toDocOffset(0)).toBe(1); // High surrogate
    expect(map.toDocOffset(1)).toBe(2); // Low surrogate
    expect(map.toDocOffset(2)).toBe(3); // 'y'
  });

  it(String.raw`maps a mustache that starts after a \n into the right document range`, () => {
    // Given - a body `"line1\n{{x}}"` (template after an escape), token at doc 100
    const raw = String.raw`"line1\n{{x}}"`;
    const map = createStringSourceMap(raw, 100);
    // Then - decoded is "line1\n{{x}}"
    expect(map.decoded).toBe("line1\n{{x}}");
    // The `{{` begins at decoded index 6; its source position is doc 100 + 8 (quote + 5 chars + 2-char \n).
    const mustacheDecodedStart = map.decoded.indexOf("{{");
    expect(mustacheDecodedStart).toBe(6);
    expect(map.toDocOffset(mustacheDecodedStart)).toBe(108);
    // The inner 'x' (decoded index 8) is at doc 110.
    expect(map.toDocOffset(8)).toBe(110);
  });

  it(String.raw`maps a mustache split across a \uXXXX-heavy prefix`, () => {
    // Given - two unicode escapes then a mustache
    const raw = String.raw`"\u0041\u0042{{Vars.x}}"`;
    const map = createStringSourceMap(raw, 0);
    // Then - decoded "AB{{Vars.x}}"; the `{` after the two 6-char escapes is at doc 13
    expect(map.decoded).toBe("AB{{Vars.x}}");
    const start = map.decoded.indexOf("{{");
    expect(start).toBe(2);
    expect(map.toDocOffset(start)).toBe(13); // 1 (quote) + 6 + 6
  });

  it("passes a malformed escape through literally and stays total", () => {
    // Given - a bad escape `\z` and a lone trailing backslash run
    const map = createStringSourceMap(String.raw`"a\zb"`, 0);
    // Then - the backslash is kept literally; mapping covers every decoded char
    expect(map.decoded).toBe(String.raw`a\zb`);
    expect(map.toDocOffset(0)).toBe(1); // 'a'
    expect(map.toDocOffset(1)).toBe(2); // '\\'
    expect(map.toDocOffset(2)).toBe(3); // 'z'
    expect(map.toDocOffset(3)).toBe(4); // 'b'
  });

  it("clamps out-of-range decoded offsets to the content bounds", () => {
    // Given - a short token at doc 5
    const map = createStringSourceMap('"hi"', 5);
    // Then - negatives clamp to first char, overshoot clamps to the end sentinel
    expect(map.toDocOffset(-3)).toBe(6);
    expect(map.toDocOffset(99)).toBe(8); // Closing quote position
  });

  it("treats an empty string token sensibly", () => {
    // Given - `""`
    const map = createStringSourceMap('""', 0);
    // Then - empty decoded, end sentinel at the closing quote
    expect(map.decoded).toBe("");
    expect(map.toDocOffset(0)).toBe(1);
  });
});
