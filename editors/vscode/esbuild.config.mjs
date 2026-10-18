// outside: VS Code loads an extension as CommonJS and injects `vscode`; the published server's bin
// and bundle are copied into server/, so the .vsix runs with nothing installed.
import { build, context } from 'esbuild';
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

const here = import.meta.dirname;
const serverPkg = dirname(
    createRequire(import.meta.url).resolve('@jterrazz/hoverfly-lsp/package.json'),
);
const serverDest = join(here, 'server');

function copyBundledServer() {
    rmSync(serverDest, { recursive: true, force: true });
    mkdirSync(join(serverDest, 'bin'), { recursive: true });
    mkdirSync(join(serverDest, 'dist'), { recursive: true });
    cpSync(join(serverPkg, 'bin', 'hoverfly-lsp.js'), join(serverDest, 'bin', 'hoverfly-lsp.js'));
    cpSync(join(serverPkg, 'dist', 'cli.cjs'), join(serverDest, 'dist', 'cli.cjs'));
}

const buildOptions = {
    entryPoints: [join(here, 'src', 'index.ts')],
    outfile: join(here, 'dist', 'extension.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    minify: false,
    external: ['vscode'],
    logLevel: 'info',
};

const watch = process.argv.includes('--watch');

copyBundledServer();

if (watch) {
    const ctx = await context(buildOptions);
    await ctx.watch();
    // oxlint-disable-next-line no-console -- the watch loop's only feedback is this line.
    console.log('[hoverfly vscode] watching for changes');
} else {
    await build(buildOptions);
}
