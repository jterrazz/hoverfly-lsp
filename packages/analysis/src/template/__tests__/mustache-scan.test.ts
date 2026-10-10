import { describe, expect, test } from 'vitest';

import {
    findOpenMustache,
    innermostOpenSubexpression,
    openStringQuote,
    splitTopLevelTokens,
} from '../mustache-scan.js';

describe('mustache-scan', () => {
    test.each([
        { cursor: 5, open: { contentStart: 2 }, text: '{{abc' },
        { cursor: 6, open: { contentStart: 3 }, text: '{{{abc' },
        { cursor: 2, open: { contentStart: 2 }, text: '{{' },
        { cursor: 3, open: { contentStart: 3 }, text: '{{{' },
        { cursor: 2, open: { contentStart: 2 }, text: '{{{' },
        { cursor: 7, open: { contentStart: 6 }, text: '{{a {{b' },
        { cursor: 4, open: { contentStart: 2 }, text: '{{a {{b' },
        { cursor: 4, open: { contentStart: 2 }, text: '{{a}}' },
        { cursor: 11, open: { contentStart: 2 }, text: "{{a '}}' b" },
        { cursor: 11, open: { contentStart: 2 }, text: '{{a "}}" b' },
        { cursor: 11, open: { contentStart: 2 }, text: '{{a "\'}}" ' },
        { cursor: 9, open: { contentStart: 2 }, text: "{{a '}' b" },
        { cursor: 8, open: { contentStart: 2 }, text: "{{'a}} b" },
        { cursor: 8, open: { contentStart: 2 }, text: '{{"a}} b' },
        { cursor: 5, open: { contentStart: 2 }, text: '{{a}b' },
        { cursor: 7, open: undefined, text: '{{abc}}' },
        { cursor: 4, open: undefined, text: '{{}}' },
        { cursor: 8, open: undefined, text: "{{'a'}} b" },
        { cursor: 10, open: undefined, text: '{{"it\'s"}}' },
        { cursor: 3, open: undefined, text: 'abc' },
        { cursor: 2, open: undefined, text: 'a{{' },
        { cursor: 1, open: undefined, text: '{{x' },
        { cursor: 0, open: undefined, text: '{{x' },
        { cursor: 1, open: undefined, text: '{' },
    ])(
        // Given - a template body and the cursor in it
        // Then - the mustache the cursor is inside, or none
        'findOpenMustache — $text at $cursor',
        ({ cursor, open, text }) => {
            expect(findOpenMustache(text, cursor)).toStrictEqual(open);
        },
    );

    test.each([
        { inner: 'foo', segment: { atMustacheHead: true, text: 'foo' } },
        { inner: 'foo (bar ', segment: { atMustacheHead: false, text: 'bar ' } },
        { inner: 'foo (bar) baz', segment: { atMustacheHead: true, text: 'foo (bar) baz' } },
        { inner: 'a (b (c ', segment: { atMustacheHead: false, text: 'c ' } },
        { inner: 'a (b (c) d ', segment: { atMustacheHead: false, text: 'b (c) d ' } },
        { inner: 'a (b (c) (d) ', segment: { atMustacheHead: false, text: 'b (c) (d) ' } },
        { inner: "a (b ')' ", segment: { atMustacheHead: false, text: "b ')' " } },
        { inner: 'a (b ")" ', segment: { atMustacheHead: false, text: 'b ")" ' } },
        { inner: 'a (b "\'" (c ', segment: { atMustacheHead: false, text: 'c ' } },
        { inner: 'a (b "(" ', segment: { atMustacheHead: false, text: 'b "(" ' } },
        { inner: '(', segment: { atMustacheHead: false, text: '' } },
        { inner: 'a) b', segment: { atMustacheHead: true, text: 'a) b' } },
        { inner: '(a))', segment: { atMustacheHead: true, text: '(a))' } },
        { inner: '(a) (b', segment: { atMustacheHead: false, text: 'b' } },
        { inner: 'a (b (c (d) e ', segment: { atMustacheHead: false, text: 'c (d) e ' } },
        { inner: 'a) (b', segment: { atMustacheHead: false, text: 'b' } },
        { inner: "a (b '(' (c) d ", segment: { atMustacheHead: false, text: "b '(' (c) d " } },
        { inner: 'a (b ")" (c) d ', segment: { atMustacheHead: false, text: 'b ")" (c) d ' } },
        { inner: "a ('x(' ", segment: { atMustacheHead: false, text: "'x(' " } },
        { inner: '', segment: { atMustacheHead: true, text: '' } },
    ])(
        // Given - the text of a mustache up to the cursor
        // Then - the innermost subexpression still open, or the whole text at the mustache head
        'innermostOpenSubexpression — $inner',
        ({ inner, segment }) => {
            expect(innermostOpenSubexpression(inner)).toStrictEqual(segment);
        },
    );

    test.each([
        { body: "foo 'ba", quote: { before: 'foo ', quote: "'", typed: 'ba' } },
        { body: 'foo "ba', quote: { before: 'foo ', quote: '"', typed: 'ba' } },
        { body: "x '", quote: { before: 'x ', quote: "'", typed: '' } },
        { body: "'a' 'b", quote: { before: "'a' ", quote: "'", typed: 'b' } },
        { body: 'x \'it"s', quote: { before: 'x ', quote: "'", typed: 'it"s' } },
        { body: "x 'a\\'b", quote: { before: 'x ', quote: "'", typed: "a\\'b" } },
        { body: 'x "a\\"b', quote: { before: 'x ', quote: '"', typed: 'a\\"b' } },
        { body: "x 'a\\\\' 'b", quote: { before: "x 'a\\\\' ", quote: "'", typed: 'b' } },
        { body: "foo 'bar' ", quote: undefined },
        { body: 'foo "bar" ', quote: undefined },
        { body: "x 'a\\\\'", quote: undefined },
        { body: 'no quote', quote: undefined },
        { body: '', quote: undefined },
    ])(
        // Given - the text of a mustache up to the cursor
        // Then - the string literal still open there, or none
        'openStringQuote — $body',
        ({ body, quote }) => {
            expect(openStringQuote(body)).toStrictEqual(quote);
        },
    );

    test.each([
        { body: '', tokens: [] },
        { body: 'a b', tokens: ['a', 'b'] },
        { body: '  a   b ', tokens: ['a', 'b'] },
        { body: 'a\tb\nc', tokens: ['a', 'b', 'c'] },
        { body: "'a b' c", tokens: ["'a b'", 'c'] },
        { body: '"a b" c', tokens: ['"a b"', 'c'] },
        { body: "'a\\' b' c", tokens: [String.raw`'a\' b'`, 'c'] },
        { body: "'a\\\\' b", tokens: [String.raw`'a\\'`, 'b'] },
        { body: "'a\\", tokens: ["'a\\"] },
        { body: "'a\"b c' d", tokens: ["'a\"b c'", 'd'] },
        { body: "a'b c'd e", tokens: ["a'b c'd", 'e'] },
        { body: '(a b) c', tokens: ['(a b)', 'c'] },
        { body: '((a b) c) d', tokens: ['((a b) c)', 'd'] },
        { body: "(a 'b )') c", tokens: ["(a 'b )')", 'c'] },
        { body: 'a) b', tokens: ['a) b'] },
        { body: '(a b', tokens: ['(a b'] },
        { body: "a 'b", tokens: ['a', "'b"] },
    ])(
        // Given - the text of a mustache
        // Then - its tokens split at the whitespace outside quotes and parentheses
        'splitTopLevelTokens — $body',
        ({ body, tokens }) => {
            expect(splitTopLevelTokens(body)).toStrictEqual(tokens);
        },
    );
});
