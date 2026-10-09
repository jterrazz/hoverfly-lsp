import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
    DidChangeTextDocumentNotification,
    DocumentDiagnosticRequest,
} from 'vscode-languageserver-protocol/node';

import { initialized } from '../__setup__/server.js';
import { integration } from '../integration.specification.js';

// value: a client advertising no `textDocument.diagnostic` gets diagnostics pushed; one advertising it pulls them.
const PUSH = { capabilities: { textDocument: {}, workspace: {} } };
const PULL = { capabilities: { textDocument: { diagnostic: { dynamicRegistration: false } } } };

const danglingStates = readFileSync(
    new URL('../../../../../testdata/invalid/hf4xx/dangling-states.hoverfly.json', import.meta.url),
    'utf8',
);

describe('diagnostics', () => {
    test('pushes the diagnostics of an invalid simulation on open', async () => {
        // Given - a push client opening a simulation whose states dangle three ways
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await lsp.open('file:///dangling-states.hoverfly.json', danglingStates);
        });

        // Then - HF401, HF402 and HF403, each where it stands
        expect(result.value).toMatch({
            uri: 'file:///dangling-states.hoverfly.json',
            version: 1,
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
        });
    });

    test('pushes the diagnostics again after an edit breaks the document', async () => {
        // Given - a clean simulation open, then replaced whole by one whose pairs are an object
        const uri = 'file:///edit.hoverfly.json';
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            const opened = await lsp.open(
                uri,
                `{\n  "data": { "pairs": [] },\n  "meta": { "schemaVersion": "v5.3" }\n}`,
            );
            const edited = lsp.published(uri);
            await lsp.connection.sendNotification(DidChangeTextDocumentNotification.type, {
                contentChanges: [
                    {
                        text: `{\n  "data": { "pairs": {} },\n  "meta": { "schemaVersion": "v5.3" }\n}`,
                    },
                ],
                textDocument: { uri, version: 2 },
            });
            return { edited: await edited, opened };
        });

        // Then - nothing on open, the schema's HF102 after the edit
        expect(result.value).toMatch({
            edited: {
                uri: 'file:///edit.hoverfly.json',
                version: 2,
                diagnostics: [
                    {
                        code: 'HF102',
                        source: 'hoverfly',
                        severity: 2,
                        range: {
                            start: {
                                line: 1,
                                character: 21,
                            },
                            end: {
                                line: 1,
                                character: 23,
                            },
                        },
                        message: 'Incorrect type. Expected "array".',
                        codeDescription: {
                            href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                        },
                    },
                ],
            },
            opened: {
                uri: 'file:///edit.hoverfly.json',
                version: 1,
                diagnostics: [],
            },
        });
    });

    test('pushes no diagnostic for JSON that is no simulation', async () => {
        // Given - arbitrary JSON in config.json
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await lsp.open('file:///config.json', `{ "hello": "world" }`);
        });

        // Then - an empty publication, the server alive
        expect(result.value).toMatch({
            uri: 'file:///config.json',
            version: 1,
            diagnostics: [],
        });
    });

    test('reads a simulation saved behind a BOM as a simulation', async () => {
        // Given - a valid simulation behind a UTF-8 BOM
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await lsp.open(
                'file:///bom.hoverfly.json',
                `﻿{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}}`,
            );
        });

        // Then - nothing, no spurious HF101
        expect(result.value).toMatch({
            uri: 'file:///bom.hoverfly.json',
            version: 1,
            diagnostics: [],
        });
    });

    test('places a range in UTF-16 code units on a line after an astral emoji', async () => {
        // Given - 😊 twice on line 0, an unknown matcher on line 1
        const text = [
            `{ "x": "😊😊", "data": { "pairs": [ {`,
            `"request": { "path": [ { "matcher": "frobnicate", "value": "v" } ] },`,
            `"response": { "status": 200 } } ] }, "meta": { "schemaVersion": "v5.3" } }`,
        ].join('\n');
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await lsp.open('file:///emoji.hoverfly.json', text);
        });

        // Then - HF201 at the columns of line 1 alone
        expect(result.value).toMatch({
            uri: 'file:///emoji.hoverfly.json',
            version: 1,
            diagnostics: [
                {
                    code: 'HF102',
                    source: 'hoverfly',
                    severity: 2,
                    range: {
                        start: {
                            line: 0,
                            character: 2,
                        },
                        end: {
                            line: 0,
                            character: 5,
                        },
                    },
                    message: 'Property x is not allowed.',
                    codeDescription: {
                        href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                    },
                },
                {
                    code: 'HF201',
                    source: 'hoverfly',
                    severity: 1,
                    range: {
                        start: {
                            line: 1,
                            character: 36,
                        },
                        end: {
                            line: 1,
                            character: 48,
                        },
                    },
                    message:
                        'Unknown matcher "frobnicate": Hoverfly panics at match time on unknown matchers',
                    codeDescription: {
                        href: 'https://hoverfly-lsp.dev/diagnostics/hf201',
                    },
                },
            ],
        });
    });

    test('measures a matcher name holding an astral emoji in UTF-16 code units', async () => {
        // Given - "😊exact" as a matcher name: 9 UTF-16 units with its quotes, 8 code points
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            return await lsp.open(
                'file:///emoji2.hoverfly.json',
                `{"data":{"pairs":[{"request":{"path":[{"matcher":"😊exact","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`,
            );
        });

        // Then - HF201 spans the 9 units
        expect(result.value).toMatch({
            uri: 'file:///emoji2.hoverfly.json',
            version: 1,
            diagnostics: [
                {
                    code: 'HF201',
                    source: 'hoverfly',
                    severity: 1,
                    range: {
                        start: {
                            line: 0,
                            character: 49,
                        },
                        end: {
                            line: 0,
                            character: 58,
                        },
                    },
                    message:
                        'Unknown matcher "😊exact": Hoverfly panics at match time on unknown matchers',
                    codeDescription: {
                        href: 'https://hoverfly-lsp.dev/diagnostics/hf201',
                    },
                },
            ],
        });
    });

    test('answers a pulled report with the diagnostics a push would carry', async () => {
        // Given - a pull client with the dangling-states simulation open
        const uri = 'file:///pull.hoverfly.json';
        const result = await integration.call(async () => {
            await using lsp = await initialized(PULL);
            await lsp.connection.sendNotification('textDocument/didOpen', {
                textDocument: { languageId: 'json', text: danglingStates, uri, version: 1 },
            });
            return await lsp.connection.sendRequest(DocumentDiagnosticRequest.type, {
                textDocument: { uri },
            });
        });

        // Then - a full report of HF401, HF402 and HF403
        expect(result.value).toMatch({
            kind: 'full',
            items: [
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
        });
    });

    test('raises HF602 against the actions initializationOptions registers', async () => {
        // Given - a client with no workspace/configuration, registering one action at initialize
        const text = readFileSync(
            new URL(
                '../../../../../testdata/invalid/globalactions/hf602-postserveaction-silent-without-settings.hoverfly.json',
                import.meta.url,
            ),
            'utf8',
        );
        const result = await integration.call(async () => {
            await using lsp = await initialized({
                ...PUSH,
                initializationOptions: { registeredActions: ['knownAction'] },
            });
            return await lsp.open('file:///postserve.hoverfly.json', text);
        });

        // Then - the action outside the allowlist is HF602
        expect(result.value).toMatch({
            uri: 'file:///postserve.hoverfly.json',
            version: 1,
            diagnostics: [
                {
                    code: 'HF602',
                    source: 'hoverfly',
                    severity: 3,
                    range: {
                        start: {
                            line: 11,
                            character: 39,
                        },
                        end: {
                            line: 11,
                            character: 64,
                        },
                    },
                    message:
                        'Action "unregisteredCleanupHook" is not in your configured registeredActions',
                    codeDescription: {
                        href: 'https://hoverfly-lsp.dev/diagnostics/hf602',
                    },
                },
            ],
        });
    });
});
