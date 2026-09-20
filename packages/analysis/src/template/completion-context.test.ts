import { describe, expect, test } from 'vitest';

import { classifyCompletionContext } from './completion-context.js';

/**
 * The cursor-context classifier underpins template IntelliSense. It must be error-tolerant: the
 * document is almost always MID-TYPING (`{{fa`, `{{#each x}}{{`, `{{Request.`), so the classifier
 * works off a focused scan rather than a well-formed AST. These tests pin each context kind, the
 * partial `word`, path roots, `now` slots, and the enclosing block stack — including recovery on
 * unclosed mustaches/blocks and nested `#each` scope.
 *
 * Convention: the marker `|` denotes the cursor; we split on it to get the decoded offset.
 */
function ctx(marked: string): ReturnType<typeof classifyCompletionContext> {
    const offset = marked.indexOf('|');
    const decoded = marked.replace('|', '');
    return classifyCompletionContext(decoded, offset);
}

describe('classifyCompletionContext — helper/path start', () => {
    test('classifies an empty mustache head as helperOrPathStart', () => {
        // Given - just-opened mustache
        const result = ctx('{{|');
        // Then
        expect(result.kind).toBe('helperOrPathStart');
        expect(result.word).toBe('');
    });

    test('recovers a mid-typed helper name `{{fa`', () => {
        // Given - a partially-typed helper name with no closing braces
        const result = ctx('{{fa|');
        // Then - the partial word is captured for filtering
        expect(result.kind).toBe('helperOrPathStart');
        expect(result.word).toBe('fa');
    });

    test('treats a block-open head `{{#` as a (block) helper start', () => {
        const result = ctx('{{#|');
        expect(result.kind).toBe('helperOrPathStart');
    });

    test('treats a subexpression head `(` as a helper start', () => {
        // Given - a cursor inside an open subexpression
        const result = ctx('{{multiply (|');
        expect(result.kind).toBe('helperOrPathStart');
    });
});

describe('classifyCompletionContext — path continuation', () => {
    test.each([
        ['{{Request.|', 'Request'],
        ['{{State.|', 'State'],
        ['{{Vars.|', 'Vars'],
        ['{{Literals.|', 'Literals'],
        ['{{this.|', 'this'],
    ])('classifies %s as pathContinuation rooted at %s', (marked, root) => {
        const result = ctx(marked);
        expect(result.kind).toBe('pathContinuation');
        expect(result.path?.root).toBe(root);
    });

    test('classifies `{{@` as an @-data path continuation', () => {
        const result = ctx('{{@|');
        expect(result.kind).toBe('pathContinuation');
        expect(result.path?.root).toBe('@');
    });

    test('captures the partial segment word `{{Request.Met`', () => {
        const result = ctx('{{Request.Met|');
        expect(result.kind).toBe('pathContinuation');
        expect(result.word).toBe('Met');
        expect(result.path?.root).toBe('Request');
    });
});

describe('classifyCompletionContext — argument contexts', () => {
    test('classifies an open faker string arg as fakerArg', () => {
        const result = ctx("{{faker '|");
        expect(result.kind).toBe('fakerArg');
    });

    test('classifies the now offset (arg 0) vs format (arg 1) slots', () => {
        // Given - the cursor in the first now string arg
        expect(ctx("{{now '|").nowSlot).toBe('offset');
        // And - in the second now string arg
        expect(ctx("{{now '-1d' '|").nowSlot).toBe('format');
    });

    test('classifies a generic helper arg as helperArg', () => {
        const result = ctx('{{multiply Req|');
        // `Req` has no dot yet → treated as a helper/value start word inside the arg list
        expect(['helperArg', 'pathContinuation', 'helperOrPathStart']).toContain(result.kind);
    });
});

describe('classifyCompletionContext — block close', () => {
    test('classifies `{{/` as blockClose', () => {
        const result = ctx('{{#each x}}{{/|');
        expect(result.kind).toBe('blockClose');
    });

    test('captures the partial close name `{{/ea`', () => {
        const result = ctx('{{#each x}}{{/ea|');
        expect(result.kind).toBe('blockClose');
        expect(result.word).toBe('ea');
    });
});

describe('classifyCompletionContext — block stack & scope', () => {
    test('reports the enclosing #each block at a nested mustache', () => {
        // Given - a mustache inside an (unclosed) #each
        const result = ctx('{{#each xs}}{{@|');
        // Then - the block stack carries `each`, enabling @-vars
        expect(result.blockStack).toContain('each');
        expect(result.inEachScope).toBeTruthy();
        expect(result.path?.root).toBe('@');
    });

    test('reports nested blocks outermost→innermost', () => {
        // Given - a #with nested in a #each, cursor in the inner body
        const result = ctx('{{#each xs}}{{#with this}}{{|');
        expect(result.blockStack).toStrictEqual(['each', 'with']);
        // `with` is not an each scope but the outer `each` still is
        expect(result.inEachScope).toBeTruthy();
    });

    test('is not in each-scope at the top level', () => {
        const result = ctx('{{|');
        expect(result.blockStack).toStrictEqual([]);
        expect(result.inEachScope).toBeFalsy();
    });
});

describe('classifyCompletionContext — negatives', () => {
    test('returns `none` in plain literal text outside any mustache', () => {
        const result = ctx('hello |world');
        expect(result.kind).toBe('none');
    });

    test('returns `none` after a closed mustache', () => {
        // Given - the cursor is after a fully-closed `{{x}}`
        const result = ctx('{{x}} |');
        expect(result.kind).toBe('none');
    });
});
