import { describe, expect, test } from 'vitest';
import {
    DidChangeTextDocumentNotification,
    DidCloseTextDocumentNotification,
} from 'vscode-languageserver-protocol/node';

import { integration } from '../integration.specification.js';
import { corpusFile, initialized } from './__setup__/server.js';

const PUSH = { capabilities: { textDocument: {}, workspace: {} } };
const PULL = { capabilities: { textDocument: { diagnostic: { dynamicRegistration: false } } } };

const URI = 'file:///dangling-states.hoverfly.json';
const danglingStates = corpusFile('invalid/hf4xx/dangling-states.hoverfly.json');
const CLEAN = `{\n  "data": { "pairs": [] },\n  "meta": { "schemaVersion": "v5.3" }\n}`;
const PAIRS_AS_OBJECT = `{\n  "data": { "pairs": {} },\n  "meta": { "schemaVersion": "v5.3" }\n}`;

describe('publication', () => {
    test('publishes once, for the newer version, after two edits inside the debounce', async () => {
        // Given - a push client with a clean simulation open, then breaking and repairing it at once
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            await lsp.open(URI, CLEAN);
            await lsp.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                contentChanges: [{ text: PAIRS_AS_OBJECT }],
                textDocument: { uri: URI, version: 2 },
            });
            await lsp.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                contentChanges: [{ text: danglingStates }],
                textDocument: { uri: URI, version: 3 },
            });
            await lsp.settled();
            return lsp.publications.slice(1);
        });

        // Then - one publication, version 3's, and none for version 2
        expect(result.value).toMatch([
            {
                uri: 'file:///dangling-states.hoverfly.json',
                version: 3,
                diagnostics: [
                    {
                        code: 'HF401',
                        source: 'hoverfly',
                        severity: 2,
                        range: {
                            start: {
                                line: 7,
                                character: 24,
                            },
                            end: {
                                line: 7,
                                character: 39,
                            },
                        },
                        message:
                            'State "authenticated" is required but never set by any transitionsState; this pair can only match if the state is set externally',
                        codeDescription: {
                            href: 'https://hoverfly-lsp.dev/diagnostics/hf401',
                        },
                    },
                    {
                        code: 'HF402',
                        source: 'hoverfly',
                        severity: 3,
                        range: {
                            start: {
                                line: 13,
                                character: 24,
                            },
                            end: {
                                line: 13,
                                character: 33,
                            },
                        },
                        message: 'State "visited" is set but never required in this simulation',
                        codeDescription: {
                            href: 'https://hoverfly-lsp.dev/diagnostics/hf402',
                        },
                    },
                    {
                        code: 'HF403',
                        source: 'hoverfly',
                        severity: 3,
                        range: {
                            start: {
                                line: 23,
                                character: 37,
                            },
                            end: {
                                line: 23,
                                character: 51,
                            },
                        },
                        message: 'State "sessionToken" is removed but never set',
                        codeDescription: {
                            href: 'https://hoverfly-lsp.dev/diagnostics/hf403',
                        },
                    },
                ],
            },
        ]);
    });

    test('clears a document closed inside the debounce, and pushes nothing for it after', async () => {
        // Given - a push client editing a simulation, then closing it before the push is due
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            await lsp.open(URI, danglingStates);
            await lsp.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                contentChanges: [{ text: PAIRS_AS_OBJECT }],
                textDocument: { uri: URI, version: 2 },
            });
            await lsp.connection.sendNotification(DidCloseTextDocumentNotification.type, {
                textDocument: { uri: URI },
            });
            await lsp.settled();
            return lsp.publications.slice(1);
        });

        // Then - one empty publication, the edit's push never made
        expect(result.value).toMatch([
            {
                uri: 'file:///dangling-states.hoverfly.json',
                diagnostics: [],
            },
        ]);
    });

    test('never pushes to a client that pulls', async () => {
        // Given - a pull client opening, editing and closing a simulation
        const result = await integration.call(async () => {
            await using lsp = await initialized(PULL);
            await lsp.connection.sendNotification('textDocument/didOpen', {
                textDocument: { languageId: 'json', text: danglingStates, uri: URI, version: 1 },
            });
            await lsp.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                contentChanges: [{ text: PAIRS_AS_OBJECT }],
                textDocument: { uri: URI, version: 2 },
            });
            await lsp.settled();
            await lsp.connection.sendNotification(DidCloseTextDocumentNotification.type, {
                textDocument: { uri: URI },
            });
            await lsp.settled();
            return lsp.publications;
        });

        // Then - no publication at all
        expect(result.value).toMatch([]);
    });
});
