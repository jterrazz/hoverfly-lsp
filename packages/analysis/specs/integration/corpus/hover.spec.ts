import { file } from '@jterrazz/test';
import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { hoverAt, parseMarkedDocument } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixtures = await glob('testdata/hover/**/*.hoverfly.json', { cwd: repoRoot });

async function hoversOf(fixture: string): Promise<unknown> {
    const marked = parseMarkedDocument(readFileSync(`${repoRoot}${fixture}`, 'utf8'));
    const uri = `file:///${fixture}`;
    const markers: Record<string, string> = {};
    for (const marker of marked.offsets.keys()) {
        markers[marker] = await hoverAt(marked, marker, { uri });
    }
    if (fixture.split('/').includes('broken')) {
        return { markers };
    }
    const document = TextDocument.create(uri, 'json', 1, marked.text);
    const diagnostics = await createHoverflyLanguageService().doValidation(document);
    return { diagnostics, markers };
}

describe('hover', () => {
    test('hover-corpus — holds the fixtures of testdata/hover', async () => {
        // Given - the corpus as the glob finds it
        const result = await integration.call(() => fixtures.toSorted());

        // Then - every fixture, so a broken glob runs nothing silently
        expect(result.value).toMatch(file('./__expected__/hover.json'));
    });

    test.each(fixtures)(
        'hover-corpus — %s answers the hovers its golden holds',
        async (fixture) => {
            // Given - a marked fixture, hovered at each of its markers through the language service
            const result = await integration.call(async () => await hoversOf(fixture));

            // Then - the Markdown at every marker, and no diagnostic for a fixture outside broken/
            expect(result.value).toMatch(
                file(`../../../../../${fixture.replace(/\.hoverfly\.json$/u, '.golden.json')}`),
            );
        },
    );
});
