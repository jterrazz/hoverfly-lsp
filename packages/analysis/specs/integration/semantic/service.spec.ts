import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { integration } from '../integration.specification.js';

const BODY = '"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}';

function document(text: string): TextDocument {
    return TextDocument.create('file:///a.hoverfly.json', 'json', 1, text);
}

const TEMPLATED = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{"}}]},"meta":{"schemaVersion":"v5.3"}}`;

describe('service', () => {
    test('reports a $schema it cannot load rather than fetching it', async () => {
        // Given - a simulation naming a schema of its own
        const result = await integration.call(
            async () =>
                await createHoverflyLanguageService().doValidation(
                    document(`{"$schema":"https://example.com/other.json",${BODY}}`),
                ),
        );

        // Then - one warning on the $schema value, the bundled schema being the only one it reads
        expect(result.value).toMatch([
            {
                code: 'HF102',
                codeDescription: { href: 'https://hoverfly-lsp.dev/diagnostics/hf102' },
                message:
                    "Unable to load schema from 'https://example.com/other.json': Unknown schema URI: https://example.com/other.json.",
                range: { end: { character: 43, line: 0 }, start: { character: 11, line: 0 } },
                severity: 2,
                source: 'hoverfly',
            },
        ]);
    });

    test('refuses a comment, JSON allowing none', async () => {
        // Given - a simulation opening with a line comment
        const result = await integration.call(
            async () =>
                await createHoverflyLanguageService().doValidation(document(`{// note\n${BODY}}`)),
        );

        // Then - an error on the comment
        expect(result.value).toMatch([
            {
                code: 'HF102',
                codeDescription: { href: 'https://hoverfly-lsp.dev/diagnostics/hf102' },
                message: 'Comments are not permitted in JSON.',
                range: { end: { character: 8, line: 0 }, start: { character: 1, line: 0 } },
                severity: 1,
                source: 'hoverfly',
            },
        ]);
    });

    test('parses a document behind a byte-order mark', async () => {
        // Given - a simulation saved with a leading BOM
        const result = await integration.call(
            async () => createHoverflyLanguageService().parse(document(`﻿{${BODY}}`)).root?.type,
        );

        // Then - an object, the mark read as whitespace
        expect(result.value).toMatch('object');
    });

    test('completes a template as a finished list', async () => {
        // Given - a service built with no contribution and no setting, a cursor after `{{`
        const result = await integration.call(async () => {
            const list = await createHoverflyLanguageService().doComplete(
                document(TEMPLATED),
                document(TEMPLATED).positionAt(TEMPLATED.indexOf('{{') + 2),
            );
            return { incomplete: list?.isIncomplete, items: list?.items.length };
        });

        // Then - the list is complete, and holds the helpers
        expect(result.value).toMatch({ incomplete: false, items: 64 });
    });

    test('answers a hover on a document another service parsed', async () => {
        // Given - a matcher name, the AST handed in from a parse by a different service
        const text = `{"data":{"pairs":[{"request":{"path":[{"matcher":"glob","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => {
            const parsed = createHoverflyLanguageService().parse(document(text));
            const hover = await createHoverflyLanguageService().doHover(
                document(text),
                document(text).positionAt(text.indexOf('glob')),
                parsed,
            );
            return JSON.stringify(hover?.contents).includes('### `glob` matcher');
        });

        // Then - the matcher's docs, the service having read the document it was handed
        expect(result.value).toMatch(true);
    });
});
