import { describe, expect, test } from 'vitest';

import { insertionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

// invariant: every completion context is met under the three cursor conditions a real editor produces:
// (a) empty quotes `"⟦⟧"`, (b) mid-word `"au⟦⟧"`, (c) a bare position after `{` or `[`. A trigger
// character only invokes completion: the service keys the list off the AST position, so a run with
// and without one is the same run. The truth table is packages/analysis/src/contributions/README.md's.

function matcherDoc(field: string, inner: string): string {
    return `{"data":{"pairs":[{"request":{"${field}":[{"matcher":${inner}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

function schemaVersionDoc(inner: string): string {
    return `{"data":{"pairs":[]},"meta":{"schemaVersion":${inner}}}`;
}

describe('coverage-matrix', () => {
    test('matcher name on request.path, (a) empty quotes: the named registry set', async () => {
        // Given - empty quotes in a path matcher value
        const result = await integration.call(
            async () => await labelsAt(matcherDoc('path', `"⟦⟧"`)),
        );

        // Then - every named matcher
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('matcher name on request.path, (b) mid-word: the whole set, the client filtering by prefix', async () => {
        // Given - a partial matcher name typed
        const result = await integration.call(
            async () => await labelsAt(matcherDoc('path', `"ex⟦⟧"`)),
        );

        // Then - the same set, unfiltered
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('matcher name on request.path, (c) bare position: quoted on insert', async () => {
        // Given - no quotes yet
        const result = await integration.call(
            async () => await insertionsAt(matcherDoc('path', '⟦⟧')),
        );

        // Then - each matcher, its insert text quoting it
        expect(result.value).toMatch([
            {
                insertText: '"exact"',
                label: 'exact',
            },
            {
                insertText: '"negate"',
                label: 'negate',
            },
            {
                insertText: '"glob"',
                label: 'glob',
            },
            {
                insertText: '"regex"',
                label: 'regex',
            },
            {
                insertText: '"xml"',
                label: 'xml',
            },
            {
                insertText: '"xmltemplated"',
                label: 'xmltemplated',
            },
            {
                insertText: '"xpath"',
                label: 'xpath',
            },
            {
                insertText: '"json"',
                label: 'json',
            },
            {
                insertText: '"jsonpartial"',
                label: 'jsonpartial',
            },
            {
                insertText: '"jsonpath"',
                label: 'jsonpath',
            },
            {
                insertText: '"jwt"',
                label: 'jwt',
            },
            {
                insertText: '"jwtjsonpath"',
                label: 'jwtjsonpath',
            },
            {
                insertText: '"array"',
                label: 'array',
            },
        ]);
    });

    test('matcher name on request.body, (a) empty quotes: form joins the set', async () => {
        // Given - empty quotes in a body matcher value
        const result = await integration.call(
            async () => await labelsAt(matcherDoc('body', `"⟦⟧"`)),
        );

        // Then - the named matchers and form
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
            'form',
        ]);
    });

    test('matcher name on request.body, (b) mid-word: form stays offered', async () => {
        // Given - a partial name typed on the body
        const result = await integration.call(
            async () => await labelsAt(matcherDoc('body', `"fo⟦⟧"`)),
        );

        // Then - the body set, unfiltered
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
            'form',
        ]);
    });

    test('matcher name on request.body, (c) bare position: form stays offered', async () => {
        // Given - no quotes yet on the body
        const result = await integration.call(async () => await labelsAt(matcherDoc('body', '⟦⟧')));

        // Then - the body set
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
            'form',
        ]);
    });

    test('meta.schemaVersion, (a) empty quotes: the version enum', async () => {
        // Given - empty quotes in the version value
        const result = await integration.call(async () => await labelsAt(schemaVersionDoc(`"⟦⟧"`)));

        // Then - the four versions and the schema's quoted examples
        expect(result.value).toMatch([
            '"v5.3"',
            '"v5.2"',
            '"v5.1"',
            '"v5"',
            'v5.3',
            'v5',
            'v5.1',
            'v5.2',
        ]);
    });

    test('meta.schemaVersion, (b) mid-word: the version enum', async () => {
        // Given - a partial version typed
        const result = await integration.call(
            async () => await labelsAt(schemaVersionDoc(`"v5⟦⟧"`)),
        );

        // Then - the same enum
        expect(result.value).toMatch([
            '"v5.3"',
            '"v5.2"',
            '"v5.1"',
            '"v5"',
            'v5.3',
            'v5',
            'v5.1',
            'v5.2',
        ]);
    });

    test('meta.schemaVersion, (c) bare position: quoted on insert', async () => {
        // Given - no quotes yet
        const result = await integration.call(
            async () => await insertionsAt(schemaVersionDoc('⟦⟧')),
        );

        // Then - each version, quoted on insert
        expect(result.value).toMatch([
            {
                insertText: '"v5.3"',
                label: '"v5.3"',
            },
            {
                insertText: '"v5.2"',
                label: '"v5.2"',
            },
            {
                insertText: '"v5.1"',
                label: '"v5.1"',
            },
            {
                insertText: '"v5"',
                label: '"v5"',
            },
            {
                insertText: '"v5.3"',
                label: 'v5.3',
            },
            {
                insertText: '"v5"',
                label: 'v5',
            },
            {
                insertText: '"v5.1"',
                label: 'v5.1',
            },
            {
                insertText: '"v5.2"',
                label: 'v5.2',
            },
        ]);
    });
});
