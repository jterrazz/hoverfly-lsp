import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterAll, describe, expect, test } from 'vitest';

const launcher = resolve(import.meta.dirname, '../../../editors/claude-code/bin/launch.mjs');
const server = resolve(import.meta.dirname, '../../../packages/server');
const manifest: unknown = JSON.parse(readFileSync(join(server, 'package.json'), 'utf8'));
const version =
    typeof manifest === 'object' && manifest !== null && 'version' in manifest
        ? String(manifest.version)
        : '';

const scratch: string[] = [];

function scratchDirectory(prefix: string): string {
    const directory = mkdtempSync(join(tmpdir(), prefix));
    scratch.push(directory);
    return directory;
}

afterAll(() => {
    for (const directory of scratch) {
        rmSync(directory, { force: true, recursive: true });
    }
});

function launch(
    script: string,
    options: { cwd?: string; serverPath?: string } = {},
): { exitCode: null | number; stderr: string; stdout: string } {
    const { HOVERFLY_LSP_PATH: _ignored, ...environment } = process.env;
    const run = spawnSync(process.execPath, [script, '--version'], {
        cwd: options.cwd ?? scratchDirectory('hoverfly-launcher-cwd-'),
        encoding: 'utf8',
        env:
            options.serverPath === undefined
                ? environment
                : { ...environment, HOVERFLY_LSP_PATH: options.serverPath },
    });
    return { exitCode: run.status, stderr: run.stderr, stdout: run.stdout };
}

// value: a copy laid out as the plugin sits in a checkout, outside any node_modules, so only the
// repo-relative step can reach a server, and only when the tree holds one.
function launcherCopy(withServer: boolean): string {
    const root = scratchDirectory('hoverfly-launcher-');
    const bin = join(root, 'editors/claude-code/bin');
    mkdirSync(bin, { recursive: true });
    copyFileSync(launcher, join(bin, 'launch.mjs'));
    if (withServer) {
        mkdirSync(join(root, 'packages'));
        symlinkSync(server, join(root, 'packages/server'), 'dir');
    }
    return join(bin, 'launch.mjs');
}

const answered = { exitCode: 0, stderr: '', stdout: `${version}\n` };

describe('claude-code-launcher', () => {
    test('runs the bundle HOVERFLY_LSP_PATH names', () => {
        // Given - the variable naming the built bundle itself
        const result = launch(launcher, { serverPath: join(server, 'dist/cli.cjs') });

        // Then - the server answers its manifest's version
        expect(result).toStrictEqual(answered);
    });

    test('finds dist/cli.cjs inside the directory HOVERFLY_LSP_PATH names', () => {
        // Given - the variable naming the server package's directory
        const result = launch(launcher, { serverPath: server });

        // Then - the bundle inside it answers
        expect(result).toStrictEqual(answered);
    });

    test('falls back to the repo-relative dev bundle with no variable set', () => {
        // Given - a launcher with no variable, no install reachable, and a checkout's server beside it
        const result = launch(launcherCopy(true));

        // Then - the dev bundle answers
        expect(result).toStrictEqual(answered);
    });

    test('refuses with exit 1 when no bundle is reachable', () => {
        // Given - a launcher with no variable, no install and no checkout around it
        const result = launch(launcherCopy(false));

        // Then - it names every place it looked, and fails
        expect(result).toStrictEqual({
            exitCode: 1,
            stderr:
                'hoverfly-lsp: could not locate the language server bundle.\n' +
                'Tried $HOVERFLY_LSP_PATH, a node_modules `@jterrazz/hoverfly-lsp` install, and the\n' +
                'repo-relative dev bundle (packages/server/dist/cli.cjs). Install `@jterrazz/hoverfly-lsp`\n' +
                '(npm i -g @jterrazz/hoverfly-lsp or as a project dependency), or set HOVERFLY_LSP_PATH to\n' +
                "the server's dist/cli.cjs.\n",
            stdout: '',
        });
    });
});
