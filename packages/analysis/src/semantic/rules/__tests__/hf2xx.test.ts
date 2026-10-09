import { describe, expect, test } from 'vitest';

import { hf2xxMatcherRule } from '../hf2xx.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (request: object): string[] => diagnosticsOf(hf2xxMatcherRule, pairOf(request));

describe('hf2xx', () => {
    test.each([
        {
            expected: [
                'HF201 error 7:25-7:32 Unknown matcher "xform": Hoverfly panics at match time on unknown matchers',
            ],
            label: 'unknown matcher — flags an unregistered matcher name with a panic message on the name node',
            request: { path: [{ matcher: 'xform', value: 'x' }] },
        },
        {
            expected: [],
            label: 'unknown matcher — does not flag the empty-string default matcher name',
            request: { path: [{ matcher: '', value: 'x' }] },
        },
        {
            expected: [],
            label: 'unknown matcher — does not flag a matcher with no matcher field (default exact)',
            request: { path: [{ value: 'x' }] },
        },
        {
            expected: ['HF202 hint 7:25-7:38 Prefer canonical lowercase "jsonpartial"'],
            label: 'non-canonical casing — hints the canonical lowercase for jsonPartial',
            request: { body: [{ matcher: 'jsonPartial', value: '{}' }] },
        },
        {
            expected: [
                'HF202 hint 7:25-7:32 Prefer canonical lowercase "exact"',
                'HF203 error 8:23-8:25 Matcher "exact" expects a string; this pair will never match',
            ],
            label: 'non-canonical casing — hints for upper-cased EXACT and still validates its value type',
            request: { path: [{ matcher: 'EXACT', value: {} }] },
        },
        {
            expected: [
                'HF203 error 8:23-8:25 Matcher "exact" expects a string; this pair will never match',
            ],
            label: 'value type mismatch — flags an object value on a string matcher',
            request: { path: [{ matcher: 'exact', value: {} }] },
        },
        {
            expected: [
                'HF203 error 8:23-8:28 Matcher "array" expects a JSON array; this pair will never match',
            ],
            label: 'value type mismatch — flags a string value on the array matcher',
            request: { body: [{ matcher: 'array', value: 'a;b' }] },
        },
        {
            expected: [],
            label: 'value type mismatch — does not flag a correct array value',
            request: { body: [{ matcher: 'array', value: ['a', 'b'] }] },
        },
        {
            expected: [
                'HF204 error 9:24-9:26 "config" is only supported by the "array" matcher; Hoverfly panics on this',
            ],
            label: 'config on a non-array matcher — flags config on exact, even when empty',
            request: { path: [{ matcher: 'exact', value: 'x', config: {} }] },
        },
        {
            expected: [],
            label: 'config on a non-array matcher — does not flag config on the array matcher',
            request: { body: [{ matcher: 'array', value: ['a'], config: { ignoreOrder: true } }] },
        },
        {
            expected: [
                'HF205 warning 12:16-12:28 Unknown config key "ignoreCase" (ignored by Hoverfly)',
            ],
            label: 'unknown array config key — warns on an unrecognised config key',
            request: { body: [{ matcher: 'array', value: ['a'], config: { ignoreCase: true } }] },
        },
        {
            expected: [
                'HF206 error 12:31-12:37 Config values must be booleans; Hoverfly panics on a string',
            ],
            label: 'non-boolean array config value — flags a string config value as a panic',
            request: {
                body: [{ matcher: 'array', value: ['a'], config: { ignoreOrder: 'true' } }],
            },
        },
        {
            expected: [
                'HF207 warning 8:23-8:24 "negate" with a non-string value always matches (vacuous true); likely not what you want',
            ],
            label: 'negate with a non-string value — warns about vacuous-true on a numeric negate value',
            request: { path: [{ matcher: 'negate', value: 5 }] },
        },
        {
            expected: [],
            label: 'negate with a non-string value — does not flag negate with a string value',
            request: { path: [{ matcher: 'negate', value: 'x' }] },
        },
        {
            expected: [
                'HF208 error 8:27-8:33 "form" is only valid on the body field; elsewhere Hoverfly panics',
            ],
            label: 'form mis-placed — flags lowercase form on a header field',
            request: { headers: { 'Content-Type': [{ matcher: 'form', value: { a: [] } }] } },
        },
        {
            expected: [
                'HF208 error 10:27-10:33 "form" is only valid on the body field; elsewhere Hoverfly panics',
            ],
            label: 'form mis-placed — flags form inside an object-shaped doMatch chain even on the body',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.x',
                        doMatch: { matcher: 'form', value: { a: [] } },
                    },
                ],
            },
        },
        {
            expected: [
                'HF208 error 11:29-11:35 "form" is only valid on the body field; elsewhere Hoverfly panics',
            ],
            label: 'form mis-placed — flags form inside a legacy array-shaped doMatch chain too',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.x',
                        doMatch: [{ matcher: 'form', value: { a: [] } }],
                    },
                ],
            },
        },
        {
            expected: [],
            label: 'form mis-placed — does not flag lowercase form on the body top level',
            request: {
                body: [
                    { matcher: 'form', value: { username: [{ matcher: 'exact', value: 'a' }] } },
                ],
            },
        },
        {
            expected: [
                'HF209 error 7:25-7:31 "form" is case-sensitive; "Form" hits the registry and panics Hoverfly',
            ],
            label: 'wrong-case form — flags Form (case-sensitive) on the body',
            request: { body: [{ matcher: 'Form', value: { a: [] } }] },
        },
        {
            expected: [
                'HF209 error 8:27-8:33 "form" is case-sensitive; "FORM" hits the registry and panics Hoverfly',
            ],
            label: 'wrong-case form — flags FORM regardless of placement',
            request: { headers: { X: [{ matcher: 'FORM', value: { a: [] } }] } },
        },
        {
            expected: [
                'HF210 hint 9:14-9:23 "exact" passes the same value through; this chain is an AND of matchers on one value',
            ],
            label: 'doMatch after an identity matcher — hints that a chain after exact is an AND on one value (object shape)',
            request: {
                path: [
                    { matcher: 'exact', value: '/x', doMatch: { matcher: 'glob', value: '/*' } },
                ],
            },
        },
        {
            expected: [],
            label: 'doMatch after an identity matcher — does not hint after a transforming matcher (jsonpath, object shape)',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.x',
                        doMatch: { matcher: 'exact', value: 'y' },
                    },
                ],
            },
        },
        {
            expected: [
                'HF210 hint 9:14-9:23 "exact" passes the same value through; this chain is an AND of matchers on one value',
                'HF210 hint 12:16-12:25 "exact" passes the same value through; this chain is an AND of matchers on one value',
            ],
            label: 'doMatch after an identity matcher — recurses object-shaped chains: HF210 fires at every identity level',
            request: {
                path: [
                    {
                        matcher: 'exact',
                        value: 'a',
                        doMatch: {
                            matcher: 'exact',
                            value: 'b',
                            doMatch: { matcher: 'exact', value: 'c' },
                        },
                    },
                ],
            },
        },
        {
            expected: [
                'HF201 error 10:27-10:33 Unknown matcher "nope": Hoverfly panics at match time on unknown matchers',
            ],
            label: 'object-shaped doMatch recursion (HF201/HF203/HF210) — fires HF201 on an unknown matcher nested in an object doMatch',
            request: {
                body: [
                    { matcher: 'jsonpath', value: '$.x', doMatch: { matcher: 'nope', value: 'y' } },
                ],
            },
        },
        {
            expected: [
                'HF203 error 11:25-11:30 Matcher "array" expects a JSON array; this pair will never match',
            ],
            label: 'object-shaped doMatch recursion (HF201/HF203/HF210) — fires HF203 on a value-type mismatch nested in an object doMatch',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.x',
                        doMatch: { matcher: 'array', value: 'a;b' },
                    },
                ],
            },
        },
        {
            expected: ['HF211 warning 8:23-8:25 Empty regex value never matches'],
            label: 'empty value that never matches — warns on an empty regex value',
            request: { path: [{ matcher: 'regex', value: '' }] },
        },
        {
            expected: ['HF211 warning 8:23-8:25 Empty jwtjsonpath value never matches'],
            label: 'empty value that never matches — warns on an empty jwtjsonpath value',
            request: { body: [{ matcher: 'jwtjsonpath', value: '' }] },
        },
        {
            expected: [],
            label: 'empty value that never matches — does not flag an empty exact value (empty exact can legitimately match)',
            request: { path: [{ matcher: 'exact', value: '' }] },
        },
        {
            expected: [
                'HF201 error 8:27-8:33 Unknown matcher "nope": Hoverfly panics at match time on unknown matchers',
            ],
            label: 'placement / container shapes — handles query as an object-of-arrays',
            request: { query: { q: [{ matcher: 'nope', value: 'x' }] } },
        },
        {
            expected: [],
            label: 'placement / container shapes — requiresState is not a matcher field and is ignored',
            request: {
                path: [{ matcher: 'exact', value: '/x' }],
                requiresState: { authed: 'true' },
            },
        },
    ])(
        // Given - a request whose matchers hold the case $label names
        // Then - every HF2xx diagnostic, its severity, its range and its message, or none
        'hf2xxMatcherRule — $label',
        ({ expected, request }) => {
            expect(run(request)).toStrictEqual(expected);
        },
    );
});
