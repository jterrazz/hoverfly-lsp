import { describe, expect, test } from 'vitest';

import { insertionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

// invariant: every state-key and action context is met under the cursor conditions a real editor
// produces — (a) empty quotes, (b) mid-word, (c) a bare position after `{` or `[`.

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

const fromTransitions = producerPair('transitionsState', `{"auth":"yes"}`);
const fromRequires = producerPair('requiresState', `{"step":"1"}`);
const actions = { settings: { registeredActions: ['webhook', 'logger'] } };

describe('state-coverage-matrix', () => {
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
        const result = await integration.call(async () => await insertionsAt(doc));

        // Then - each key inserts `"key": "$1"`
        expect(result.value).toMatch([
            {
                insertText: '"auth": "$1"',
                label: 'auth',
            },
            {
                // oxlint-disable-next-line no-template-curly-in-string -- an LSP snippet placeholder, the text the completion inserts
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
        const result = await integration.call(async () => await insertionsAt(doc));

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
            async () => await insertionsAt(postServeDoc('⟦⟧'), '', actions),
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
