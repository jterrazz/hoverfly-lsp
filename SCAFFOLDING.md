# SCAFFOLDING.md

Records where this monorepo diverges from standard `@jterrazz` single-package house
conventions, and why. House style (`package-typescript`, `package-test`,
`@jterrazz/codestyle`, `jterrazz/jterrazz-actions`) was followed wherever it fit; the
divergences below are driven by the npm-workspaces monorepo shape and by binding
decisions in `research/03-lsp-architecture.md` and `research/10-architect-decisions.md`.

## Divergences from house conventions

### 1. TypeScript config — NodeNext + project references, not the `@jterrazz/typescript` node preset

- House preset (`@jterrazz/typescript/presets/tsconfig/node`) uses
  `moduleResolution: Bundler`, `module: ESNext`, and a single flat package.
- We use a local `tsconfig.base.json` with **`module`/`moduleResolution: NodeNext`,
  `strict`, `noUncheckedIndexedAccess`, `composite: true`** and **TypeScript project
  references** (`tsconfig.json` references `packages/core` + `packages/server`;
  `server` references `core`).
- Reason: binding decisions D1 / report 03 mandate NodeNext + strict +
  noUncheckedIndexedAccess; `packages/core` must compile and be consumed by
  `packages/server` as a real project-reference build (no bundler in the scaffold phase).
  `tsc --build` is the build and typecheck driver.

### 2. Build tool — `tsc --build` for typecheck/tests, **esbuild** for the published bin

- House libraries build/bundle via `tsdown` (the `@jterrazz/typescript` CLI).
- Here `tsc --build` remains the typecheck/test driver (emits `.js` + `.d.ts` to `dist/`,
  keeps the project-reference graph honest). The **`hoverfly-lsp` bin** is additionally
  bundled by **esbuild** (`packages/server/esbuild.config.js`, devDep on `packages/server`)
  into a single self-contained file, per decision D7's distribution guidance.
- `packages/server` build is now `tsc --build && npm run build:bundle`; the root
  `build` script picks it up via `--workspaces --if-present`.
- **Bundle format = CommonJS** (`dist/cli.cjs`): `vscode-languageserver` + protocol/jsonrpc
  are CJS, so a CJS bundle avoids ESM<->CJS interop shims. Explicit `.cjs` extension makes
  Node treat it as CommonJS despite the package's `"type": "module"`; the ESM bin
  (`bin/hoverfly-lsp.js`) imports it for its side effect. `mainFields: ["module", "main"]`
  is required so esbuild picks `vscode-json-languageservice`'s clean ESM build instead of its
  UMD `main` (whose shadowed `require` parameter leaves relative requires unresolved). The
  version is injected via esbuild `define` (`HOVERFLY_LSP_VERSION`) so the bundle never reads
  package.json at runtime. The bundle is proven by spawning it over stdio in the integration
  tests and by the `--version`/`--help` bin smoke tests.

### 3. Linting — `@jterrazz/codestyle` retained, with monorepo-shaped config

- Kept the house lint stack: `codestyle check` / `codestyle fix` runs **tsgo + oxlint +
  oxfmt + knip** in parallel, exactly as in `package-test`. It works in the workspace
  setup because `@jterrazz/codestyle` resolves tool bins from the hoisted root
  `node_modules/.bin`.
- `oxlint.config.ts` extends `oxlint.node` and ignores `**/dist/**` + `testdata/**`.
- Added a root **`knip.json`** declaring per-workspace entry points (core `src/index.ts`;
  server `src/cli.ts` + `bin/hoverfly-lsp.js`; root `oxlint.config.ts` + `vitest.config.ts`)
  and a few `ignoreDependencies`:
  - `vscode-json-languageservice` in `packages/core` — a real dependency declared now per
    D1/report 03, but **not yet imported** (Phase 2 wires it). Without the ignore, knip
    would flag it as unused.
  - `oxlint` at root — imported by `oxlint.config.ts` but provided transitively through
    `@jterrazz/codestyle`, not a direct dependency.
- Added **`.prettierignore`** (`testdata/`, `dist/`) so `oxfmt` does not try to reformat
  the intentionally-malformed fixture `testdata/invalid/invalid-json.hoverfly.json`.
- Formatting note: `oxfmt` runs with its **defaults (2-space indent)** — the house
  4-space JSON/TS indentation seen in `package-test` comes from oxfmt defaults of an older
  codestyle version; current `@jterrazz/codestyle@3.4.0` + `oxfmt@0.54` default to 2 spaces.
  We accept the tool default rather than fighting it (no `.oxfmtrc`).

