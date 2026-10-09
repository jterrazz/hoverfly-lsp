import { describe, expect, test } from 'vitest';
import {
    HoverRequest,
    InitializeRequest,
    ResponseError,
} from 'vscode-languageserver-protocol/node';
import type { ClientCapabilities } from 'vscode-languageserver-protocol/node';

import { integration } from '../integration.specification.js';
import {
    hoverflyLsp,
    initialized,
    initializeParams,
    manifestVersion,
    uninitialized,
} from './__setup__/server.js';

const SEMANTIC_TOKENS_CLIENT: ClientCapabilities = {
    textDocument: {
        semanticTokens: {
            dynamicRegistration: false,
            formats: ['relative'],
            requests: { full: true },
            tokenModifiers: [],
            tokenTypes: [
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
            ],
        },
    },
};

async function refusal(request: Promise<unknown>): Promise<unknown> {
    try {
        return { answered: await request };
    } catch (error: unknown) {
        return error instanceof ResponseError
            ? { code: error.code, message: error.message }
            : { thrown: String(error) };
    }
}

describe('lifecycle', () => {
    test('prints its version', async () => {
        // Given - the packed bin asked for its version
        const version = manifestVersion();
        const result = await integration.call(async () => await hoverflyLsp(['--version']));

        // Then - the manifest's version, whatever release it is at, and a clean exit
        expect(result.value).toMatch({
            exitCode: 0,
            stderr: '',
            stdout: `${version}\n`,
        });
    });

    test('prints its usage', async () => {
        // Given - the packed bin asked for help
        const result = await integration.call(async () => await hoverflyLsp(['--help']));

        // Then - the transports and options, and a clean exit
        expect(result.value).toMatch({
            exitCode: 0,
            stderr: '',
            stdout: 'hoverfly-lsp — Language Server for Hoverfly JSON simulation files\n\nUsage: hoverfly-lsp [transport] [options]\n\nTransports (default: --stdio):\n  --stdio             Communicate over stdin/stdout (default)\n  --node-ipc          Communicate over Node IPC (parent process channel)\n  --socket=PORT       Connect over a TCP socket on PORT\n  --pipe=NAME         Communicate over a named pipe\n\nOptions:\n  --version, -v       Print the version and exit\n  --help, -h          Print this help and exit\n',
        });
    });

    test('refuses an argument it does not know, saying which transports it reads', async () => {
        // Given - a flag no transport and no client injects
        const result = await integration.call(async () => await hoverflyLsp(['--frobnicate']));

        // Then - what was found, why it is refused, the transports to pass and where they are listed, and exit 1
        expect(result.value).toMatch({
            exitCode: 1,
            stderr: 'found: the argument "--frobnicate", which names no transport and no option\nwhy: an editor starts the server with one transport, and an argument it cannot read would be ignored in silence\nfix: pass --stdio (the default), --node-ipc, --socket=PORT or --pipe=NAME\nread: hoverfly-lsp --help\n',
            stdout: '',
        });
    });

    test('advertises completion with its triggers, hover and single-file pull diagnostics', async () => {
        // Given - an initialize that advertises no client capability
        const result = await integration.call(async () => {
            await using lsp = await initialized({});
            return lsp.answer;
        });

        // Then - the capabilities, with no semantic-tokens provider for a client that cannot read one
        expect(result.value).toMatch({
            capabilities: {
                textDocumentSync: {
                    openClose: true,
                    change: 2,
                },
                completionProvider: {
                    triggerCharacters: ['"', '{', '.', '#', '@', "'", '('],
                    resolveProvider: false,
                },
                hoverProvider: true,
                diagnosticProvider: {
                    identifier: 'hoverfly',
                    interFileDependencies: false,
                    workspaceDiagnostics: false,
                },
            },
            serverInfo: {
                name: 'hoverfly-lsp',
            },
        });
    });

    test('advertises the frozen semantic-tokens legend to a client that reads tokens', async () => {
        // Given - a client advertising full semantic-tokens requests
        const result = await integration.call(async () => {
            await using lsp = await initialized({ capabilities: SEMANTIC_TOKENS_CLIENT });
            return lsp.answer.capabilities.semanticTokensProvider;
        });

        // Then - the legend in its order, full and no range
        expect(result.value).toMatch({
            legend: {
                tokenTypes: [
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
                ],
                tokenModifiers: [],
            },
            full: true,
            range: false,
        });
    });

    test('refuses a request sent before initialize with ServerNotInitialized', async () => {
        // Given - a fresh server asked to hover before any initialize
        const result = await integration.call(async () => {
            await using lsp = await uninitialized();
            return await refusal(
                lsp.connection.sendRequest(HoverRequest.type, {
                    position: { character: 0, line: 0 },
                    textDocument: { uri: 'file:///before-init.hoverfly.json' },
                }),
            );
        });

        // Then - -32002, not a benign null
        expect(result.value).toMatch({
            code: -32_002,
            message: 'Server received a request before `initialize`.',
        });
    });

    test('refuses a second initialize with InvalidRequest', async () => {
        // Given - a server initialized once, asked to initialize again
        const result = await integration.call(async () => {
            await using lsp = await initialized({});
            return await refusal(
                lsp.connection.sendRequest(InitializeRequest.type, initializeParams()),
            );
        });

        // Then - -32600, the first answer standing
        expect(result.value).toMatch({
            code: -32_600,
            message: 'Server already initialized; a second initialize request is not allowed.',
        });
    });
});
