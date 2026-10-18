import { describe, expect, test } from 'vitest';

import { analyze } from '../analyzer.js';

describe('analyze', () => {
    test.each([
        {
            findings: [
                {
                    args: { message: 'Unclosed mustache: missing closing braces' },
                    end: 12,
                    kind: 'HF502',
                    start: 6,
                },
            ],
            literals: [],
            template: 'hello {{name',
            variables: [],
        },
        {
            findings: [
                {
                    args: { message: 'Unclosed block {{#each}}: missing {{/each}}' },
                    end: 12,
                    kind: 'HF502',
                    start: 0,
                },
            ],
            literals: [],
            template: '{{#each xs}}{{this}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: {
                        message: 'Mismatched closing block: expected {{/if}} but found {{/each}}',
                    },
                    end: 19,
                    kind: 'HF502',
                    start: 10,
                },
            ],
            literals: [],
            template: '{{#if x}}a{{/each}}',
            variables: [],
        },
        { findings: [], literals: [], template: 'just some text', variables: [] },
        {
            findings: [{ args: { name: 'bogus' }, end: 7, kind: 'HF503', start: 2 }],
            literals: [],
            template: "{{bogus 'x'}}",
            variables: [],
        },
        {
            findings: [{ args: { name: 'bogus' }, end: 8, kind: 'HF503', start: 3 }],
            literals: [],
            template: '{{#bogus}}a{{/bogus}}',
            variables: [],
        },
        {
            findings: [{ args: { name: 'bogus' }, end: 15, kind: 'HF503', start: 10 }],
            literals: [],
            template: "{{concat (bogus 'x')}}",
            variables: [],
        },
        { findings: [], literals: [], template: '{{State.foo}}', variables: [] },
        {
            findings: [],
            literals: [],
            template: '{{Request.Path}} {{Request.QueryParam.x}}',
            variables: [],
        },
        { findings: [], literals: [], template: '{{something}}', variables: [] },
        { findings: [], literals: [], template: '{{randomString}}', variables: [] },
        {
            findings: [],
            literals: [],
            template: "{{Request.Body 'jsonpath' '$.x'}}",
            variables: [],
        },
        {
            findings: [],
            literals: [],
            template: '{{#each xs}}{{@index}}:{{this.id}}{{/each}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: { n: '1', name: 'replace', sig: '3 arguments' },
                    end: 9,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            literals: [],
            template: "{{replace 'a'}}",
            variables: [],
        },
        {
            findings: [],
            literals: [],
            template: '{{#equal a b}}x{{else}}y{{/equal}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: { n: '1', name: 'equal', sig: '2 arguments' },
                    end: 8,
                    kind: 'HF504',
                    start: 3,
                },
            ],
            literals: [],
            template: '{{#equal a}}x{{/equal}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: { n: '0', name: 'randomString', sig: 'an inline helper' },
                    end: 15,
                    kind: 'HF504',
                    start: 3,
                },
            ],
            literals: [],
            template: '{{#randomString}}x{{/randomString}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: { n: '1', name: 'each', sig: 'a block helper' },
                    end: 6,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            literals: [],
            template: '{{each xs}}',
            variables: [],
        },
        { findings: [], literals: [], template: '{{concat}}', variables: [] },
        { findings: [], literals: [], template: "{{concat 'a' 'b' 'c'}}", variables: [] },
        { findings: [], literals: [], template: '{{now}}', variables: [] },
        { findings: [], literals: [], template: "{{now '-1d'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '-1d' 'unix'}}", variables: [] },
        {
            findings: [{ args: { x: 'missing' }, end: 14, kind: 'HF505', start: 2 }],
            literals: [],
            template: '{{Vars.missing}}',
            variables: ['present'],
        },
        { findings: [], literals: [], template: '{{Vars.present}}', variables: ['present'] },
        {
            findings: [{ args: { x: 'gone' }, end: 15, kind: 'HF506', start: 2 }],
            literals: ['here'],
            template: '{{Literals.gone}}',
            variables: [],
        },
        { findings: [], literals: ['here'], template: '{{Literals.here}}', variables: [] },
        {
            findings: [{ args: { x: 'nope' }, end: 18, kind: 'HF505', start: 9 }],
            literals: [],
            template: '{{length Vars.nope}}',
            variables: [],
        },
        { findings: [], literals: [], template: "{{faker 'Name'}}", variables: [] },
        {
            findings: [
                { args: { t: 'Nope', version: '6.28.0' }, end: 14, kind: 'HF507', start: 8 },
            ],
            literals: [],
            template: "{{faker 'Nope'}}",
            variables: [],
        },
        {
            findings: [{ args: { t: 'Number' }, end: 16, kind: 'HF508', start: 8 }],
            literals: [],
            template: "{{faker 'Number'}}",
            variables: [],
        },
        { findings: [], literals: [], template: '{{faker Vars.kind}}', variables: ['kind'] },
        { findings: [], literals: [], template: "{{faker (getValue 'k')}}", variables: [] },
        { findings: [], literals: [], template: "{{now ''}}", variables: [] },
        { findings: [], literals: [], template: "{{now '0'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '1d'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '+2h45m'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '1d12h'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '-1.5h'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '300ms'}}", variables: [] },
        { findings: [], literals: [], template: "{{now '5µs'}}", variables: [] },
        {
            findings: [{ args: { o: '2w' }, end: 10, kind: 'HF509', start: 6 }],
            literals: [],
            template: "{{now '2w'}}",
            variables: [],
        },
        {
            findings: [{ args: { o: 'cat' }, end: 11, kind: 'HF509', start: 6 }],
            literals: [],
            template: "{{now 'cat'}}",
            variables: [],
        },
        { findings: [], literals: [], template: '{{now Vars.off}}', variables: ['off'] },
        {
            findings: [{ args: { name: 'bogus' }, end: 10, kind: 'HF503', start: 5 }],
            literals: [],
            template: 'xx {{bogus 1}}',
            variables: [],
        },
        {
            findings: [
                {
                    args: { message: 'Block open {{#...}} is missing a helper name' },
                    end: 5,
                    kind: 'HF502',
                    start: 0,
                },
            ],
            literals: [],
            template: '{{#}}a{{/}}',
            variables: [],
        },
        { findings: [], literals: [], template: '{{ Vars }}', variables: [] },
        { findings: [], literals: [], template: '{{ @Vars.x }}', variables: [] },
        { findings: [], literals: [], template: '{{ this.Vars.x }}', variables: [] },
        {
            findings: [{ args: { name: 'bogus' }, end: 25, kind: 'HF503', start: 20 }],
            literals: [],
            template: '{{#if x}}a{{else}}{{bogus 1}}{{/if}}',
            variables: [],
        },
        {
            findings: [{ args: { name: 'bogus' }, end: 12, kind: 'HF503', start: 7 }],
            literals: [],
            template: '{{#if (bogus 1)}}a{{/if}}',
            variables: [],
        },
        {
            findings: [{ args: { name: 'bogus' }, end: 16, kind: 'HF503', start: 11 }],
            literals: [],
            template: '{{#if x}}{{bogus 1}}{{/if}}',
            variables: [],
        },
        {
            findings: [],
            literals: [],
            template: '{{ Request.Body "jsonpath" "$.x" }}',
            variables: [],
        },
        { findings: [], literals: [], template: '{{ concat Vars }}', variables: [] },
    ])(
        // Given - $template, with the variables and literals the document declares
        // Then - every HF502 to HF509 finding, its span and its message arguments, or none
        'analyzes $template',
        ({ findings, literals, template, variables }) => {
            expect(
                analyze(template, {
                    literalNames: new Set(literals),
                    variableNames: new Set(variables),
                }),
            ).toStrictEqual(findings);
        },
    );

    test('analyzes a Vars reference with no context as declaring nothing', () => {
        // Given - a template naming a variable, analyzed with no document context
        const findings = analyze('{{ Vars.x }}');

        // Then - the variable is undeclared
        expect(findings).toStrictEqual([{ args: { x: 'x' }, end: 9, kind: 'HF505', start: 3 }]);
    });
});
