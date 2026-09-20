/**
 * Golden diagnostic tests.
 *
 * For every `testdata/invalid/**\/*.hoverfly.json` fixture, run the full `doValidation`
 * pipeline and compare the produced diagnostics against a sibling `.diagnostics.golden`
 * file (JSON: an array of `{ code, severity, range, message }`). Every
 * `testdata/valid/**\/*.hoverfly.json` fixture must yield ZERO diagnostics.
 *
 * Plain file compare (not toMatchFileSnapshot) is used so diffs read as plain JSON and
 * regeneration is a single explicit step.
 *
 *   Regenerate goldens:  UPDATE_GOLDENS=1 npx vitest --run packages/analysis/specs/integration/semantic/golden.spec.ts
 *
 * Review the regenerated `.diagnostics.golden` files before committing — they are the frozen
 * contract for the HFxxx catalog.
 */

import { glob } from 'glob';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { integration } from '../integration.specification.js';

const repoRoot = fileURLToPath(new URL('../../../../../', import.meta.url));
const UPDATE = process.env.UPDATE_GOLDENS === '1';

const service = createHoverflyLanguageService();

/** A stable, human-readable projection of a Diagnostic for golden comparison. */
type GoldenDiagnostic = {
    code: string;
    severity: string;
    range: { start: [number, number]; end: [number, number] };
    message: string;
};

const SEVERITY_NAMES: Record<number, string> = {
    [DiagnosticSeverity.Error]: 'error',
    [DiagnosticSeverity.Warning]: 'warning',
    [DiagnosticSeverity.Information]: 'information',
    [DiagnosticSeverity.Hint]: 'hint',
};

function fixtureUri(relPath: string): string {
    // Preserve the hoverfly filename so the D3 filename branch (HF101) behaves correctly.
    return `file:///${relPath}`;
}

async function diagnose(relPath: string): Promise<GoldenDiagnostic[]> {
    const text = readFileSync(join(repoRoot, relPath), 'utf8');
    const document = TextDocument.create(fixtureUri(relPath), 'json', 1, text);
    const diagnostics = await service.doValidation(document);
    return diagnostics.map((d) => ({
        code: String(d.code),
        severity:
            typeof d.severity === 'number' ? (SEVERITY_NAMES[d.severity] ?? 'unknown') : 'unknown',
        range: {
            start: [d.range.start.line, d.range.start.character],
            end: [d.range.end.line, d.range.end.character],
        },
        message: d.message,
    }));
}

const invalidFixtures = await glob('testdata/invalid/**/*.hoverfly.json', { cwd: repoRoot });
const validFixtures = await glob('testdata/valid/**/*.hoverfly.json', { cwd: repoRoot });

describe('golden: testdata/invalid', () => {
    test('finds invalid fixtures', () => {
        // Given - the invalid corpus
        // Then - it is not empty (guards against a broken glob path)
        expect(invalidFixtures.length).toBeGreaterThan(0);
    });

    test.each(invalidFixtures)('%s matches its .diagnostics.golden', async (relPath) => {
        // Given - an invalid fixture put through the full pipeline
        const result = await integration.call(async () => await diagnose(relPath));
        const actual = result.value.value;
        const goldenPath = join(repoRoot, `${relPath}.diagnostics.golden`);

        if (UPDATE) {
            writeFileSync(goldenPath, `${JSON.stringify(actual, null, 2)}\n`);
            return;
        }

        // Then - a golden exists and the diagnostics match it exactly
        expect(
            existsSync(goldenPath),
            `missing golden: run UPDATE_GOLDENS=1 (${goldenPath})`,
        ).toBeTruthy();
        const expected = JSON.parse(readFileSync(goldenPath, 'utf8')) as GoldenDiagnostic[];
        expect(actual).toStrictEqual(expected);
    });
});

describe('golden: testdata/valid produces zero diagnostics', () => {
    test('finds valid fixtures', () => {
        // Given - the valid corpus (recursive glob)
        // Then - it is not empty
        expect(validFixtures.length).toBeGreaterThan(0);
    });

    test.each(validFixtures)('%s yields zero diagnostics end-to-end', async (relPath) => {
        // Given - a committed valid fixture put through the full pipeline
        const result = await integration.call(async () => await diagnose(relPath));
        // Then - the full pipeline reports nothing
        expect(result.value.value).toStrictEqual([]);
    });
});
