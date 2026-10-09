import { describe, expect, test } from 'vitest';

import { templateTokens } from '../template-tokens.js';

// value: each token as `text type start`, so a token on the wrong characters reads as the wrong text.
function run(template: string): string[] {
    return templateTokens(template).map(
        ({ end, start, type }) => `${template.slice(start, end)} ${type} ${start}`,
    );
}

describe('templateTokens', () => {
    test.each([
        {
            template: '{{#each Request.Body}}{{this.name}}{{/each}}',
            tokens: [
                '{{# operator 0',
                '}} operator 20',
                '{{/ operator 35',
                '}} operator 42',
                'each keyword 3',
                'Request variable 8',
                'Body property 16',
                '{{ operator 22',
                '}} operator 33',
                'this.name parameter 24',
            ],
        },
        {
            template:
                '{{ R.P.[12] }}{{ R.P.1[2] }}{{ R.P.[1]2 }}{{ R.P.a1 }}{{ R.P.1a }}{{ R.P.12 }}{{ R.P.-1 }}',
            tokens: [
                '{{ operator 0',
                '}} operator 12',
                'R variable 3',
                'P property 5',
                '[12] number 7',
                '{{ operator 14',
                '}} operator 26',
                'R variable 17',
                'P property 19',
                '1[2] property 21',
                '{{ operator 28',
                '}} operator 40',
                'R variable 31',
                'P property 33',
                '[1]2 property 35',
                '{{ operator 42',
                '}} operator 52',
                'R variable 45',
                'P property 47',
                'a1 property 49',
                '{{ operator 54',
                '}} operator 64',
                'R variable 57',
                'P property 59',
                '1a property 61',
                '{{ operator 66',
                '}} operator 76',
                'R variable 69',
                'P property 71',
                '12 number 73',
                '{{ operator 78',
                '}} operator 88',
                'R variable 81',
                'P property 83',
                '-1 number 85',
            ],
        },
        {
            template: "{{ concat 'Name' true 1 }}{{ faker 'Name' 'Name' }}",
            tokens: [
                '{{ operator 0',
                '}} operator 24',
                'concat function 3',
                "'Name' string 10",
                'true keyword 17',
                '1 number 22',
                '{{ operator 26',
                '}} operator 49',
                'faker function 29',
                "'Name' enumMember 35",
                "'Name' string 42",
            ],
        },
        {
            template: '{{#each R.P}}x',
            tokens: [
                '{{# operator 0',
                '}} operator 11',
                'each keyword 3',
                'R variable 8',
                'P property 10',
            ],
        },
        {
            template: "{{#if 'Name'}}a{{else}}{{ now }}{{/if}}",
            tokens: [
                '{{# operator 0',
                '}} operator 12',
                '{{/ operator 32',
                '}} operator 37',
                'if keyword 3',
                "'Name' string 6",
                '{{ operator 23',
                '}} operator 30',
                'now function 26',
            ],
        },
        {
            template: '{{ add (add 1 2) 3 }}',
            tokens: [
                '{{ operator 0',
                '}} operator 19',
                'add function 3',
                'add function 8',
                '1 number 12',
                '2 number 14',
                '3 number 17',
            ],
        },
        { template: '{{{ now }}}', tokens: ['{{{ operator 0', '}}} operator 8', 'now function 4'] },
        {
            template: '{{ @index }}',
            tokens: ['{{ operator 0', '}} operator 10', '@index parameter 3'],
        },
        {
            template: '{{ bogus 1 }}',
            tokens: ['{{ operator 0', '}} operator 11', 'bogus variable 3', '1 number 9'],
        },
        { template: '{{ now ', tokens: [] },
        { template: 'plain text', tokens: [] },
    ])(
        // Given - the decoded template $template
        // Then - every token, its delimiters first, with the characters it colors and its legend type
        'templateTokens — $template',
        ({ template, tokens }) => {
            expect(run(template)).toStrictEqual(tokens);
        },
    );
});
