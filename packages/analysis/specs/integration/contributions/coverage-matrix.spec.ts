import { describe, expect, test } from 'vitest';

import { completionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

// invariant: every completion context is met under the three cursor conditions a real editor produces —
// (a) empty quotes `"⟦⟧"`, (b) mid-word `"au⟦⟧"`, (c) a bare position after `{` or `[`. A trigger
// character only invokes completion: the service keys the list off the AST position, so a run with
// and without one is the same run. The truth table is packages/analysis/src/contributions/README.md's.

function matcherDoc(field: string, inner: string): string {
    return `{"data":{"pairs":[{"request":{"${field}":[{"matcher":${inner}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

function schemaVersionDoc(inner: string): string {
    return `{"data":{"pairs":[]},"meta":{"schemaVersion":${inner}}}`;
}

function producerPair(
    kind: 'removesState' | 'requiresState' | 'transitionsState',
    body: string,
): string {
    if (kind === 'requiresState') {
        return `{"request":{"path":[{"matcher":"exact","value":"/p"}],"requiresState":${body}},"response":{"status":200}}`;
    }
    return `{"request":{"path":[{"matcher":"exact","value":"/p"}]},"response":{"status":200,"${kind}":${body}}}`;
}

function consumerPair(kind: 'requiresState' | 'transitionsState', typedKey: string): string {
    if (kind === 'requiresState') {
        return `{"request":{"path":[{"matcher":"exact","value":"/q"}],"requiresState":${typedKey}},"response":{"status":200}}`;
    }
    return `{"request":{"path":[{"matcher":"exact","value":"/q"}]},"response":{"status":200,"transitionsState":${typedKey}}}`;
}

function stateDoc(producer: string, consumer: string): string {
    return `{"data":{"pairs":[${producer},${consumer}]},"meta":{"schemaVersion":"v5.3"}}`;
}

function removesStateDoc(inner: string): string {
    return stateDoc(
        producerPair('requiresState', `{"auth":"yes"}`),
        `{"request":{"path":[{"matcher":"exact","value":"/q"}]},"response":{"status":200,"removesState":${inner}}}`,
    );
}

function postServeDoc(inner: string): string {
    return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":${inner}}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

async function insertions(
    doc: string,
    options = {},
): Promise<{ insertText: string | undefined; label: string }[]> {
    return (await completionsAt(doc, '', options)).map(({ insertText, label }) => ({
        insertText,
        label,
    }));
}

const fromTransitions = producerPair('transitionsState', `{"auth":"yes"}`);
const fromRequires = producerPair('requiresState', `{"step":"1"}`);
const actions = { settings: { registeredActions: ['webhook', 'logger'] } };

describe('coverage matrix', () => {
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
            async () => await insertions(matcherDoc('path', '⟦⟧')),
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
        const result = await integration.call(async () => await insertions(schemaVersionDoc('⟦⟧')));

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

    test('requiresState key, (a) empty quotes: the cross-referenced keys and sequence:', async () => {
        // Given - a key set only by another pair's transitionsState
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{"⟦⟧":""}`));
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - that key, and the sequence: snippet
        expect(result.value).toMatch(['auth', 'sequence:']);
    });

    test('requiresState key, (b) mid-word: the keys, unfiltered', async () => {
        // Given - a partial key typed
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{"au⟦⟧":""}`));
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the same keys
        expect(result.value).toMatch(['au', 'auth', 'sequence:']);
    });

    test('requiresState key, (c) bare position: the insert text appends the value', async () => {
        // Given - a cursor right after `{`
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', '{⟦⟧}'));
        const result = await integration.call(async () => await insertions(doc));

        // Then - each key inserts `"key": "$1"`
        expect(result.value).toMatch([
            {
                insertText: '"auth": "$1"',
                label: 'auth',
            },
            {
                insertText: '"sequence:${1:name}": "$2"',
                label: 'sequence:',
            },
        ]);
    });

    test('requiresState key: a key declared only through removesState is offered too', async () => {
        // Given - a key the producer only removes
        const doc = stateDoc(
            producerPair('removesState', `["auth"]`),
            consumerPair('requiresState', `{"⟦⟧":""}`),
        );
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the removed key joins the union
        expect(result.value).toMatch(['auth', 'sequence:']);
    });

    test('transitionsState key, (a) empty quotes: the cross-referenced keys, no sequence:', async () => {
        // Given - a key another pair requires
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', `{"⟦⟧":""}`));
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - that key alone
        expect(result.value).toMatch(['step']);
    });

    test('transitionsState key, (b) mid-word: the keys, unfiltered', async () => {
        // Given - a partial key typed
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', `{"st⟦⟧":""}`));
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the same keys
        expect(result.value).toMatch(['st', 'step']);
    });

    test('transitionsState key, (c) bare position: the insert text appends the value', async () => {
        // Given - a cursor right after `{`
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', '{⟦⟧}'));
        const result = await integration.call(async () => await insertions(doc));

        // Then - each key inserts `"key": "$1"`
        expect(result.value).toMatch([
            {
                insertText: '"step": "$1"',
                label: 'step',
            },
        ]);
    });

    // outside: vscode-json-languageservice calls no contribution for a string element of an array, so a
    // removesState entry gets no cross-referenced key; the two specs below pin that absence.
    test('removesState entry, (a) empty quotes: no state key', async () => {
        // Given - empty quotes inside a removesState array
        const result = await integration.call(
            async () => await labelsAt(removesStateDoc(`["⟦⟧"]`)),
        );

        // Then - nothing cross-referenced
        expect(result.value).toMatch([]);
    });

    test('removesState entry, (c) bare position: no state key', async () => {
        // Given - a bare position inside a removesState array
        const result = await integration.call(async () => await labelsAt(removesStateDoc('[⟦⟧]')));

        // Then - nothing cross-referenced
        expect(result.value).toMatch([]);
    });

    test('postServeAction, (a) empty quotes: the registered actions', async () => {
        // Given - two registered actions
        const result = await integration.call(
            async () => await labelsAt(postServeDoc(`"⟦⟧"`), '', actions),
        );

        // Then - both
        expect(result.value).toMatch(['webhook', 'logger']);
    });

    test('postServeAction, (b) mid-word: the registered actions, unfiltered', async () => {
        // Given - a partial action typed
        const result = await integration.call(
            async () => await labelsAt(postServeDoc(`"web⟦⟧"`), '', actions),
        );

        // Then - both
        expect(result.value).toMatch(['webhook', 'logger']);
    });

    test('postServeAction, (c) bare position: quoted on insert', async () => {
        // Given - no quotes yet
        const result = await integration.call(
            async () => await insertions(postServeDoc('⟦⟧'), actions),
        );

        // Then - each action, quoted on insert
        expect(result.value).toMatch([
            {
                insertText: '"webhook"',
                label: 'webhook',
            },
            {
                insertText: '"logger"',
                label: 'logger',
            },
        ]);
    });
});
