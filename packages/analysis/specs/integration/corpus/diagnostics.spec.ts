import { file } from '@jterrazz/test';
import { glob } from 'glob';
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { describe, expect, test } from 'vitest';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';

import { createHoverflyLanguageService } from '../../../src/service.js';
import { integration } from '../integration.specification.js';
import { fromCorpusSpecs, repositoryRoot } from './__setup__/repository.js';

const repoRoot = repositoryRoot();
const invalid = await glob('testdata/invalid/**/*.hoverfly.json', { cwd: repoRoot });
const valid = await glob('testdata/valid/**/*.hoverfly.json', { cwd: repoRoot });

const SEVERITY_NAMES: ReadonlyMap<unknown, string> = new Map([
    [DiagnosticSeverity.Error, 'error'],
    [DiagnosticSeverity.Warning, 'warning'],
    [DiagnosticSeverity.Information, 'information'],
    [DiagnosticSeverity.Hint, 'hint'],
]);

// value: the fixture's own path is its URI, so a `*.hoverfly.json` name opens the D3 filename gate as in an editor.
async function diagnosticsOf(fixture: string): Promise<unknown[]> {
    const document = TextDocument.create(
        `file:///${fixture}`,
        'json',
        1,
        readFileSync(`${repoRoot}${fixture}`, 'utf8'),
    );
    const diagnostics = await createHoverflyLanguageService().doValidation(document);
    return diagnostics.map(({ code, message, range, severity }) => ({
        code,
        severity: SEVERITY_NAMES.get(severity) ?? 'unknown',
        range: {
            start: [range.start.line, range.start.character],
            end: [range.end.line, range.end.character],
        },
        message: typeof message === 'string' ? message : message.value,
    }));
}

describe('diagnostics', () => {
    test('diagnostics-corpus — holds the fixtures of testdata/invalid and testdata/valid', async () => {
        // Given - the corpus as the glob finds it
        const result = await integration.call(() => ({
            invalid: invalid.toSorted(),
            valid: valid.toSorted(),
        }));

        // Then - every fixture, so a broken glob runs nothing silently
        expect(result.value).toMatch(file('./__expected__/diagnostics.json'));
    });

    test.each(invalid)(
        'diagnostics-corpus — %s answers the diagnostics its golden holds',
        async (fixture) => {
            // Given - an invalid fixture, validated through the language service
            const result = await integration.call(async () => await diagnosticsOf(fixture));

            // Then - the diagnostics beside it, whole
            const golden = fromCorpusSpecs(
                fixture.replace(/\.hoverfly\.json$/u, '.diagnostics.json'),
            );
            expect(result.value).toMatch(file(golden));
        },
    );

    test('diagnostics-corpus — every code an invalid fixture is named for is in its golden', async () => {
        // Given - the leading hfNNN codes of each invalid fixture's name, against the codes its golden holds
        const result = await integration.call(() =>
            invalid.toSorted().flatMap((fixture) => {
                const named = (/^(?:hf\d{3}-)+/u.exec(basename(fixture))?.[0] ?? '')
                    .split('-')
                    .filter((code) => code !== '')
                    .map((code) => code.toUpperCase());
                const golden: unknown = JSON.parse(
                    readFileSync(
                        `${repoRoot}${fixture.replace(/\.hoverfly\.json$/u, '.diagnostics.json')}`,
                        'utf8',
                    ),
                );
                const answered = new Set(
                    (Array.isArray(golden) ? golden : []).map((diagnostic: unknown) =>
                        typeof diagnostic === 'object' &&
                        diagnostic !== null &&
                        'code' in diagnostic
                            ? diagnostic.code
                            : undefined,
                    ),
                );
                return named
                    .filter((code) => !answered.has(code))
                    .map((code) => `${fixture} ${code}`);
            }),
        );

        // Then - only the fixture proving HF602 stays silent without settings lacks the code it is named for
        expect(result.value).toMatch([
            'testdata/invalid/globalactions/hf602-postserveaction-silent-without-settings.hoverfly.json HF602',
        ]);
    });

    test.each(valid)('diagnostics-corpus — %s answers no diagnostic', async (fixture) => {
        // Given - a valid fixture, validated through the language service
        const result = await integration.call(async () => await diagnosticsOf(fixture));

        // Then - nothing
        expect(result.value).toMatch([]);
    });
});
