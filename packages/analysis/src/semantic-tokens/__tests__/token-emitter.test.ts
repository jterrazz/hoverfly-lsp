import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createStringSourceMap } from '../../template/source-map.js';
import { TokenEmitter } from '../token-emitter.js';

function emitter(text: string): TokenEmitter {
    return new TokenEmitter(TextDocument.create('file:///t.json', 'json', 1, text));
}

describe('TokenEmitter', () => {
    test.each([
        {
            span: [1, 3],
            text: 'abcd',
            tokens: [{ length: 2, line: 0, startChar: 1, tokenModifiers: 0, tokenType: 7 }],
        },
        {
            span: [1, 8],
            text: 'ab\ncd\nef',
            tokens: [
                { length: 2, line: 0, startChar: 1, tokenModifiers: 0, tokenType: 7 },
                { length: 3, line: 1, startChar: 0, tokenModifiers: 0, tokenType: 7 },
                { length: 2, line: 2, startChar: 0, tokenModifiers: 0, tokenType: 7 },
            ],
        },
        {
            span: [3, 4],
            text: 'ab\ncd',
            tokens: [{ length: 1, line: 1, startChar: 0, tokenModifiers: 0, tokenType: 7 }],
        },
        { span: [2, 2], text: 'abcd', tokens: [] },
        { span: [3, 1], text: 'abcd', tokens: [] },
    ])(
        // Given - a document and the spans emitted on it
        // Then - the tokens the emitter lists
        'a span of $text from $span',
        ({ span, text, tokens }) => {
            const tokenEmitter = emitter(text);
            tokenEmitter.emitDocSpan(span[0] ?? 0, span[1] ?? 0, 'string');
            expect(tokenEmitter.result()).toStrictEqual(tokens);
        },
    );

    test('keeps each token on the type it was emitted as', () => {
        // Given - a document and the spans emitted on it
        // Then - the tokens the emitter lists
        const tokenEmitter = emitter('abcdef');
        tokenEmitter.emitDocSpan(0, 2, 'keyword');
        tokenEmitter.emitDocSpan(2, 4, 'operator');
        expect(tokenEmitter.result().map(({ tokenType }) => tokenType)).toStrictEqual([1, 9]);
    });

    test('lists the tokens by line, then by start character, whatever order they were emitted in', () => {
        // Given - a document and the spans emitted on it
        // Then - the tokens the emitter lists
        const tokenEmitter = emitter('abcd\nefgh');
        tokenEmitter.emitDocSpan(7, 8, 'string');
        tokenEmitter.emitDocSpan(2, 3, 'string');
        tokenEmitter.emitDocSpan(5, 6, 'string');
        tokenEmitter.emitDocSpan(0, 1, 'string');
        expect(
            tokenEmitter.result().map(({ line, startChar }) => `${line}:${startChar}`),
        ).toStrictEqual(['0:0', '0:2', '1:0', '1:2']);
    });

    test('places a decoded span on the document through the string source map', () => {
        // Given - a document and the spans emitted on it
        // Then - the tokens the emitter lists
        const tokenEmitter = emitter(String.raw`{"a":"x\ny"}`);
        tokenEmitter.emitDecoded(createStringSourceMap(String.raw`"x\ny"`, 5), 1, 2, 'operator');
        expect(tokenEmitter.result()).toStrictEqual([
            { length: 2, line: 0, startChar: 7, tokenModifiers: 0, tokenType: 9 },
        ]);
    });
});
