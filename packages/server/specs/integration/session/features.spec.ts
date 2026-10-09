import { describe, expect, test } from 'vitest';
import {
    CompletionRequest,
    HoverRequest,
    SemanticTokensRequest,
} from 'vscode-languageserver-protocol/node';
import type { ClientCapabilities } from 'vscode-languageserver-protocol/node';

import { integration } from '../integration.specification.js';
import { initialized } from './__setup__/server.js';
import type { Session } from './__setup__/server.js';

const PUSH = { capabilities: { textDocument: {}, workspace: {} } };

const LEGEND = [
    'namespace',
    'keyword',
    'function',
    'variable',
    'property',
    'parameter',
    'enumMember',
    'string',
    'number',
    'operator',
];

const SEMANTIC_TOKENS: { capabilities: ClientCapabilities } = {
    capabilities: {
        textDocument: {
            semanticTokens: {
                dynamicRegistration: false,
                formats: ['relative'],
                requests: { full: true },
                tokenModifiers: [],
                tokenTypes: LEGEND,
            },
        },
    },
};

// value: every document here is one line, so a character is the cursor's offset in the text.
async function labelsAt(
    lsp: Session,
    uri: string,
    text: string,
    cursor: number,
): Promise<string[]> {
    await lsp.open(uri, text);
    const list = await lsp.connection.sendRequest(CompletionRequest.type, {
        position: { character: cursor, line: 0 },
        textDocument: { uri },
    });
    return (Array.isArray(list) ? list : (list?.items ?? [])).map((item) => item.label);
}

// invariant: the wire carries 5 integers per token, each line and column relative to the token before
// on the same line; decoded, each token is read back as the text it colors and the legend type it names.
async function tokensOf(
    lsp: Session,
    uri: string,
    text: string,
): Promise<{ text: string; type: string }[]> {
    await lsp.open(uri, text);
    const { data } = (await lsp.connection.sendRequest(SemanticTokensRequest.type, {
        textDocument: { uri },
    })) ?? { data: [] };
    const lines = text.split('\n');
    const tokens: { text: string; type: string }[] = [];
    let line = 0;
    let column = 0;
    for (let index = 0; index + 4 < data.length; index += 5) {
        const [deltaLine = 0, deltaColumn = 0, length = 0, type = 0] = data.slice(index, index + 4);
        line += deltaLine;
        column = deltaLine === 0 ? column + deltaColumn : deltaColumn;
        tokens.push({
            text: (lines[line] ?? '').slice(column, column + length),
            type: LEGEND[type] ?? String(type),
        });
    }
    return tokens;
}