### 4. CI — plain workflow with a node 20+22 matrix, not the reusable `validate.yaml`

- House repos call `jterrazz/jterrazz-actions/.github/workflows/validate.yaml@main`, which
  runs `make build/lint/test` on a **single** node version and has **no typecheck step**.
- We wrote a plain `.github/workflows/validate.yml` with a **`[20, 22]` matrix** running
  `install → build → typecheck → lint → test`.
- Reason: the task requires a node 20+22 matrix and an explicit typecheck stage, neither of
  which the reusable workflow provides. A `Makefile` mirroring house targets
  (`build/lint/test/typecheck/install`) is included so the repo can migrate to the reusable
  workflow later if a matrix variant becomes available.

### 5. Workspace dependency protocol — `*`, not `workspace:*`

- `packages/server` depends on `@hoverfly-lsp/core` via **`"*"`** (npm-resolved workspace
  symlink), since npm workspaces do **not** support pnpm/yarn's `workspace:*` protocol.

### 6. Release pipeline — plain tag-driven workflow, not the reusable `release-npm.yaml`

- House single-package repos call
  `jterrazz/jterrazz-actions/.github/workflows/release-npm.yaml@main` on the GitHub
  `release: created` event. That reusable workflow runs `make build` and a **single**
  root-level `npm publish --access public --provenance`.
- It does not fit this monorepo: we publish **two** packages (`@hoverfly-lsp/core` then
  `hoverfly-lsp` — order matters, server depends on core), additionally package and attach a
  VS Code `.vsix`, and create the GitHub Release body carrying the Zed / Claude Code /
  Marketplace manual-distribution notes. A root `npm publish` would try to publish the
  private monorepo root and ignore the workspaces.
- We therefore wrote a plain **`.github/workflows/release.yml`**, triggered on **tag `v*`**
  push (the simplest trigger that matches house "tag a version to release" ergonomics — no
  release-please/changesets infra added). It:
  1. runs the full gate on the `[20, 22]` node matrix (mirrors `validate.yml`),
  2. verifies the pushed tag equals the version in every manifest (core, server, vscode,
     zed `extension.toml`, claude-code `plugin.json`) before publishing anything,
  3. `npm publish`es core then server with `--access public --provenance` (OIDC
     `id-token: write` — keeps the house provenance guarantee),
  4. packages the `.vsix` and creates the GitHub Release with the `.vsix` attached.
- **Reused from house style**: the provenance + public-access publish pattern, the OIDC
  `id-token: write` permission, and the `npm ci → build → publish` shape are taken verbatim
  from `release-npm.yaml`'s `publish` job. The divergence is only the monorepo fan-out and
  the release-asset/notes step.
- **Manual (no tokens in CI)**, documented in the Release body: VS Code Marketplace
  (`vsce publish`), Open VSX (`ovsx publish`), Zed registry PR, Claude Code marketplace
  refresh, SchemaStore submission. `NPM_TOKEN` is the only secret the workflow needs.
- **Versioning**: all manifests pinned to **`0.1.0`** (npm name `hoverfly-lsp` verified
  available — `npm view` 404 — so **no `@jterrazz/` scope fallback was needed**). The vsce
  constraint that an extension version cannot be `0.0.0` is satisfied. The server bin's
  `bin` value was de-`./`-prefixed so `npm publish` no longer auto-corrects/strips the bin
  mapping (`npm publish --dry-run` is clean for both packages). The `editors/vscode`
  directory has **no LICENSE file**, so `vsce package` emits a non-blocking LICENSE warning;
  the repo root is MIT.

## Non-divergences (house style followed)

- `type: module` everywhere; MIT license; author `Jean-Baptiste Terrazzoni`.
- `@jterrazz/codestyle` as the single quality gate; `npm run lint` == `codestyle check`.
- Vitest as the test runner (`vitest --run`), `// Given -` / `// Then -` test comments.
- `Makefile` with `node_modules/.install` sentinel target, matching house repos.
- 4-space indentation in hand-authored JSON fixtures and configs where oxfmt does not
  touch them.

## State of the scaffold (for the next phase)

- `npm install`, `npm run build`, `npm run typecheck`, `npm test`, `npm run lint` are all
  green. 16 tests pass (12 fingerprint unit + 1 corpus presence + 2 corpus fixtures + 1
  server stdio integration).
- The only real logic implemented is `isHoverflySimulation()` (decision D3). Everything
  else (`createHoverflyLanguageService`, the server validate pass) is a no-op placeholder.
