import { describe, expect, test } from 'vitest';

import { findClose, findMatchingParen, skipWhitespace, tokenEnd } from '../scan.js';

describe('scan', () => {
    test.each([
        { at: 2, from: 0, marker: '}}', source: 'a }} b' },
        { at: 5, from: 0, marker: '}}', source: "'}}' }}" },
        { at: 5, from: 0, marker: '}}', source: '"}}" }}' },
        { at: 6, from: 0, marker: '}}', source: '"\'}}" }}' },
        { at: 2, from: 2, marker: '}}', source: 'a }}' },
        { at: 4, from: 3, marker: '}}', source: '}} a}}' },
        { at: 2, from: 0, marker: '}}}', source: 'a }}}' },
        { at: 0, from: 0, marker: '}}', source: '}}' },
        { at: -1, from: 0, marker: '}}', source: 'a } b' },
        { at: -1, from: 0, marker: '}}', source: "'a }} b" },
        { at: -1, from: 5, marker: '}}', source: 'a }}' },
        { at: -1, from: 0, marker: '}}', source: '' },
    ])(
        // Given - a source, a start and a closing marker
        // Then - the offset of the first marker outside quotes, or -1
        'findClose — $source from $from',
        ({ at, from, marker, source }) => {
            expect(findClose(source, from, marker)).toBe(at);
        },
    );

    test.each([
        { at: 2, open: 0, source: '(a)', to: 3 },
        { at: 5, open: 0, source: '(a(b))', to: 6 },
        { at: 6, open: 2, source: 'x ((a))', to: 7 },
        { at: 5, open: 3, source: 'x ((a))', to: 7 },
        { at: 5, open: 0, source: "(')' )", to: 6 },
        { at: 5, open: 0, source: '(")" )', to: 6 },
        { at: 5, open: 0, source: '("\')")', to: 6 },
        { at: -1, open: 0, source: '(a', to: 2 },
        { at: -1, open: 0, source: '(a)', to: 2 },
        { at: -1, open: 0, source: "('a)", to: 4 },
        { at: -1, open: 0, source: '(a(b)', to: 5 },
        { at: -1, open: 1, source: 'a)', to: 2 },
    ])(
        // Given - a source and the offset of an opening parenthesis
        // Then - the offset of its closing parenthesis, or -1
        'findMatchingParen — $source from $open to $to',
        ({ at, open, source, to }) => {
            expect(findMatchingParen(source, open, to)).toBe(at);
        },
    );

    test.each([
        { at: 3, cursor: 0, source: 'abc def', to: 7 },
        { at: 3, cursor: 0, source: 'abc', to: 3 },
        { at: 2, cursor: 0, source: 'abc', to: 2 },
        { at: 3, cursor: 0, source: 'abc)d', to: 5 },
        { at: 3, cursor: 0, source: 'abc(d', to: 5 },
        { at: 3, cursor: 0, source: "abc'd", to: 5 },
        { at: 3, cursor: 0, source: 'abc"d', to: 5 },
        { at: 3, cursor: 0, source: 'abc\td', to: 5 },
        { at: 3, cursor: 0, source: 'abc\nd', to: 5 },
        { at: 5, cursor: 5, source: 'abc d', to: 5 },
        { at: 6, cursor: 4, source: 'abc de f', to: 8 },
        { at: 0, cursor: 0, source: ' a', to: 2 },
        { at: 1, cursor: 1, source: 'a', to: 1 },
        { at: 3, cursor: 0, source: 'abc', to: 6 },
    ])(
        // Given - a source and a cursor on a token
        // Then - the offset where the token ends
        'tokenEnd — $source from $cursor to $to',
        ({ at, cursor, source, to }) => {
            expect(tokenEnd(source, cursor, to)).toBe(at);
        },
    );

    test.each([
        { at: 2, from: 0, source: '  a', to: undefined },
        { at: 0, from: 0, source: 'a', to: undefined },
        { at: 3, from: 0, source: ' \t\n', to: undefined },
        { at: 2, from: 0, source: '    ', to: 2 },
        { at: 3, from: 1, source: 'a  b', to: undefined },
        { at: 3, from: 3, source: 'a  b', to: undefined },
        { at: 2, from: 0, source: '  ', to: 5 },
        { at: 2, from: 0, source: '\r\na', to: undefined },
        { at: 1, from: 1, source: ' ', to: undefined },
    ])(
        // Given - a source and a start
        // Then - the offset of the first character that is no whitespace
        'skipWhitespace — $source from $from',
        ({ at, from, source, to }) => {
            expect(
                to === undefined ? skipWhitespace(source, from) : skipWhitespace(source, from, to),
            ).toBe(at);
        },
    );
});
