import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function text(path: string): string {
    return readFileSync(new URL(`../../../editors/${path}`, import.meta.url), 'utf8');
}

function json(path: string): unknown {
    return JSON.parse(text(path));
}

function at(value: unknown, ...keys: (number | string)[]): unknown {
    let current = value;
    for (const key of keys) {
        if (typeof current !== 'object' || current === null) {
            return;
        }
        const descriptor = Object.getOwnPropertyDescriptor(current, String(key));
        current = descriptor?.value;
    }
    return current;
}

function list(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function captures(source: string, pattern: RegExp): string[] {
    return [...source.matchAll(pattern)].map((match) => match.groups?.value ?? '');
}

function names(patterns: unknown[]): string[] {
    return patterns.map((pattern) => String(pattern).replace(/^\*?\./u, '')).toSorted();
}

const vscode = json('vscode/package.json');
const intellij = json('intellij/template.json');
const zedLanguage = text('zed/languages/hoverfly-simulation/config.toml');
const zedExtension = text('zed/extension.toml');
const zedSource = text('zed/src/lib.rs');

describe('launchers', () => {
    test('every editor claims the canonical simulation file names', () => {
        // Given - the file names each editor maps to the Hoverfly language, suffixes alone
        const claimed = {
            intellij: names(list(at(intellij, 'fileTypeMappings', 0, 'fileType', 'patterns'))),
            vscode: names([
                ...list(at(vscode, 'contributes', 'languages', 0, 'filenamePatterns')),
                ...list(at(vscode, 'contributes', 'languages', 0, 'extensions')),
            ]),
            zed: names(
                captures(zedLanguage, /^path_suffixes = \[(?<value>.*)\]$/gmu).flatMap((items) =>
                    captures(items, /"(?<value>[^"]*)"/gu),
                ),
            ),
        };

        // Then - the same three in all of them
        const canonical = ['hfy', 'hoverfly-simulation.json', 'hoverfly.json'];
        expect(claimed).toStrictEqual({ intellij: canonical, vscode: canonical, zed: canonical });
    });

    test('every launcher starts the hoverfly-lsp server over --stdio', () => {
        // Given - the command line each launcher writes
        const launched = {
            claudeCode: at(json('claude-code/.lsp.json'), 'hoverfly', 'args'),
            intellij: at(intellij, 'programArgs'),
            zed: {
                args: captures(zedSource, /args: vec!\[(?<value>[^\]]*)\]/gu).map((items) =>
                    items.split(',').map((item) => item.trim()),
                ),
                binary: captures(zedSource, /^const BINARY_NAME: &str = "(?<value>[^"]*)";$/gmu),
            },
        };

        // Then - the hoverfly-lsp bin (or the plugin's launcher of it) with --stdio, everywhere
        expect(launched).toStrictEqual({
            claudeCode: [`\${CLAUDE_PLUGIN_ROOT}/bin/launch.mjs`, '--stdio'],
            intellij: { default: 'hoverfly-lsp --stdio', windows: 'cmd /C hoverfly-lsp --stdio' },
            zed: {
                args: [
                    ['script', '"--stdio".into()'],
                    ['"--stdio".into()'],
                    ['script', '"--stdio".into()'],
                ],
                binary: ['hoverfly-lsp'],
            },
        });
    });

    test('every editor opens a simulation under the hoverfly-simulation languageId', () => {
        // Given - the languageId each editor sends on textDocument/didOpen
        const languageIds = {
            intellij: list(at(intellij, 'fileTypeMappings')).map((mapping) =>
                at(mapping, 'languageId'),
            ),
            vscode: list(at(vscode, 'contributes', 'languages')).map((language) =>
                at(language, 'id'),
            ),
            zed: captures(zedExtension, /^"Hoverfly" = "(?<value>[^"]*)"$/gmu),
        };

        // Then - one id, shared
        expect(languageIds).toStrictEqual({
            intellij: ['hoverfly-simulation'],
            vscode: ['hoverfly-simulation'],
            zed: ['hoverfly-simulation'],
        });
    });

    test('every editor hands the server registeredActions under one name', () => {
        // Given - the settings each editor forwards to the server
        const settings = {
            intellij: json('intellij/initializationOptions.json'),
            vscode: {
                registeredActions: at(
                    vscode,
                    'contributes',
                    'configuration',
                    'properties',
                    'hoverfly.registeredActions',
                    'default',
                ),
            },
        };

        // Then - the same option, empty by default
        expect(settings).toStrictEqual({
            intellij: { registeredActions: [] },
            vscode: { registeredActions: [] },
        });
    });
});
