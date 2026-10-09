import { describe, expect, test } from 'vitest';

import { HF6XX_RULES } from '../hf6xx.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

type Case = {
    action?: unknown;
    globalActions?: object;
    raw?: string;
    registeredActions?: string[];
};

const run = ({ action, globalActions, raw, registeredActions }: Case): string[] =>
    HF6XX_RULES.flatMap((rule) =>
        diagnosticsOf(
            rule,
            raw ??
                pairOf(
                    { path: [{ matcher: 'exact', value: '/' }] },
                    { status: 200, ...(action !== undefined && { postServeAction: action }) },
                    { ...(globalActions !== undefined && { globalActions }) },
                ),
            registeredActions === undefined ? {} : { registeredActions },
        ),
    );

describe('hf6xx', () => {
    test.each([
        {
            expected: ['HF601 warning 6:24-6:37 Invalid pattern'],
            label: 'a delay whose urlPattern has an unbalanced group',
            input: { globalActions: { delays: [{ delay: 100, urlPattern: '(unbalanced' }] } },
        },
        {
            expected: [],
            label: 'a delay whose urlPattern is a valid regex',
            input: { globalActions: { delays: [{ delay: 100, urlPattern: '^/api/.*$' }] } },
        },
        {
            expected: [],
            label: 'a delay with no urlPattern',
            input: { globalActions: { delays: [{ delay: 100 }] } },
        },
        {
            expected: [],
            label: 'a delay whose urlPattern is a number',
            input: { globalActions: { delays: [{ delay: 100, urlPattern: 42 }] } },
        },
        {
            expected: [
                'HF601 warning 6:24-6:37 Invalid pattern',
                'HF601 warning 13:24-13:30 Invalid pattern',
            ],
            label: 'a malformed pattern in delays and in delaysLogNormal',
            input: {
                globalActions: {
                    delays: [{ delay: 100, urlPattern: '(unbalanced' }],
                    delaysLogNormal: [{ max: 2, min: 1, urlPattern: '*bad' }],
                },
            },
        },
        {
            expected: ['HF601 warning 7:24-7:37 Invalid pattern'],
            label: 'a malformed pattern in delaysLogNormal alone',
            input: {
                globalActions: { delaysLogNormal: [{ max: 2, min: 1, urlPattern: '(unbalanced' }] },
            },
        },
        { expected: [], label: 'a postServeAction and no allowlist', input: { action: 'webhook' } },
        {
            expected: [],
            label: 'a postServeAction and an empty allowlist',
            input: { action: 'webhook', registeredActions: [] },
        },
        {
            expected: [
                'HF602 information 14:29-14:38 Action "webhook" is not in your configured registeredActions',
            ],
            label: 'a postServeAction outside the allowlist',
            input: { action: 'webhook', registeredActions: ['logger'] },
        },
        {
            expected: [],
            label: 'a postServeAction inside the allowlist',
            input: { action: 'webhook', registeredActions: ['webhook'] },
        },
        {
            expected: [],
            label: 'an allowlist and no postServeAction',
            input: { registeredActions: ['logger'] },
        },
        {
            expected: [],
            label: "an allowlist and a numeric postServeAction, the schema's concern",
            input: { action: 5, registeredActions: ['logger'] },
        },
        {
            expected: [],
            label: 'an allowlist and an empty postServeAction, which runs nothing',
            input: { action: '', registeredActions: ['logger'] },
        },
        {
            expected: [],
            label: 'an allowlist and a pair with no response',
            input: {
                raw: '{"data":{"pairs":[{"request":{}}]},"meta":{"schemaVersion":"v5.3"}}',
                registeredActions: ['logger'],
            },
        },
    ])(
        // Given - a simulation holding $label
        // Then - every HF601 and HF602 diagnostic, its severity, its range and its message, or none
        '$label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
