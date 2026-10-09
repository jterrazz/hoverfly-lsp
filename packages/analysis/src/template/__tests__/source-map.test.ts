import { describe, expect, test } from 'vitest';

import { createStringSourceMap } from '../source-map.js';
import type { StringSourceMap } from '../source-map.js';

describe('createStringSourceMap', () => {
    test('decodes a plain unescaped string and maps offsets through the quote at +1', () => {
        // Given - a JSON token `"hello"` placed at document offset 10
        const map: StringSourceMap = createStringSourceMap('"hello"', 10);
        // Then - content is decoded, and offset 0 maps to the first content char (doc 11)
        expect(map.decoded).toBe('hello');
        expect(map.toDocOffset(0)).toBe(11);
        expect(map.toDocOffset(1)).toBe(12);
        expect(map.toDocOffset(4)).toBe(15);
        expect(map.toDocOffset(5)).toBe(16);
    });

    test('accepts an unquoted raw token (treats the whole token as content)', () => {
        // Given - no surrounding quotes
        const map = createStringSourceMap('abc', 0);
        // Then - identity mapping
        expect(map.decoded).toBe('abc');
        expect(map.toDocOffset(0)).toBe(0);
        expect(map.toDocOffset(2)).toBe(2);
        expect(map.toDocOffset(3)).toBe(3);
    });

    test(
        String.raw`maps a decoded char after a \n escape to the document offset past the escape`,
        () => {
            // Given - `"a\nb"`: source chars a(1) \(2) n(3) b(4), at doc offset 0
            const map = createStringSourceMap(String.raw`"a\nb"`, 0);
            // Then - decoded is "a\nb"; 'b' (decoded index 2) sits at the source 'b' (doc 4)
            expect(map.decoded).toBe('a\nb');
            expect(map.toDocOffset(0)).toBe(1);
            expect(map.toDocOffset(1)).toBe(2);
            expect(map.toDocOffset(2)).toBe(4);
        },
    );

    test('handles all eight simple escapes mapping each to its backslash', () => {
        // Given - every simple escape in sequence
        const map = createStringSourceMap(String.raw`"\"\\\/\b\f\n\r\t"`, 0);
        // Then - decoded has the eight resolved chars
        expect(map.decoded).toBe('"\\/\b\f\n\r\t');
        expect(map.toDocOffset(0)).toBe(1);
        expect(map.toDocOffset(1)).toBe(3);
        expect(map.toDocOffset(2)).toBe(5);
        expect(map.toDocOffset(7)).toBe(15);
    });

    test(String.raw`decodes \uXXXX escapes and maps the decoded char to the backslash`, () => {
        // Given - `"AZ"` -> "AZ"; the A is 6 source chars
        const map = createStringSourceMap(String.raw`"\u0041Z"`, 0);
        // Then
        expect(map.decoded).toBe('AZ');
        expect(map.toDocOffset(0)).toBe(1);
        expect(map.toDocOffset(1)).toBe(7);
        expect(map.toDocOffset(2)).toBe(8);
    });

    test(String.raw`handles a surrogate pair written as two \uXXXX escapes (emoji)`, () => {
        // Given - 😀 = U+1F600 = 😀 (12 source chars) then 'x'
        const map = createStringSourceMap(String.raw`"\uD83D\uDE00x"`, 0);
        // Then - decoded is the emoji (2 UTF-16 units) + 'x'
        expect(map.decoded).toBe('😀x');
        expect(map.decoded).toHaveLength(3);
        expect(map.toDocOffset(0)).toBe(1);
        expect(map.toDocOffset(1)).toBe(7);
        expect(map.toDocOffset(2)).toBe(13);
    });

    test('handles a literal (unescaped) emoji in the source as two identity-mapped units', () => {
        // Given - a raw emoji in the JSON content (2 code units), then 'y'
        const map = createStringSourceMap('"😀y"', 0);
        // Then - each surrogate half maps identity into the source
        expect(map.decoded).toBe('😀y');
        expect(map.toDocOffset(0)).toBe(1);
        expect(map.toDocOffset(1)).toBe(2);
        expect(map.toDocOffset(2)).toBe(3);
    });

    test(String.raw`maps a mustache that starts after a \n into the right document range`, () => {
        // Given - a body `"line1\n{{x}}"` (template after an escape), token at doc 100
        const raw = String.raw`"line1\n{{x}}"`;
        const map = createStringSourceMap(raw, 100);
        // Then - decoded is "line1\n{{x}}"
        expect(map.decoded).toBe('line1\n{{x}}');
        const mustacheDecodedStart = map.decoded.indexOf('{{');
        expect(mustacheDecodedStart).toBe(6);
        expect(map.toDocOffset(mustacheDecodedStart)).toBe(108);
        expect(map.toDocOffset(8)).toBe(110);
    });

    test(String.raw`maps a mustache split across a \uXXXX-heavy prefix`, () => {
        // Given - two unicode escapes then a mustache
        const raw = String.raw`"\u0041\u0042{{Vars.x}}"`;
        const map = createStringSourceMap(raw, 0);
        // Then - decoded "AB{{Vars.x}}"; the `{` after the two 6-char escapes is at doc 13
        expect(map.decoded).toBe('AB{{Vars.x}}');
        const start = map.decoded.indexOf('{{');
        expect(start).toBe(2);
        expect(map.toDocOffset(start)).toBe(13);
    });

    test('passes a malformed escape through literally and stays total', () => {
        // Given - a bad escape `\z` and a lone trailing backslash run
        const map = createStringSourceMap(String.raw`"a\zb"`, 0);
        // Then - the backslash is kept literally; mapping covers every decoded char
        expect(map.decoded).toBe(String.raw`a\zb`);
        expect(map.toDocOffset(0)).toBe(1);
        expect(map.toDocOffset(1)).toBe(2);
        expect(map.toDocOffset(2)).toBe(3);
        expect(map.toDocOffset(3)).toBe(4);
    });

    test('clamps out-of-range decoded offsets to the content bounds', () => {
        // Given - a short token at doc 5
        const map = createStringSourceMap('"hi"', 5);
        // Then - negatives clamp to first char, overshoot clamps to the end sentinel
        expect(map.toDocOffset(-3)).toBe(6);
        expect(map.toDocOffset(99)).toBe(8);
    });

    test('treats an empty string token sensibly', () => {
        // Given - `""`
        const map = createStringSourceMap('""', 0);
        // Then - empty decoded, end sentinel at the closing quote
        expect(map.decoded).toBe('');
        expect(map.toDocOffset(0)).toBe(1);
    });
});

