import { describe, expect, test } from 'vitest';
import type { CompletionsCollector } from 'vscode-json-languageservice';

import { createHoverflyContribution } from '../hoverfly-contribution.js';

// value: what the library collects from a contribution, as the labels it was handed.
async function stateKeyLabels(location: (number | string)[]): Promise<string[]> {
    const labels: string[] = [];
    const result: CompletionsCollector = {
        add: ({ label }) => {
            labels.push(label);
        },
        error: () => undefined,
        getNumberOfProposals: () => labels.length,
        setAsIncomplete: () => undefined,
    };
    const contribution = createHoverflyContribution({}, () => undefined);
    await contribution.collectPropertyCompletions?.(
        'file:///unseen.json',
        location,
        '',
        true,
        true,
        result,
    );
    return labels;
}

describe('hoverfly-contribution', () => {
    test.each([
        {
            labels: ['sequence:'],
            location: ['data', 'pairs', 0, 'request', 'requiresState'],
            position: 'a requiresState key',
        },
        {
            labels: [],
            location: ['data', 'pairs', 0, 'response', 'transitionsState'],
            position: 'a transitionsState key',
        },
    ])(
        // Given - a contribution whose service holds no document
        // Then - what it offers or hovers on
        'offers at $position only what needs no document',
        async ({ labels, location }) => {
            await expect(stateKeyLabels(location)).resolves.toStrictEqual(labels);
        },
    );

    test('hovers nothing on a matcher name it cannot read', () => {
        // Given - a contribution whose service holds no document
        // Then - what it offers or hovers on
        const contribution = createHoverflyContribution({}, () => undefined);
        expect(
            contribution.getInfoContribution?.('file:///unseen.json', [
                'data',
                'pairs',
                0,
                'request',
                'path',
                0,
                'matcher',
            ]),
        ).toBeUndefined();
    });
});
