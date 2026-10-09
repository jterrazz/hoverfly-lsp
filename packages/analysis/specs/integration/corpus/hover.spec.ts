import { file } from '@jterrazz/test';
import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { hoverAt, parseMarkedDocument } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';
import { fromCorpusSpecs, repositoryRoot } from './__setup__/repository.js';

const repoRoot = repositoryRoot();
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
        expect(result.value).toMatch([
            'testdata/hover/faker/broken/number-parameterized-panic.hoverfly.json',
            'testdata/hover/faker/name-zero-arg.hoverfly.json',
            'testdata/hover/fields/schemaVersion.hoverfly.json',
            'testdata/hover/fields/templated.hoverfly.json',
            'testdata/hover/helpers/csvAsMap.hoverfly.json',
            'testdata/hover/helpers/each-block.hoverfly.json',
            'testdata/hover/helpers/faker.hoverfly.json',
            'testdata/hover/helpers/isGreaterThan.hoverfly.json',
            'testdata/hover/helpers/now.hoverfly.json',
            'testdata/hover/helpers/setStatusCode.hoverfly.json',
            'testdata/hover/helpers/sum.hoverfly.json',
            'testdata/hover/matchers/array.hoverfly.json',
            'testdata/hover/matchers/exact.hoverfly.json',
            'testdata/hover/matchers/form.hoverfly.json',
            'testdata/hover/matchers/glob.hoverfly.json',
            'testdata/hover/matchers/json.hoverfly.json',
            'testdata/hover/matchers/jsonpartial.hoverfly.json',
            'testdata/hover/matchers/jsonpath.hoverfly.json',
            'testdata/hover/matchers/jwt.hoverfly.json',
            'testdata/hover/matchers/jwtjsonpath.hoverfly.json',
            'testdata/hover/matchers/negate.hoverfly.json',
            'testdata/hover/matchers/regex.hoverfly.json',
            'testdata/hover/matchers/xml.hoverfly.json',
            'testdata/hover/matchers/xmltemplated.hoverfly.json',
            'testdata/hover/matchers/xpath.hoverfly.json',
            'testdata/hover/negative/body-string.hoverfly.json',
            'testdata/hover/negative/status-number.hoverfly.json',
            'testdata/hover/request-members/body-jsonpath.hoverfly.json',
            'testdata/hover/request-members/method-field.hoverfly.json',
        ]);
    });

    test.each(fixtures)(
        'hover-corpus — %s answers the hovers its golden holds',
        async (fixture) => {
            // Given - a marked fixture, hovered at each of its markers through the language service
            const result = await integration.call(async () => await hoversOf(fixture));

            // Then - the Markdown at every marker, and no diagnostic for a fixture outside broken/
            const golden = fromCorpusSpecs(fixture.replace(/\.hoverfly\.json$/u, '.golden.json'));
            expect(result.value).toMatch(file(golden));
        },
    );
});
