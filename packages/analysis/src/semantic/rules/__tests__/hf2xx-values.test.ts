import { describe, expect, test } from 'vitest';

import { methodSchemeValueRule } from '../hf2xx-values.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (request: object): string[] => diagnosticsOf(methodSchemeValueRule, pairOf(request));

describe('hf2xx-values', () => {
    test.each([
        {
            expected: ['HF215 hint 8:23-8:27 Unknown HTTP method "GT"; did you mean "GET"?'],
            label: 'the typo GT under exact',
            request: { method: [{ matcher: 'exact', value: 'GT' }] },
        },
        {
            expected: ['HF215 hint 7:23-7:30 Unknown HTTP method "DELET"; did you mean "DELETE"?'],
            label: 'the typo DELET under the default matcher',
            request: { method: [{ value: 'DELET' }] },
        },
        {
            expected: [],
            label: 'the standard GET',
            request: { method: [{ matcher: 'exact', value: 'GET' }] },
        },
        {
            expected: [],
            label: 'the custom verb PURGE',
            request: { method: [{ matcher: 'exact', value: 'PURGE' }] },
        },
        {
            expected: [],
            label: 'the custom verb PROPFIND',
            request: { method: [{ matcher: 'exact', value: 'PROPFIND' }] },
        },
        {
            expected: [],
            label: 'the custom verb MKCOL',
            request: { method: [{ matcher: 'exact', value: 'MKCOL' }] },
        },
        {
            expected: [],
            label: 'GT under regex, a pattern',
            request: { method: [{ matcher: 'regex', value: 'GT' }] },
        },
        {
            expected: ['HF216 hint 8:23-8:30 Unknown URI scheme "htttp"; did you mean "http"?'],
            label: 'the typo htttp under exact',
            request: { scheme: [{ matcher: 'exact', value: 'htttp' }] },
        },
        {
            expected: [],
            label: 'the scheme http',
            request: { scheme: [{ matcher: 'exact', value: 'http' }] },
        },
        {
            expected: [],
            label: 'the scheme https',
            request: { scheme: [{ matcher: 'exact', value: 'https' }] },
        },
        {
            expected: [],
            label: 'the scheme ws',
            request: { scheme: [{ matcher: 'exact', value: 'ws' }] },
        },
        {
            expected: [],
            label: 'the scheme wss',
            request: { scheme: [{ matcher: 'exact', value: 'wss' }] },
        },
        {
            expected: [],
            label: 'ftp, a legal scheme two edits from http',
            request: { scheme: [{ matcher: 'exact', value: 'ftp' }] },
        },
    ])(
        // Given - a request whose method or scheme holds $label
        // Then - a Hint only on a near-miss of a standard value, never on a custom one or a pattern
        'methodSchemeValueRule — $label',
        ({ expected, request }) => {
            expect(run(request)).toStrictEqual(expected);
        },
    );
});
