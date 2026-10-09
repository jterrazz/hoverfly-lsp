import { describe, expect, test } from 'vitest';
import {
    CompletionRequest,
    DocumentDiagnosticRequest,
    HoverRequest,
    ResponseError,
    SemanticTokensRequest,
} from 'vscode-languageserver-protocol/node';

import { integration } from '../integration.specification.js';
import { corpusFile, initialized, uninitialized } from './__setup__/server.js';

const URI = 'file:///dangling-states.hoverfly.json';
const UNOPENED = { textDocument: { uri: 'file:///never-opened.hoverfly.json' } };
const danglingStates = corpusFile('invalid/hf4xx/dangling-states.hoverfly.json');

// value: a client advertising pull diagnostics and full semantic tokens, so every request below is
// one it may send.
const READER = {
    capabilities: {
        textDocument: {
            diagnostic: { dynamicRegistration: false },
            semanticTokens: {
                formats: ['relative' as const],
                requests: { full: true },
                tokenModifiers: [],
                tokenTypes: ['namespace', 'keyword', 'function', 'variable'],
            },
        },
    },
};

async function outcome(request: Promise<unknown>): Promise<unknown> {
    try {
        return { answered: await request };
    } catch (error: unknown) {
        return error instanceof ResponseError
            ? { code: error.code, message: error.message }
            : { thrown: String(error) };
    }
}

describe('requests', () => {
    test('refuses a pull and a token request sent before initialize', async () => {
        // Given - a fresh server asked for diagnostics and tokens before any initialize
        const result = await integration.call(async () => {
            await using lsp = await uninitialized();
            return {
                pulled: await outcome(
                    lsp.connection.sendRequest(DocumentDiagnosticRequest.type, UNOPENED),
                ),
                tokens: await outcome(
                    lsp.connection.sendRequest(SemanticTokensRequest.type, UNOPENED),
                ),
            };
        });

        // Then - ServerNotInitialized for both
        expect(result.value).toMatch({
            pulled: {
                code: -32_002,
                message: 'Server received a request before `initialize`.',
            },
            tokens: {
                code: -32_002,
                message: 'Server received a request before `initialize`.',
            },
        });
    });

    test('answers empty for a document it does not hold', async () => {
        // Given - an initialized reader asking about a document it never opened
        const result = await integration.call(async () => {
            await using lsp = await initialized(READER);
            const position = { character: 0, line: 0 };
            const tokens = await lsp.connection.sendRequest(SemanticTokensRequest.type, UNOPENED);
            return {
                completion: await lsp.connection.sendRequest(CompletionRequest.type, {
                    ...UNOPENED,
                    position,
                }),
                hover: await lsp.connection.sendRequest(HoverRequest.type, {
                    ...UNOPENED,
                    position,
                }),
                pulled: await lsp.connection.sendRequest(DocumentDiagnosticRequest.type, UNOPENED),
                tokens: tokens?.data,
            };
        });

        // Then - no completion, no hover, an empty full report and no token
        expect(result.value).toMatch({
            completion: null,
            hover: null,
            pulled: {
                items: [],
                kind: 'full',
            },
            tokens: [],
        });
    });

    test('answers no token to a client that did not advertise semantic tokens', async () => {
        // Given - a client with no semantic-tokens capability, asking for the tokens of a simulation
        const result = await integration.call(async () => {
            await using lsp = await initialized({});
            await lsp.open(URI, danglingStates);
            const tokens = await lsp.connection.sendRequest(SemanticTokensRequest.type, {
                textDocument: { uri: URI },
            });
            return tokens?.data;
        });

        // Then - an empty token list
        expect(result.value).toMatch([]);
    });
});