describe('stringSourceMap.toDecodedOffset', () => {
    test('round-trips with toDocOffset on a plain string', () => {
        // Given - `"hello"` at doc 10
        const map = createStringSourceMap('"hello"', 10);
        // Then - every decoded offset maps to a doc offset that maps back
        for (let d = 0; d <= map.decoded.length; d += 1) {
            expect(map.toDecodedOffset(map.toDocOffset(d))).toBe(d);
        }
    });

    test('clamps a cursor on the opening quote to decoded offset 0', () => {
        // Given - token at doc 10 (opening quote at doc 10, first content char at doc 11)
        const map = createStringSourceMap('"hello"', 10);
        // Then - the opening quote and anything before clamps to 0
        expect(map.toDecodedOffset(10)).toBe(0);
        expect(map.toDecodedOffset(0)).toBe(0);
    });

    test('clamps a cursor at/after the closing quote to decoded.length', () => {
        // Given - `"hi"` at doc 5 (closing quote at doc 8)
        const map = createStringSourceMap('"hi"', 5);
        // Then - the closing quote and beyond clamp to the decoded length
        expect(map.toDecodedOffset(8)).toBe(2);
        expect(map.toDecodedOffset(99)).toBe(2);
    });

    test(String.raw`maps a cursor just after a \n escape to the decoded offset past it`, () => {
        // Given - `"a\nb"` at doc 0: source a(1) \(2) n(3) b(4)
        const map = createStringSourceMap(String.raw`"a\nb"`, 0);
        // Then - a cursor at the 'b' source position (doc 4) is decoded offset 2 (after a, \n)
        expect(map.toDecodedOffset(4)).toBe(2);
        expect(map.toDecodedOffset(2)).toBe(1);
    });

    test(String.raw`maps a cursor after a \n-prefixed mustache to the right decoded offset`, () => {
        // Given - `"line1\n{{Request.x}}"` token at doc 100
        const raw = String.raw`"line1\n{{Request.x}}"`;
        const map = createStringSourceMap(raw, 100);
        expect(map.toDocOffset(6)).toBe(108);
        const decodedDot = map.decoded.indexOf('Request.') + 'Request.'.length;
        const docDot = map.toDocOffset(decodedDot);
        expect(map.toDecodedOffset(docDot)).toBe(decodedDot);
    });
});
