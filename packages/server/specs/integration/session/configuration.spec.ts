import { describe, expect, test } from 'vitest';
import {
    CompletionRequest,
    DidChangeConfigurationNotification,
} from 'vscode-languageserver-protocol/node';

import { integration } from '../integration.specification.js';
import { corpusFile, initialized } from './__setup__/server.js';
import type { Client } from './__setup__/server.js';

// value: a client advertising no `workspace.configuration` has its settings pushed; one advertising
// it, with dynamic registration of configuration changes, is asked for them.
const PUSH = { capabilities: { textDocument: {}, workspace: {} } };
const ASKED = {
    capabilities: {
        workspace: { configuration: true, didChangeConfiguration: { dynamicRegistration: true } },
    },
};

// value: the simulation calls one action, `unregisteredCleanupHook`; with no registeredActions it is
// silent, with any list that misses it HF602 names it.
const URI = 'file:///postserve.hoverfly.json';
const POST_SERVE = corpusFile(
    'invalid/globalactions/hf602-postserveaction-silent-without-settings.hoverfly.json',
);
const KNOWN_ACTION = { registeredActions: ['knownAction'] };

describe('configuration', () => {
    test('reads the configured actions before its first publication', async () => {
        // Given - a client that is asked for its settings, registering one action
        const result = await integration.call(async () => {
            await using lsp = await initialized(ASKED, { configuration: KNOWN_ACTION });
            const published = await lsp.open(URI, POST_SERVE);
            return {
                configurationRequests: lsp.configurationRequests,
                logged: lsp.logged,
                published,
                registrations: lsp.registrations,
            };
        });

        // Then - the hoverfly section asked for, configuration changes registered, HF602 from the start
        expect(result.value).toMatch({
            configurationRequests: [['hoverfly']],
            logged: [],
            published: {
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
            },
            registrations: [
                {
                    method: 'workspace/didChangeConfiguration',
                    registerOptions: {
                        section: 'hoverfly',
                    },
                },
            ],
        });
    });

    test('publishes again once a configuration slower than the debounce arrives', async () => {
        // Given - a client registering one action, answering for its settings after the first push
        const result = await integration.call(async () => {
            await using lsp = await initialized(ASKED, {
                configuration: KNOWN_ACTION,
                configurationDelay: 600,
            });
            const opened = await lsp.open(URI, POST_SERVE);
            return { configured: await lsp.published(URI), opened };
        });

        // Then - silent before the settings arrive, HF602 once the open document is validated again
        expect(result.value).toMatch({
            configured: {
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
            },
            opened: {
                uri: 'file:///postserve.hoverfly.json',
                version: 1,
                diagnostics: [],
            },
        });
    });

    test('still reads its configuration when the client refuses the registration', async () => {
        // Given - a client that is asked for its settings, refusing the dynamic registration
        const result = await integration.call(async () => {
            await using lsp = await initialized(ASKED, {
                configuration: KNOWN_ACTION,
                refuses: ['registration'],
            });
            const published = await lsp.open(URI, POST_SERVE);
            return { logged: lsp.logged, published };
        });

        // Then - the refusal logged, and HF602 from the settings read all the same
        expect(result.value).toMatch({
            logged: [
                '3 Registering request handler for workspace/didChangeConfiguration failed.',
                "1 hoverfly-lsp: failed to register for configuration changes: Error: the spec's client refuses client/registerCapability",
            ],
            published: {
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
            },
        });
    });

    test('keeps the settings it was initialized with when the configuration cannot be read', async () => {
        // Given - a client registering one action at initialize, then refusing workspace/configuration
        const result = await integration.call(async () => {
            await using lsp = await initialized(
                { ...ASKED, initializationOptions: KNOWN_ACTION },
                { refuses: ['configuration'] },
            );
            const published = await lsp.open(URI, POST_SERVE);
            return { logged: lsp.logged, published };
        });

        // Then - the failed read logged, and HF602 from initializationOptions
        expect(result.value).toMatch({
            logged: [
                "1 hoverfly-lsp: failed to read configuration: Error: the spec's client refuses workspace/configuration",
            ],
            published: {
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
            },
        });
    });

    test('asks for its configuration again when the client says it changed', async () => {
        // Given - a client with no setting at first, which then registers one action and notifies
        const client: Client = {};
        const result = await integration.call(async () => {
            await using lsp = await initialized(ASKED, client);
            const opened = await lsp.open(URI, POST_SERVE);
            client.configuration = KNOWN_ACTION;
            const changed = lsp.published(URI);
            await lsp.connection.sendNotification(DidChangeConfigurationNotification.type, {
                settings: null,
            });
            return {
                changed: await changed,
                configurationRequests: lsp.configurationRequests,
                opened,
            };
        });

        // Then - silent on open, HF602 once the settings are read again
        expect(result.value).toMatch({
            changed: {
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
            },
            configurationRequests: [['hoverfly'], ['hoverfly']],
            opened: {
                uri: 'file:///postserve.hoverfly.json',
                version: 1,
                diagnostics: [],
            },
        });
    });

    test('takes the settings a client without workspace/configuration pushes', async () => {
        // Given - a push client opening the simulation, then pushing one action, then a null section
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            const opened = await lsp.open(URI, POST_SERVE);
            const configured = lsp.published(URI);
            await lsp.connection.sendNotification(DidChangeConfigurationNotification.type, {
                settings: { hoverfly: { registeredActions: ['knownAction', 7] } },
            });
            const pushed = await configured;
            const cleared = lsp.published(URI);
            await lsp.connection.sendNotification(DidChangeConfigurationNotification.type, {
                settings: { hoverfly: null },
            });
            return {
                cleared: await cleared,
                configurationRequests: lsp.configurationRequests,
                logged: lsp.logged,
                opened,
                pushed,
                registrations: lsp.registrations,
            };
        });

        // Then - nothing asked or registered, HF602 under the pushed action, silent again once cleared
        expect(result.value).toMatch({
            cleared: {
                uri: 'file:///postserve.hoverfly.json',
                version: 1,
                diagnostics: [],
            },
            configurationRequests: [],
            logged: [],
            opened: {
                uri: 'file:///postserve.hoverfly.json',
                version: 1,
                diagnostics: [],
            },
            pushed: {
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
            },
            registrations: [],
        });
    });

    test('offers the string actions a client pushes as post-serve completions', async () => {
        // Given - a push client pushing two actions, one of them no string, then completing the action
        const result = await integration.call(async () => {
            await using lsp = await initialized(PUSH);
            await lsp.open(URI, POST_SERVE);
            const configured = lsp.published(URI);
            await lsp.connection.sendNotification(DidChangeConfigurationNotification.type, {
                settings: { hoverfly: { registeredActions: [7, 'knownAction'] } },
            });
            await configured;
            const list = await lsp.connection.sendRequest(CompletionRequest.type, {
                position: { character: 40, line: 11 },
                textDocument: { uri: URI },
            });
            return (Array.isArray(list) ? list : (list?.items ?? [])).map((item) => item.label);
        });

        // Then - the string action alone
        expect(result.value).toMatch(['knownAction']);
    });
});
