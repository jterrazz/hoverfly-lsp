import { describe, expect, test } from 'vitest';

import { integration } from '../integration.specification.js';
import { initialized } from './__setup__/server.js';

const PUSH = { capabilities: { textDocument: {}, workspace: {} } };

describe('utf16-ranges', () => {
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
});
