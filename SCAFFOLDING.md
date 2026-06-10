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
