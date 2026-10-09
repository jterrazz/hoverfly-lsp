import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { integration } from '../integration.specification.js';

const BOM = '﻿';

async function validated(uri: string, text: string): Promise<unknown> {
    return await createHoverflyLanguageService().doValidation(
        TextDocument.create(uri, 'json', 1, text),
    );
}

describe('document-gate', () => {
    test('stays silent on JSON that is no simulation in a file not named for Hoverfly', async () => {
        // Given - arbitrary JSON in config.json
        const result = await integration.call(
            async () => await validated('file:///config.json', `{"hello":"world"}`),
        );

        // Then - nothing, the D3 gate closed
        expect(result.value).toMatch([]);
    });

    test('raises HF101 on a .hfy file that is no simulation', async () => {
        // Given - arbitrary JSON in a file the .hfy extension names for Hoverfly
        const result = await integration.call(
            async () => await validated('file:///notes.hfy', `{"hello":"world"}`),
        );

        // Then - the one "does not look like a simulation" diagnostic
        expect(result.value).toMatch([
            {
                code: 'HF101',
                source: 'hoverfly',
                severity: 2,
                range: {
                    start: {
                        line: 0,
                        character: 0,
                    },
                    end: {
                        line: 0,
                        character: 17,
                    },
                },
                message:
                    'This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")',
                codeDescription: {
                    href: 'https://hoverfly-lsp.dev/diagnostics/hf101',
                },
            },
        ]);
    });

    test('validates a .hfy simulation against the bundled schema', async () => {
        // Given - a broken simulation in a .hfy file
        const result = await integration.call(
            async () =>
                await validated(
                    'file:///api.hfy',
                    `{"data":{"pairs":{}},"meta":{"schemaVersion":"v5.3"}}`,
                ),
        );

        // Then - the schema's diagnostic, tagged HF102
        expect(result.value).toMatch([
            {
                code: 'HF102',
                source: 'hoverfly',
                severity: 2,
                range: {
                    start: {
                        line: 0,
                        character: 17,
                    },
                    end: {
                        line: 0,
                        character: 19,
                    },
                },
                message: 'Incorrect type. Expected "array".',
                codeDescription: {
                    href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                },
            },
        ]);
    });

    test('reports every schema violation of a simulation as HF102', async () => {
        // Given - pairs as an object, and a property the root does not allow
        const result = await integration.call(
            async () =>
                await validated(
                    'file:///sim.hoverfly.json',
                    `{"data":{"pairs":{}},"meta":{"schemaVersion":"v5.3"},"extra":1}`,
                ),
        );

        // Then - both, re-tagged HF102 with the hoverfly source
        expect(result.value).toMatch([
            {
                code: 'HF102',
                source: 'hoverfly',
                severity: 2,
                range: {
                    start: {
                        line: 0,
                        character: 17,
                    },
                    end: {
                        line: 0,
                        character: 19,
                    },
                },
                message: 'Incorrect type. Expected "array".',
                codeDescription: {
                    href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                },
            },
            {
                code: 'HF102',
                source: 'hoverfly',
                severity: 2,
                range: {
                    start: {
                        line: 0,
                        character: 53,
                    },
                    end: {
                        line: 0,
                        character: 60,
                    },
                },
                message: 'Property extra is not allowed.',
                codeDescription: {
                    href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                },
            },
        ]);
    });

    test('reads a valid simulation saved with a leading BOM as a simulation', async () => {
        // Given - a valid simulation behind a UTF-8 BOM, as many editors save it
        const result = await integration.call(
            async () =>
                await validated(
                    'file:///sim.hoverfly.json',
                    `${BOM}{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}}`,
                ),
        );

        // Then - nothing, the BOM transparent to the fingerprint
        expect(result.value).toMatch([]);
    });

    test('places a diagnostic behind a leading BOM where it stands without one', async () => {
        // Given - an unknown matcher on line 1, behind a BOM
        const body = `{"data":{"pairs":[{"request":{"path":[\n{"matcher":"frobnicate","value":"v"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(
            async () => await validated('file:///sim.hoverfly.json', `${BOM}${body}`),
        );

        // Then - HF201 on line 1, at the characters it holds without the BOM
        expect(result.value).toMatch([
            {
                code: 'HF201',
                source: 'hoverfly',
                severity: 1,
                range: {
                    start: {
                        line: 1,
                        character: 11,
                    },
                    end: {
                        line: 1,
                        character: 23,
                    },
                },
                message:
                    'Unknown matcher "frobnicate": Hoverfly panics at match time on unknown matchers',
                codeDescription: {
                    href: 'https://hoverfly-lsp.dev/diagnostics/hf201',
                },
            },
        ]);
    });
});
