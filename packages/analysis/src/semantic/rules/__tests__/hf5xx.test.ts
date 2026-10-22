import { describe, expect, test } from 'vitest';

import { hf5xxTemplateRule } from '../hf5xx.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (input: readonly object[] | string): string[] =>
    diagnosticsOf(
        hf5xxTemplateRule,
        typeof input === 'string'
            ? input
            : pairOf({ path: [{ matcher: 'exact', value: '/x' }] }, input[0], input[1]),
    );

describe('hf5xx', () => {
    test.each([
        {
            expected: [
                'HF501 warning 14:22-14:24 Body contains template syntax but "templated" is not true; it will be sent literally',
            ],
            label: 'template syntax in a non-templated body — warns when {{ }} appears and templated is absent',
            input: [{ status: 200, body: 'Hi {{name}}' }],
        },
        {
            expected: [
                'HF501 warning 14:19-14:21 Body contains template syntax but "templated" is not true; it will be sent literally',
            ],
            label: 'template syntax in a non-templated body — warns when templated is explicitly false',
            input: [{ status: 200, body: '{{now}}', templated: false }],
        },
        {
            expected: [],
            label: 'template syntax in a non-templated body — does NOT warn when templated is true (analysis takes over instead)',
            input: [{ status: 200, body: '{{randomString}}', templated: true }],
        },
        {
            expected: [],
            label: 'template syntax in a non-templated body — does NOT warn on a plain non-template body',
            input: [{ status: 200, body: 'plain text' }],
        },
        {
            expected: [
                'HF501 warning 14:25-14:27 Body contains template syntax but "templated" is not true; it will be sent literally',
            ],
            label: 'template syntax in a non-templated body — points HF501 at the first mustache, source-mapped through escapes',
            input: [{ status: 200, body: String.raw`a\nb {{x}}` }],
        },
        {
            expected: ['HF502 error 14:19-14:25 Unclosed mustache: missing closing braces'],
            label: 'parse errors via doValidation glue — reports an unclosed mustache in a templated body',
            input: [{ status: 200, body: '{{oops', templated: true }],
        },
        {
            expected: ['HF503 error 14:21-14:26 Unknown template helper "bogus"'],
            label: 'unknown helper — flags an unknown helper call in a templated body',
            input: [{ status: 200, body: "{{bogus 'x'}}", templated: true }],
        },
        {
            expected: [],
            label: 'unknown helper — does NOT flag {{State.foo}} as an unknown helper',
            input: [{ status: 200, body: '{{State.foo}}', templated: true }],
        },
        {
            expected: ['HF504 error 14:21-14:28 "replace" expects 3 arguments, got 1 arguments'],
            label: 'arity — flags wrong arity in a templated body',
            input: [{ status: 200, body: "{{replace 'a'}}", templated: true }],
        },
        {
            expected: [],
            label: 'Vars / Literals resolution against data — resolves Vars against data.variables[].name',
            input: [
                { status: 200, body: '{{Vars.id}}', templated: true },
                { variables: [{ name: 'id', function: 'randomUuid' }] },
            ],
        },
        {
            expected: [
                'HF505 error 14:21-14:33 Variable "missing" is not defined in data.variables',
            ],
            label: 'Vars / Literals resolution against data — flags an unresolved Vars.X',
            input: [{ status: 200, body: '{{Vars.missing}}', templated: true }],
        },
        {
            expected: ['HF506 error 14:21-14:34 Literal "gone" is not defined in data.literals'],
            label: 'Vars / Literals resolution against data — flags an unresolved Literals.X',
            input: [{ status: 200, body: '{{Literals.gone}}', templated: true }],
        },
        {
            expected: [
                'HF507 information 14:27-14:33 Unknown faker type "Nope" for gofakeit 6.28.0',
            ],
            label: 'faker — flags an unknown faker type',
            input: [{ status: 200, body: "{{faker 'Nope'}}", templated: true }],
        },
        {
            expected: [
                'HF508 warning 14:27-14:37 faker "Sentence" requires arguments Hoverfly cannot pass; this panics at render time',
            ],
            label: 'faker — flags a parameterized faker method',
            input: [{ status: 200, body: "{{faker 'Sentence'}}", templated: true }],
        },
        {
            expected: [
                'HF509 warning 14:25-14:29 Offset "2w" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)',
            ],
            label: 'now offsets — flags an invalid now offset unit',
            input: [{ status: 200, body: "{{now '2w'}}", templated: true }],
        },
        {
            expected: ['HF503 error 17:17-17:22 Unknown template helper "bogus"'],
            label: 'headers are templated too (report 01 §8) — analyses a templated header value',
            input: [{ status: 200, templated: true, headers: { 'X-Id': ["{{bogus 'x'}}"] } }],
        },
        {
            expected: [],
            label: 'headers are templated too (report 01 §8) — does NOT analyse header values when not templated',
            input: [{ status: 200, headers: { 'X-Id': ["{{bogus 'x'}}"] } }],
        },
        {
            expected: [],
            label: 'rich valid templates stay silent — nested #each with @index, subexpression math, faker, Vars+Literals, now',
            input: [
                {
                    status: 200,
                    body: "{{#each (csvAsMap 'pets')}}{{@index}}:{{this.name}}{{#unless @last}},{{/unless}}{{/each}}{{multiply (Vars.price) '2' '0.00'}}{{faker 'Email'}}{{Literals.brand}}{{now '-1d' 'unix'}}",
                    templated: true,
                },
                {
                    variables: [{ name: 'price', function: 'randomInteger' }],
                    literals: [{ name: 'brand', value: 'acme' }],
                },
            ],
        },
        {
            expected: [],
            label: 'template syntax in a non-templated body — ignores an object body',
            input: [{ status: 200, body: { a: '{{x}}' } }],
        },
        {
            expected: [],
            label: 'unknown helper — ignores a templated object body, no string to render',
            input: [{ status: 200, templated: true, body: { a: "{{bogus 'x'}}" } }],
        },
        {
            expected: ['HF503 error 16:22-16:27 Unknown template helper "bogus"'],
            label: 'headers are templated too (report 01 §8) — analyses a header value given as a bare string',
            input: [{ status: 200, templated: true, headers: { 'X-A': "{{bogus 'x'}}" } }],
        },
        {
            expected: [],
            label: "headers are templated too (report 01 §8) — ignores a numeric header value, the schema's concern",
            input: [{ status: 200, templated: true, headers: { 'X-A': 5 } }],
        },
        {
            expected: ['HF505 error 21:21-21:27 Variable "a" is not defined in data.variables'],
            label: 'Vars / Literals resolution against data — a variable item that is no object, or has no name, declares nothing',
            input: [
                { status: 200, templated: true, body: '{{Vars.a}}' },
                { variables: ['a', { function: 'randomUuid' }] },
            ],
        },
        {
            expected: [],
            label: 'a document whose data is no object',
            input: '{"meta":{"schemaVersion":"v5.3"},"data":5}',
        },
        {
            expected: [],
            label: 'a templated header with no value, a syntax error',
            input: '{"data":{"pairs":[{"request":{},"response":{"templated":true,"headers":{"X-A":}}}]},"meta":{"schemaVersion":"v5.3"}}',
        },
    ])(
        // Given - a response, and the data it declares, holding the case $label names
        // Then - every HF5xx diagnostic, its severity, its range and its message, or none
        'hf5xxTemplateRule — $label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
