import { describe, expect, test } from 'vitest';

import { integration } from '../integration.specification.js';
import { parseMarkedDocument } from './harness.js';

/*
 * `.call()` reads what the subject returned through JSON, so a `Map` cannot cross the seam: the
 * subject projects the marker table to the plain data the assertion is about — the stripped text,
 * the marker names, and the absolute offset of the cursor.
 */
function marked(source: string): { names: string[]; offsets: number[]; text: string } {
    const { positions, text } = parseMarkedDocument(source);
    return {
        names: [...positions.keys()],
        offsets: [...positions.values()].map((position) => offsetOf(text, position)),
        text,
    };
}

describe('fourslash harness — parseMarkedDocument', () => {
    test('strips a default marker and records its position', async () => {
        // Given - a document with a single anonymous marker inside a JSON string
        const source = `{"matcher":"⟦⟧"}`;
        const result = await integration.call(() => marked(source));

        // Then - the marker text is removed and the position recorded
        const { names, offsets, text } = result.value.value;
        expect(text).toBe(`{"matcher":""}`);
        expect(names).toStrictEqual(['']);
        // The cursor sits between the two quotes (offset of the empty string content).
        expect(offsets).toStrictEqual([text.indexOf(`""`) + 1]);
    });

    test('supports multiple named markers in one document', async () => {
        // Given - two named markers
        const source = `{"a":"⟦first⟧","b":"⟦second⟧"}`;
        const result = await integration.call(() => marked(source));

        // Then - both names resolve and the text is clean
        expect(result.value.value.text).toBe(`{"a":"","b":""}`);
        expect(result.value.value.names).toStrictEqual(['first', 'second']);
    });

    test('works for a bare (unquoted) value position', async () => {
        // Given - a marker in an unquoted value position
        const source = `{"matcher": ⟦bare⟧}`;
        const result = await integration.call(() => marked(source));

        // Then - marker stripped, position recorded
        expect(result.value.value.text).toBe(`{"matcher": }`);
        expect(result.value.value.names).toStrictEqual(['bare']);
    });

    test('throws on a duplicate marker name', async () => {
        // Given - the same name twice
        const source = `{"a":"⟦x⟧","b":"⟦x⟧"}`;
        const result = await integration.call(() => marked(source));

        // Then - parsing rejects the ambiguity
        expect(result.error.text).toMatch(/Duplicate/u);
    });

    test('throws on unbalanced brackets', async () => {
        // Given - a stray closing bracket
        const source = `{"a":"⟧"}`;
        const result = await integration.call(() => marked(source));

        // Then - parsing rejects it
        expect(result.error.text).toMatch(/Unbalanced/u);
    });
});

/** Resolve a Position back to an absolute offset over `text` (spec-only helper). */
function offsetOf(text: string, pos: { character: number; line: number }): number {
    const lines = text.split('\n');
    let offset = 0;
    for (let i = 0; i < pos.line; i++) {
        offset += (lines[i]?.length ?? 0) + 1;
    }
    return offset + pos.character;
}
