/**
 * Single-file bundle for the `hoverfly-lsp` bin.
 *
 * Format choice: CommonJS. `vscode-languageserver` and its protocol/jsonrpc deps are CJS, and
 * bundling to CJS folds our ESM source into one self-contained CJS module with no runtime
 * ESM<->CJS interop shims. Output is `dist/cli.cjs` (explicit `.cjs` so Node treats it as
 * CommonJS even though package.json sets "type": "module"); the ESM bin imports it for its side
 * effect.
 *
 * Everything is inlined (no `external`), so the published bin needs no node_modules. The version
 * is injected via `define` so the bundle never reads package.json at runtime.
 */
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const pkg = JSON.parse(readFileSync(new URL("package.json", import.meta.url), "utf8"));

await build({
  entryPoints: [`${here}src/main.ts`],
  outfile: `${here}dist/cli.cjs`,
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node20",
  sourcemap: true,
  minify: false,
  // Prefer the ESM build of deps that ship both. In particular vscode-json-languageservice's
  // `main` is a UMD bundle whose internal relative requires esbuild leaves unresolved (the UMD
  // `require` parameter shadows the real one); its `module` build (lib/esm) bundles cleanly.
  mainFields: ["module", "main"],
  define: {
    HOVERFLY_LSP_VERSION: JSON.stringify(pkg.version),
  },
  logLevel: "info",
});
