import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { SEMANTIC_TOKEN_TYPES } from '../legend.js';
import { getSemanticTokens } from '../producer.js';

const parser = getLanguageService({});

function simulation(response: object, request?: object): string {
    return JSON.stringify(
        {
            data: {
                pairs: [
                    { request: request ?? { path: [{ matcher: 'exact', value: '/x' }] }, response },
                ],
            },
            meta: { schemaVersion: 'v5.3' },
        },
        null,
        2,
    );
}

// value: each token as `text type line:character`, so a token on the wrong characters reads as the wrong text.
function run({ text, uri = 'file:///s.hoverfly.json' }: { text: string; uri?: string }): string[] {
    const document = TextDocument.create(uri, 'json', 1, text);
    return getSemanticTokens(document, parser.parseJSONDocument(document)).map(
        ({ length, line, startChar, tokenType }) =>
            `${document.getText({ end: { character: startChar + length, line }, start: { character: startChar, line } })} ${SEMANTIC_TOKEN_TYPES[tokenType] ?? String(tokenType)} ${line}:${startChar}`,
    );
}

describe('getSemanticTokens', () => {
    test.each([
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 13:29',
                'Request variable 13:32',
                'Path property 13:40',
                '[1] number 13:45',
                '}} operator 13:49',
                '{{ operator 13:64',
                'now function 13:67',
                "'' string 13:71",
                '}} operator 13:74',
                '{{ operator 13:90',
                'faker function 13:93',
                "'Name' enumMember 13:99",
                '}} operator 13:106',
            ],
            label: "the user's example body, templated",
            input: {
                text: simulation({
                    body: '{"id":"{{ Request.Path.[1] }}","now":"{{ now \'\' }}","name":"{{ faker \'Name\' }}"}',
                    status: 200,
                    templated: true,
                }),
            },
        },
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 13:25',
                'now function 13:28',
                '}} operator 13:32',
            ],
            label: String.raw`a \n escape before the mustache`,
            input: {
                text: simulation({
                    body: String.raw`a\nb {{ now }}`,
                    status: 200,
                    templated: true,
                }),
            },
        },
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 13:28',
                'faker function 13:31',
                "'Name' enumMember 13:37",
                '}} operator 13:44',
            ],
            label: String.raw`a \u00e9 escape before the mustache`,
            input: {
                text: simulation({
                    body: String.raw`x\u00e9 {{ faker 'Name' }}`,
                    status: 200,
                    templated: true,
                }),
            },
        },
        {
            expected: ['jwt enumMember 8:28', 'regex enumMember 15:26'],
            label: 'the regex and jwt matcher names',
            input: {
                text: simulation(
                    { body: 'ok', status: 200 },
                    {
                        headers: { Authorization: [{ matcher: 'jwt', value: 'x' }] },
                        path: [{ matcher: 'regex', value: '.*' }],
                    },
                ),
            },
        },
        {
            expected: [],
            label: 'an unknown matcher name',
            input: {
                text: simulation(
                    { body: 'ok', status: 200 },
                    { path: [{ matcher: 'bogus', value: '/x' }] },
                ),
            },
        },
        {
            expected: [
                'exact enumMember 7:26',
                '{{# operator 13:19',
                'each keyword 13:22',
                'Request variable 13:27',
                'Body property 13:35',
                '}} operator 13:39',
                '{{ operator 13:41',
                'this.name parameter 13:43',
                '}} operator 13:52',
                '{{/ operator 13:54',
                '}} operator 13:61',
            ],
            label: 'an #each block over a request path',
            input: {
                text: simulation({
                    body: '{{#each Request.Body}}{{this.name}}{{/each}}',
                    status: 200,
                    templated: true,
                }),
            },
        },
        {
            expected: [],
            label: 'plain JSON with a template-looking string',
            input: { text: JSON.stringify({ hello: '{{ now }}' }), uri: 'file:///plain.json' },
        },
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 13:19',
                'now function 13:22',
                '}} operator 13:26',
            ],
            label: 'a simulation in a file named for Hoverfly',
            input: {
                text: simulation({ body: '{{ now }}', status: 200, templated: true }),
                uri: 'file:///api.hoverfly.json',
            },
        },
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 13:19',
                'now function 13:22',
                '}} operator 13:26',
            ],
            label: 'template syntax in a body that is not templated',
            input: { text: simulation({ body: '{{ now }}', status: 200 }) },
        },
        {
            expected: ['exact enumMember 7:26'],
            label: 'an unclosed mustache',
            input: { text: simulation({ body: '{{ now ', status: 200, templated: true }) },
        },
    ])(
        // Given - a document holding $label
        // Then - every token in document order, on the characters it colors, typed by the legend — or none
        '$label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
