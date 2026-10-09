import { file } from '@jterrazz/test';
import { glob } from 'glob';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { HoverflyServiceSettings } from '../../../src/semantic/rule.js';
import { createHoverflyLanguageService } from '../../../src/service.js';
import { entriesAt, parseMarkedDocument } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const fixtures = await glob('testdata/completion/**/*.hoverfly.json', { cwd: repoRoot });

function settingsIn(text: string): HoverflyServiceSettings {
    const parsed: unknown = JSON.parse(text);
    const actions: unknown =
        typeof parsed === 'object' && parsed !== null && 'registeredActions' in parsed
            ? parsed.registeredActions
            : undefined;
    return Array.isArray(actions)
        ? {
              registeredActions: actions.filter(
                  (action): action is string => typeof action === 'string',
              ),
          }
        : {};
}

async function completionsOf(fixture: string): Promise<unknown> {
    const marked = parseMarkedDocument(readFileSync(`${repoRoot}${fixture}`, 'utf8'));
    const settingsPath = `${repoRoot}${fixture.replace(/\.hoverfly\.json$/u, '.settings.json')}`;
    const settings = existsSync(settingsPath) ? settingsIn(readFileSync(settingsPath, 'utf8')) : {};
    const uri = `file:///${fixture}`;
    const markers: Record<string, unknown> = {};
    for (const marker of marked.offsets.keys()) {
        markers[marker] = await entriesAt(marked, marker, { settings, uri });
    }
    if (fixture.split('/').includes('broken')) {
        return { markers };
    }
    const document = TextDocument.create(uri, 'json', 1, marked.text);
    const diagnostics = await createHoverflyLanguageService([], settings).doValidation(document);
    return { diagnostics, markers };
}

describe('completion', () => {
    test('completion-corpus — holds the fixtures of testdata/completion', async () => {
        // Given - the corpus as the glob finds it
        const result = await integration.call(() => fixtures.toSorted());

        // Then - every fixture, so a broken glob runs nothing silently
        expect(result.value).toMatch(file('./__expected__/completion.json'));
    });

    test.each(fixtures)(
        'completion-corpus — %s answers the completions its golden holds',
        async (fixture) => {
            // Given - a marked fixture, completed at each of its markers through the language service
            const result = await integration.call(async () => await completionsOf(fixture));

            // Then - the list at every marker, and no diagnostic for a fixture outside broken/
            expect(result.value).toMatch(
                file(`../../../../../${fixture.replace(/\.hoverfly\.json$/u, '.golden.json')}`),
            );
        },
    );
});
