import { describe, expect, test } from 'vitest';

import { HF4XX_RULES } from '../hf4xx.js';
import { diagnosticsOf } from './rule-run.js';

type StatePair = {
    removesState?: string[];
    requiresState?: Record<string, string>;
    transitionsState?: Record<string, string>;
};

function simulationOf(pairs: readonly StatePair[]): object {
    return {
        data: {
            pairs: pairs.map(({ removesState, requiresState, transitionsState }) => ({
                request: {
                    path: [{ matcher: 'exact', value: '/x' }],
                    ...(requiresState && { requiresState }),
                },
                response: {
                    status: 200,
                    ...(transitionsState && { transitionsState }),
                    ...(removesState && { removesState }),
                },
            })),
        },
        meta: { schemaVersion: 'v5.3' },
    };
}

const run = (pairs: readonly StatePair[]): string[] =>
    HF4XX_RULES.flatMap((rule) => diagnosticsOf(rule, simulationOf(pairs)));

describe('hf4xx', () => {
    test.each([
        {
            expected: [
                'HF401 warning 12:12-12:19 State "ready" is required but never set by any transitionsState; this pair can only match if the state is set externally',
            ],
            label: 'requiresState key never set — warns when a required state is never set by any transitionsState',
            pairs: [{ requiresState: { ready: 'yes' } }],
        },
        {
            expected: [],
            label: 'requiresState key never set — stays silent cross-pair: required in pair A, set in pair B',
            pairs: [{ requiresState: { auth: 'true' } }, { transitionsState: { auth: 'true' } }],
        },
        {
            expected: [
                'HF401 warning 12:12-12:18 State "loop" is required but never set by any transitionsState; this pair can only match if the state is set externally',
            ],
            label: 'requiresState key never set — still warns when required and set only in the SAME pair (state unset on first match)',
            pairs: [{ requiresState: { loop: '1' }, transitionsState: { loop: '1' } }],
        },
        {
            expected: [],
            label: 'requiresState key never set — exempts sequence:-prefixed keys (Hoverfly built-in sequencing)',
            pairs: [{ requiresState: { 'sequence:1': '2' } }],
        },
        {
            expected: [
                'HF401 warning 12:12-12:14 State "" is required but never set by any transitionsState; this pair can only match if the state is set externally',
            ],
            label: 'requiresState key never set — flags an empty-string state key',
            pairs: [{ requiresState: { '': 'x' } }],
        },
        {
            expected: [
                'HF401 warning 12:12-12:18 State "gone" is required but never set by any transitionsState; this pair can only match if the state is set externally',
                'HF401 warning 28:12-28:18 State "gone" is required but never set by any transitionsState; this pair can only match if the state is set externally',
            ],
            label: 'requiresState key never set — warns once per pair for a duplicate required key never set',
            pairs: [{ requiresState: { gone: '1' } }, { requiresState: { gone: '1' } }],
        },
        {
            expected: [
                'HF402 information 15:12-15:18 State "done" is set but never required in this simulation',
            ],
            label: 'transitionsState key never required — informs when a set state is never required',
            pairs: [{ transitionsState: { done: 'true' } }],
        },
        {
            expected: [],
            label: 'transitionsState key never required — stays silent when the set state is required by another pair',
            pairs: [{ transitionsState: { auth: 'true' } }, { requiresState: { auth: 'true' } }],
        },
        {
            expected: [],
            label: 'transitionsState key never required — exempts sequence:-prefixed keys',
            pairs: [{ transitionsState: { 'sequence:foo': '1' } }],
        },
        {
            expected: ['HF403 information 15:12-15:19 State "ghost" is removed but never set'],
            label: 'removesState entry never set — informs when a removed state is never set anywhere',
            pairs: [{ removesState: ['ghost'] }],
        },
        {
            expected: [
                'HF402 information 15:12-15:17 State "tmp" is set but never required in this simulation',
            ],
            label: 'removesState entry never set — stays silent when the removed state is set by some transitionsState',
            pairs: [{ transitionsState: { tmp: '1' } }, { removesState: ['tmp'] }],
        },
        {
            expected: [],
            label: 'removesState entry never set — exempts removesState of a sequence: key',
            pairs: [{ removesState: ['sequence:2'] }],
        },
    ])(
        // Given - pairs whose state maps hold the case $label names
        // Then - every HF401, HF402 and HF403 diagnostic, its range and its message, or none
        '$label',
        ({ expected, pairs }) => {
            expect(run(pairs)).toStrictEqual(expected);
        },
    );
});
