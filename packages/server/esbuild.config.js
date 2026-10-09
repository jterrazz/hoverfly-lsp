// outside: one self-contained CommonJS file — vscode-languageserver and its dependencies are
// CommonJS, every editor launcher resolves dist/cli.cjs by path with no node_modules, and the
// version is defined at build so the bundle reads no package.json.
import { build } from 'esbuild';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const here = import.meta.dirname;
const pkg = JSON.parse(readFileSync(new URL('package.json', import.meta.url), 'utf8'));

await build({
    entryPoints: [join(here, 'src', 'main.ts')],
    outfile: join(here, 'dist', 'cli.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    sourcemap: true,
    minify: false,
    // outside: vscode-json-languageservice's `main` is a UMD bundle whose relative requires esbuild
    // leaves unresolved; its `module` build bundles cleanly.
    mainFields: ['module', 'main'],
    define: {
        HOVERFLY_LSP_VERSION: JSON.stringify(pkg.version),
    },
    logLevel: 'info',
});
