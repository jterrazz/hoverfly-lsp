import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'vitest';

import {
    completionsAt,
    expectHoverIncludes,
    expectLabels,
    hoverAt,
    parseMarkedDocument,
} from '../fourslash/harness.js';
import { integration } from '../integration.specification.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));

function fixture(...parts: string[]): string {
    return readFileSync(join(repoRoot, 'testdata', ...parts), 'utf8');
}

describe('full-file marker fixtures (testdata/completion, testdata/hover)', () => {
    test('offers body/path/version completions from a full marked simulation file', async () => {
        // Given - a real multi-marker fixture file (migrated into the on-disk corpus tree)
        const doc = parseMarkedDocument(
            fixture('completion', 'matcher-name', 'full-file.hoverfly.json'),
        );
        // Then - `form` appears on body but not on path; the version marker offers v5.3
        const onBody = await integration.call(async () => await completionsAt(doc, 'body'));
        expectLabels(onBody.value.value, { contains: ['form', 'exact'] }, 'body');
        const onPath = await integration.call(async () => await completionsAt(doc, 'path'));
        expectLabels(onPath.value.value, { contains: ['exact'], notContains: ['form'] }, 'path');
        const onVersion = await integration.call(async () => await completionsAt(doc, 'version'));
        expectLabels(onVersion.value.value, { contains: ['v5.3'] }, 'version');
    });

    test('hovers a matcher name from a full marked simulation file', async () => {
        // Given - a fixture with a cursor on the "regex" matcher name (migrated into the corpus tree)
        const doc = parseMarkedDocument(fixture('hover', 'matchers', 'regex.hoverfly.json'));
        // Then - registry-sourced regex docs are rendered
        const hovered = await integration.call(async () => await hoverAt(doc, ''));
        expectHoverIncludes(hovered.value.text, ['Regular-expression match', 'Value type:']);
    });
});
