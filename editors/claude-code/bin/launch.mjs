#!/usr/bin/env node
// outside: Claude Code runs `node ${CLAUDE_PLUGIN_ROOT}/bin/launch.mjs --stdio` (../.lsp.json), and the
// server answers on this process's own stdin and stdout, so the bundle runs in-process. A
// marketplace install copies the plugin into Claude Code's cache, where the repo-relative bundle is
// absent: a published plugin reaches the server through HOVERFLY_LSP_PATH or an npm install.
import { existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const BUNDLE_RELATIVE = join('dist', 'cli.cjs');

function bundleAt(candidate) {
    if (candidate === undefined || candidate === '' || !existsSync(candidate)) {
        return undefined;
    }
    if (statSync(candidate).isFile()) {
        return candidate;
    }
    const inside = join(candidate, BUNDLE_RELATIVE);
    return existsSync(inside) ? inside : undefined;
}

function installedBundle() {
    for (const base of [process.cwd(), import.meta.dirname]) {
        try {
            const manifest = createRequire(join(base, 'noop.js')).resolve(
                '@jterrazz/hoverfly-lsp/package.json',
            );
            const bundle = bundleAt(join(dirname(manifest), BUNDLE_RELATIVE));
            if (bundle !== undefined) {
                return bundle;
            }
        } catch {
            // outside: `require.resolve` throws when no install is reachable from this base.
        }
    }
    return undefined;
}

const bundle =
    bundleAt(process.env.HOVERFLY_LSP_PATH) ??
    installedBundle() ??
    bundleAt(resolve(import.meta.dirname, '../../../packages/server', BUNDLE_RELATIVE));

if (bundle === undefined) {
    process.stderr.write(
        'hoverfly-lsp: could not locate the language server bundle.\n' +
            'Tried $HOVERFLY_LSP_PATH, a node_modules `@jterrazz/hoverfly-lsp` install, and the\n' +
            'repo-relative dev bundle (packages/server/dist/cli.cjs). Install `@jterrazz/hoverfly-lsp`\n' +
            '(npm i -g @jterrazz/hoverfly-lsp or as a project dependency), or set HOVERFLY_LSP_PATH to\n' +
            "the server's dist/cli.cjs.\n",
    );
    process.exitCode = 1;
} else {
    await import(pathToFileURL(bundle).href);
}
