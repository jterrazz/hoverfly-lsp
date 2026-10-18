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
        {
            expected: [
                'exact enumMember 7:26',
                '{{ operator 14:18',
                'now function 14:21',
                '}} operator 14:25',
                '{{ operator 17:15',
                'now function 17:18',
                '}} operator 17:22',
            ],
            label: 'templated headers, a bare string and an array with a number',
            input: {
                text: simulation({
                    headers: { A: '{{ now }}', B: [5, '{{ now }}'] },
                    status: 200,
                    templated: true,
                }),
            },
        },
        {
            expected: [],
            label: 'headers when templated is absent, or the string "true"',
            input: {
                text: JSON.stringify({
                    data: {
                        pairs: [
                            { request: {}, response: { headers: { A: '{{ now }}' }, status: 200 } },
                            {
                                request: {},
                                response: { headers: { A: '{{ now }}' }, templated: 'true' },
                            },
                        ],
                    },
                    meta: { schemaVersion: 'v5.3' },
                }),
            },
        },
        {
            expected: [],
            label: 'a response with no body, and matchers with no or a numeric name',
            input: {
                text: simulation(
                    { status: 200 },
                    { path: [{ value: '/a' }, { matcher: 5, value: '/b' }] },
                ),
            },
        },
        {
            expected: [],
            label: 'pairs without meta, in a plain JSON file',
            input: {
                text: JSON.stringify({
                    data: { pairs: [{ request: { path: [{ matcher: 'exact', value: '/' }] } }] },
                }),
                uri: 'file:///plain.json',
            },
        },
        {
            expected: ['exact enumMember 0:50'],
            label: 'pairs without meta, in a file named for Hoverfly',
            input: {
                text: JSON.stringify({
                    data: { pairs: [{ request: { path: [{ matcher: 'exact', value: '/' }] } }] },
                }),
                uri: 'file:///api.hfy',
            },
        },
        {
            expected: ['exact enumMember 7:26'],
            label: 'a templated header array holding an object',
            input: {
                text: simulation({
                    headers: { B: [{ x: '{{ now }}' }] },
                    status: 200,
                    templated: true,
                }),
            },
        },
    ])(
        // Given - a document holding $label
        // Then - every token in document order, on the characters it colors, typed by the legend, or none
        '$label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
