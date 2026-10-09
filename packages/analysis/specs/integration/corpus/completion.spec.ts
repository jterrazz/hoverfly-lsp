import { file } from '@jterrazz/test';
import { glob } from 'glob';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import type { HoverflyServiceSettings } from '../../../src/semantic/rule.js';
import { createHoverflyLanguageService } from '../../../src/service.js';
import { entriesAt, parseMarkedDocument } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';
import { fromCorpusSpecs, repositoryRoot } from './__setup__/repository.js';

const repoRoot = repositoryRoot();
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
        expect(result.value).toMatch([
            'testdata/completion/http-values/method-exact.hoverfly.json',
            'testdata/completion/http-values/method-glob-none.hoverfly.json',
            'testdata/completion/http-values/scheme-custom.hoverfly.json',
            'testdata/completion/http-values/scheme-exact.hoverfly.json',
            'testdata/completion/matcher-name/broken/midword-ex.hoverfly.json',
            'testdata/completion/matcher-name/full-file.hoverfly.json',
            'testdata/completion/matcher-name/in-doMatch.hoverfly.json',
            'testdata/completion/matcher-name/on-body.hoverfly.json',
            'testdata/completion/matcher-name/on-destination.hoverfly.json',
            'testdata/completion/matcher-name/on-headers.hoverfly.json',
            'testdata/completion/matcher-name/on-method.hoverfly.json',
            'testdata/completion/matcher-name/on-path.hoverfly.json',
            'testdata/completion/matcher-name/on-query.hoverfly.json',
            'testdata/completion/matcher-name/on-scheme.hoverfly.json',
            'testdata/completion/method-value/custom-verb.hoverfly.json',
            'testdata/completion/method-value/exact.hoverfly.json',
            'testdata/completion/negative/broken/non-simulation.hoverfly.json',
            'testdata/completion/negative/requires-state-value.hoverfly.json',
            'testdata/completion/negative/response-body-no-matcher.hoverfly.json',
            'testdata/completion/post-serve-action/with-settings.hoverfly.json',
            'testdata/completion/post-serve-action/without-settings.hoverfly.json',
            'testdata/completion/schema-version/value.hoverfly.json',
            'testdata/completion/state-keys/login-fetch-flow.hoverfly.json',
            'testdata/completion/state-keys/removes-state-gap.hoverfly.json',
            'testdata/completion/state-keys/requires-from-transitions.hoverfly.json',
            'testdata/completion/state-keys/transitions-from-requires.hoverfly.json',
            'testdata/completion/template/block-close/broken/each.hoverfly.json',
            'testdata/completion/template/block-close/broken/if.hoverfly.json',
            'testdata/completion/template/block-close/broken/nested.hoverfly.json',
            'testdata/completion/template/block-close/broken/with.hoverfly.json',
            'testdata/completion/template/faker-arg/bareword.hoverfly.json',
            'testdata/completion/template/faker-arg/mid-quote.hoverfly.json',
            'testdata/completion/template/faker-arg/quoted.hoverfly.json',
            'testdata/completion/template/helper-start/broken/block-open.hoverfly.json',
            'testdata/completion/template/helper-start/broken/empty-mustache.hoverfly.json',
            'testdata/completion/template/helper-start/broken/mid-word-faker.hoverfly.json',
            'testdata/completion/template/helper-start/each-scope-head.hoverfly.json',
            'testdata/completion/template/helper-start/helper-arg-value.hoverfly.json',
            'testdata/completion/template/helper-start/mustache-open.hoverfly.json',
            'testdata/completion/template/helper-start/subexpression.hoverfly.json',
            'testdata/completion/template/helper-start/triple-stache.hoverfly.json',
            'testdata/completion/template/multi-marker.hoverfly.json',
            'testdata/completion/template/negative/broken/untemplated-mustache.hoverfly.json',
            'testdata/completion/template/negative/plain-body.hoverfly.json',
            'testdata/completion/template/now-args/format-empty-label.hoverfly.json',
            'testdata/completion/template/now-args/format-slot.hoverfly.json',
            'testdata/completion/template/now-args/offset-slot.hoverfly.json',
            'testdata/completion/template/path-continuation/arg-path.hoverfly.json',
            'testdata/completion/template/path-continuation/each-data-vars.hoverfly.json',
            'testdata/completion/template/path-continuation/header-value.hoverfly.json',
            'testdata/completion/template/path-continuation/internal-roots.hoverfly.json',
            'testdata/completion/template/path-continuation/literals.hoverfly.json',
            'testdata/completion/template/path-continuation/request-indexed.hoverfly.json',
            'testdata/completion/template/path-continuation/request.hoverfly.json',
            'testdata/completion/template/path-continuation/state.hoverfly.json',
            'testdata/completion/template/path-continuation/this-field.hoverfly.json',
            'testdata/completion/template/path-continuation/vars.hoverfly.json',
        ]);
    });

    test.each(fixtures)(
        'completion-corpus — %s answers the completions its golden holds',
        async (fixture) => {
            // Given - a marked fixture, completed at each of its markers through the language service
            const result = await integration.call(async () => await completionsOf(fixture));

            // Then - the list at every marker, and no diagnostic for a fixture outside broken/
            const golden = fromCorpusSpecs(fixture.replace(/\.hoverfly\.json$/u, '.golden.json'));
            expect(result.value).toMatch(file(golden));
        },
    );
});
