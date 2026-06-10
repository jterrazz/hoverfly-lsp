/*
 * Build the VS Code extension.
 *
 *   1. Bundle `src/extension.ts` -> `dist/extension.cjs` (CommonJS; VS Code loads extensions as
 *      CJS). `vscode` is marked external — it is provided by the host at runtime, never bundled.
 *   2. Copy the published `hoverfly-lsp` server (its `bin/` launcher + `dist/cli.cjs` bundle) into
 *      `server/` inside the extension, so the `.vsix` is fully self-contained (zero-install).
 *
 * Run with `--watch` for incremental rebuilds during development (the copy step still runs once).
 */
import { build, context } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const serverPkg = join(here, "..", "..", "packages", "server");
const serverDest = join(here, "server");

/** Copy the server's runtime files (bin launcher + the CJS bundle it imports) into the extension. */
function copyBundledServer() {
  rmSync(serverDest, { recursive: true, force: true });
  mkdirSync(join(serverDest, "bin"), { recursive: true });
  mkdirSync(join(serverDest, "dist"), { recursive: true });
  // The launcher bin/hoverfly-lsp.js does `import "../dist/cli.cjs"` — copy both, same layout.
  cpSync(join(serverPkg, "bin", "hoverfly-lsp.js"), join(serverDest, "bin", "hoverfly-lsp.js"));
  cpSync(join(serverPkg, "dist", "cli.cjs"), join(serverDest, "dist", "cli.cjs"));
}

const buildOptions = {
  entryPoints: [join(here, "src", "extension.ts")],
  outfile: join(here, "dist", "extension.cjs"),
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  minify: false,
  // The `vscode` module is injected by the extension host; everything else is bundled.
  external: ["vscode"],
  logLevel: "info",
};

const watch = process.argv.includes("--watch");

copyBundledServer();

if (watch) {
  const ctx = await context(buildOptions);
  await ctx.watch();
  // eslint-disable-next-line no-console
  console.log("[hoverfly vscode] watching for changes…");
} else {
  await build(buildOptions);
}