describe('features', () => {
    test('completes the helpers inside a templated body being typed', async () => {
        // Given - a templated body mid-typing `{{fa`
        const text = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{fa"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await labelsAt(
                lsp,
                'file:///complete-template.hoverfly.json',
                text,
                text.indexOf('{{fa') + 4,
            );
        });

        // Then - the helper list over the wire
        expect(result.value).toMatch([
            'now',
            'randomString',
            'randomStringLength',
            'randomBoolean',
            'randomInteger',
            'randomIntegerRange',
            'randomFloat',
            'randomFloatRange',
            'randomEmail',
            'randomIPv4',
            'randomIPv6',
            'randomUuid',
            'replace',
            'split',
            'concat',
            'length',
            'substring',
            'rightmostCharacters',
            'isNumeric',
            'isAlphanumeric',
            'isBool',
            'isGreaterThan',
            'isGreaterThanOrEqual',
            'isLessThan',
            'isLessThanOrEqual',
            'isBetween',
            'matchesRegex',
            'faker',
            'requestBody',
            'csv',
            'csvMatchingRows',
            'csvAsArray',
            'csvAsMap',
            'csvAddRow',
            'csvDeleteRows',
            'csvCountRows',
            'csvSqlCommand',
            'journal',
            'hasJournalKey',
            'setStatusCode',
            'setHeader',
            'sum',
            'add',
            'subtract',
            'multiply',
            'divide',
            'initArray',
            'addToArray',
            'getArray',
            'putValue',
            'getValue',
            'jsonFromJWT',
            'if',
            'unless',
            'with',
            'each',
            'first',
            'log',
            'lookup',
            'equal',
            'Request',
            'State',
            'Vars',
            'Literals',
        ]);
    });

    test('completes the matcher names at a matcher value', async () => {
        // Given - an empty matcher value on request.path
        const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":""}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await labelsAt(
                lsp,
                'file:///complete-matcher.hoverfly.json',
                text,
                text.indexOf('"matcher":""') + 11,
            );
        });

        // Then - the named registry matchers
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('completes the HTTP methods at an exact method value', async () => {
        // Given - an empty value on an exact request.method matcher
        const text = `{"data":{"pairs":[{"request":{"method":[{"matcher":"exact","value":""}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await labelsAt(
                lsp,
                'file:///complete-method.hoverfly.json',
                text,
                text.indexOf('"value":""') + 9,
            );
        });

        // Then - the standard methods
        expect(result.value).toMatch([
            'GET',
            'HEAD',
            'POST',
            'PUT',
            'DELETE',
            'CONNECT',
            'OPTIONS',
            'TRACE',
            'PATCH',
        ]);
    });

    test('completes a requiresState key another pair sets', async () => {
        // Given - a producer setting `authenticated`, a consumer typing a requiresState key
        const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":"exact","value":"/login"}]},"response":{"status":200,"transitionsState":{"authenticated":"yes"}}},{"request":{"path":[{"matcher":"exact","value":"/me"}],"requiresState":{"":""}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await labelsAt(
                lsp,
                'file:///complete-state-key.hoverfly.json',
                text,
                text.indexOf('"requiresState":{""') + 18,
            );
        });

        // Then - the producer's key and the sequence: snippet
        expect(result.value).toMatch(['authenticated', 'sequence:']);
    });

    test('hovers a matcher name with its registry docs', async () => {
        // Given - a "glob" matcher name on request.path
        const uri = 'file:///hover-matcher.hoverfly.json';
        const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":"glob","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            await lsp.open(uri, text);
            return await lsp.connection.sendRequest(HoverRequest.type, {
                position: { character: text.indexOf('"glob"') + 2, line: 0 },
                textDocument: { uri },
            });
        });

        // Then - the Markdown and the range of the name
        expect(result.value).toMatch({
            contents: [
                '### `glob` matcher\n\nGlob (wildcard) match, e.g. `*.example.com`. Non-string value never matches. https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html\n\n**Value type:** `string`\n**Config:** not supported.\n**doMatch:** AND-semantics — re-tests the same input against the next matcher.',
            ],
            range: {
                start: {
                    line: 0,
                    character: 49,
                },
                end: {
                    line: 0,
                    character: 55,
                },
            },
        });
    });

    test('colors the template constructs of a templated body', async () => {
        // Given - a templated body calling faker
        const text = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{ faker 'Name' }}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(SEMANTIC_TOKENS);
            return await tokensOf(lsp, 'file:///tokens-body.hoverfly.json', text);
        });

        // Then - each token on the characters it colors
        expect(result.value).toMatch([
            {
                text: '{{',
                type: 'operator',
            },
            {
                text: 'faker',
                type: 'function',
            },
            {
                text: "'Name'",
                type: 'enumMember',
            },
            {
                text: '}}',
                type: 'operator',
            },
        ]);
    });

    test('colors nothing in JSON that is no simulation', async () => {
        // Given - arbitrary JSON in config.json
        const result = await integration.call(async () => {
            await using lsp = await initialized(SEMANTIC_TOKENS);
            return await tokensOf(lsp, 'file:///tokens-config.json', `{ "hello": "world" }`);
        });

        // Then - no token
        expect(result.value).toMatch([]);
    });

    test('places the tokens after an astral emoji in UTF-16 code units', async () => {
        // Given - 😊 before the mustache, two UTF-16 units and one code point
        const text = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"😊{{ faker 'Name' }}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            await using lsp = await initialized(SEMANTIC_TOKENS);
            return await tokensOf(lsp, 'file:///tokens-emoji.hoverfly.json', text);
        });

        // Then - each token still on the characters it colors
        expect(result.value).toMatch([
            {
                text: '{{',
                type: 'operator',
            },
            {
                text: 'faker',
                type: 'function',
            },
            {
                text: "'Name'",
                type: 'enumMember',
            },
            {
                text: '}}',
                type: 'operator',
            },
        ]);
    });
});
