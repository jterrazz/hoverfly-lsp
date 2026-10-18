import { describe, expect, test } from 'vitest';

import { structureRule } from '../structure.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (input: readonly unknown[] | string): string[] =>
    diagnosticsOf(
        structureRule,
        typeof input === 'string' ? input : pairOf(input[0], input[1], input[2]),
    );

describe('structure', () => {
    test.each([
        {
            expected: [
                'HF603 warning 5:10-5:17 Unknown key "methd" (did you mean "method"?); silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — flags a true typo on request with the nearest canonical suggestion',
            input: [{ methd: [{ matcher: 'exact', value: 'GET' }] }, { status: 200 }],
        },
        {
            expected: [
                'HF603 warning 24:14-24:23 Unknown key "machter" (did you mean "matcher"?); silently ignored by Hoverfly',
                'HF603 warning 30:10-30:27 Unknown key "transitionState" (did you mean "transitionsState"?); silently ignored by Hoverfly',
                'HF603 warning 14:8-14:16 Unknown key "values" (did you mean "value"?); silently ignored by Hoverfly',
                'HF603 warning 6:10-6:21 Unknown key "urlPatter" (did you mean "urlPattern"?); silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — flags nested field-matcher / response / globalActions / meta typos at every level',
            input: [
                { path: [{ matcher: 'exact', value: '/a', machter: 'glob' }] },
                { status: 200, transitionState: { x: '1' } },
                {
                    globalActions: { delays: [{ delay: 1, urlPatter: '/a' }] },
                    literals: [{ name: 'n', value: 'v', values: 'oops' }],
                },
            ],
        },
        {
            expected: [
                'HF603 warning 6:10-6:38 Unknown key "somethingEntirelyDifferent"; silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — omits the suggestion when no allowed key is within distance 2',
            input: [{ path: [], somethingEntirelyDifferent: 1 }, { status: 200 }],
        },
        {
            expected: [],
            label: 'unknown key (silent drop) with did-you-mean — does NOT flag `request.method` (legal despite being schema-absent)',
            input: [{ method: [{ matcher: 'exact', value: 'GET' }] }, { status: 200 }],
        },
        {
            expected: [],
            label: 'unknown key (silent drop) with did-you-mean — does NOT flag user-defined keys inside headers/query/state maps',
            input: [
                {
                    headers: { 'X-Custom': [{ matcher: 'glob', value: '*' }] },
                    query: { anyParam: [{ matcher: 'exact', value: '1' }] },
                    requiresState: { whateverStateName: 'v' },
                },
                {
                    status: 200,
                    headers: { 'X-Out': ['v'] },
                    transitionsState: { someStateKey: 'v' },
                },
            ],
        },
        {
            expected: [
                'HF604 information 5:10-5:18 Prefer canonical "method"; "Method" works (Go matches case-insensitively) but is non-standard',
                'HF604 information 14:10-14:20 Prefer canonical "bodyFile"; "BodyFile" works (Go matches case-insensitively) but is non-standard',
            ],
            label: 'case-only variant of a known key — flags `Method`/`BodyFile` as HF604 only (never HF603)',
            input: [
                { Method: [{ matcher: 'exact', value: 'GET' }] },
                { status: 200, BodyFile: 'f.json' },
            ],
        },
        {
            expected: [
                'HF212 warning 6:12-8:13 Matcher has no "value"; it can never match (the value is nil)',
                'HF212 warning 11:12-11:14 Matcher has no "value"; it can never match (the value is nil)',
            ],
            label: 'field-matcher with no value — flags a matcher-only object and an empty {}',
            input: [{ path: [{ matcher: 'exact' }], method: [{}] }, { status: 200 }],
        },
        {
            expected: [],
            label: 'field-matcher with no value — does NOT flag a bare {value} shorthand, nor `negate`/`form` (other codes own those)',
            input: [
                {
                    scheme: [{ value: 'https' }],
                    destination: [{ matcher: 'negate' }],
                    body: [{ matcher: 'form' }],
                },
                { status: 200 },
            ],
        },
        {
            expected: [
                'HF308 error 15:17-15:20 Response header values must be an array of strings; wrap it in [ ... ]',
                'HF308 error 16:17-19:13 Response header values must be an array of strings; wrap it in [ ... ]',
            ],
            label: 'response header not an array of strings — flags a plain-string header and an array with a non-string element',
            input: [
                { path: [{ matcher: 'exact', value: '/a' }] },
                { status: 200, headers: { A: 'x', B: [1, '2'], C: ['ok'] } },
            ],
        },
        {
            expected: [
                'HF404 error 12:17-12:21 State values must be strings; Hoverfly rejects this at import',
                'HF404 error 18:17-18:18 State values must be strings; Hoverfly rejects this at import',
            ],
            label: 'non-string state values — flags non-string requiresState/transitionsState values (HF404)',
            input: [
                { path: [{ matcher: 'exact', value: '/a' }], requiresState: { a: true } },
                { status: 200, transitionsState: { b: 2 } },
            ],
        },
        {
            expected: [
                'HF405 error 16:12-16:13 removesState entries must be strings; Hoverfly rejects this at import',
                'HF405 error 17:12-17:16 removesState entries must be strings; Hoverfly rejects this at import',
            ],
            label: 'non-string state values — flags non-string removesState entries (HF405), one per bad element',
            input: [
                { path: [{ matcher: 'exact', value: '/a' }] },
                { status: 200, removesState: ['ok', 5, true] },
            ],
        },
        {
            expected: [],
            label: 'an unknown key on the root, already HF102',
            input: '{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"},"extra":1}',
        },
        {
            expected: [
                'HF603 warning 8:12-8:17 Unknown key "mix" (did you mean "max"?); silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — on a tie, suggests the first key in code-unit order',
            input: [{}, { status: 200, logNormalDelay: { mix: 1 } }],
        },
        {
            expected: [
                'HF603 warning 8:12-8:16 Unknown key "mi" (did you mean "min"?); silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — suggests the nearest key, not the alphabetically first',
            input: [{}, { status: 200, logNormalDelay: { mi: 1 } }],
        },
        {
            expected: [
                'HF603 warning 11:16-11:23 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 9:25-12:15 Matcher has no "value"; it can never match (the value is nil)',
                'HF603 warning 22:18-22:25 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 20:16-23:17 Matcher has no "value"; it can never match (the value is nil)',
            ],
            label: 'unknown key (silent drop) with did-you-mean — walks an object doMatch and a legacy array doMatch',
            input: [
                {
                    path: [
                        { matcher: 'regex', value: 'a', doMatch: { matcher: 'exact', valeu: 'b' } },
                    ],
                    body: [
                        {
                            matcher: 'jsonpath',
                            value: '$',
                            doMatch: [{ matcher: 'exact', valeu: 'c' }],
                        },
                    ],
                },
            ],
        },
        {
            expected: [
                'HF603 warning 9:16-9:23 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 7:14-10:15 Matcher has no "value"; it can never match (the value is nil)',
                'HF603 warning 17:16-17:23 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 15:14-18:15 Matcher has no "value"; it can never match (the value is nil)',
            ],
            label: 'unknown key (silent drop) with did-you-mean — walks the matcher arrays of headers and query',
            input: [
                {
                    headers: { 'X-A': [{ matcher: 'exact', valeu: 'a' }] },
                    query: { q: [{ matcher: 'exact', valeu: 'b' }] },
                },
            ],
        },
        {
            expected: [
                'HF603 warning 8:14-8:21 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 6:12-9:13 Matcher has no "value"; it can never match (the value is nil)',
                'HF603 warning 14:14-14:21 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 12:12-15:13 Matcher has no "value"; it can never match (the value is nil)',
                'HF603 warning 20:14-20:21 Unknown key "valeu" (did you mean "value"?); silently ignored by Hoverfly',
                'HF212 warning 18:12-21:13 Matcher has no "value"; it can never match (the value is nil)',
            ],
            label: 'unknown key (silent drop) with did-you-mean — walks destination, scheme and body matchers',
            input: [
                {
                    destination: [{ matcher: 'exact', valeu: 'a' }],
                    scheme: [{ matcher: 'exact', valeu: 'b' }],
                    body: [{ matcher: 'exact', valeu: 'c' }],
                },
            ],
        },
        {
            expected: [
                'HF603 warning 6:10-6:21 Unknown key "urlPatter" (did you mean "urlPattern"?); silently ignored by Hoverfly',
            ],
            label: 'unknown key (silent drop) with did-you-mean — walks the delaysLogNormal items',
            input: [
                {},
                { status: 200 },
                { globalActions: { delaysLogNormal: [{ min: 1, urlPatter: '/a' }] } },
            ],
        },
        {
            expected: [
                'HF308 error 0:86-0:89 Response header values must be an array of strings; wrap it in [ ... ]',
            ],
            label: 'response header not an array of strings — skips a header with no value and judges the next',
            input: '{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"headers":{"A":,"B":"x"}}}]},"meta":{"schemaVersion":"v5.3"}}',
        },
        {
            expected: [],
            label: 'shapes that are no object — a delay item, a matcher, a request and a response',
            input: [{ path: ['x'] }, 'r', { globalActions: { delays: [5] } }],
        },
        {
            expected: [],
            label: 'shapes that are no object — a request',
            input: ['x'],
        },
        {
            expected: [],
            label: 'shapes that are no object — a document with no meta',
            input: '{"data":{"pairs":[]}}',
        },
        {
            expected: [],
            label: 'shapes that are no object — a root array',
            input: '[]',
        },
        {
            expected: [],
            label: "shapes that are no object — a pair, and data's globalActions",
            input: '{"data":{"pairs":[5],"globalActions":5},"meta":{"schemaVersion":"v5.3"}}',
        },
        {
            expected: [],
            label: 'shapes that are no object — data',
            input: '{"data":5,"meta":{"schemaVersion":"v5.3"}}',
        },
    ])(
        // Given - a request, a response and data holding the case $label names
        // Then - every HF603, HF604, HF212, HF308, HF404 and HF405 diagnostic, its range and its message, or none
        'structureRule — $label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
