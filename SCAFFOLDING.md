# SCAFFOLDING.md

Records where this monorepo diverges from standard `@jterrazz` single-package house
conventions, and why. House style (`package-typescript`, `package-test`,
`@jterrazz/typescript`, `jterrazz/jterrazz-actions`) was followed wherever it fit; the
divergences below are driven by the npm-workspaces monorepo shape and by binding
decisions in `research/03-lsp-architecture.md` and `research/10-architect-decisions.md`.

## Divergences from house conventions

### 1. TypeScript config: the house preset plus the project-reference plumbing

- `tsconfig.base.json` extends `@jterrazz/typescript/tsconfig/node` and adds only what
  the preset cannot know: this tree EMITS through `tsc --build` as project references
  (decision D1 / report 03), so `composite`, `declaration`, `declarationMap`,
  `sourceMap` and `noEmit: false` live there, plus `allowJs: false`, which
  `isolatedDeclarations` requires of the published member.
- The root `tsconfig.json` stays a solution file (references `packages/analysis`,
  `packages/server`, `editors/vscode`; `server` references `analysis`), and
  `packages/server` — the one published package — extends
  `@jterrazz/typescript/tsconfig/library` ahead of the base.
- Until v10 of the toolchain this was a hand-written `NodeNext` config extending
  nothing; the preset now carries the strictness it was written for.

### 2. Build tool: `tsc --build` for typecheck/tests, **esbuild** for the published bin

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
  (`packages/server/bin/hoverfly-lsp.js`) imports it for its side effect. `mainFields: ["module", "main"]`
  is required so esbuild picks `vscode-json-languageservice`'s clean ESM build instead of its
  UMD `main` (whose shadowed `require` parameter leaves relative requires unresolved). The
  version is injected via esbuild `define` (`HOVERFLY_LSP_VERSION`) so the bundle never reads
  package.json at runtime. The bundle is proven by spawning it over stdio in the integration
  tests and by the `--version`/`--help` bin smoke tests.

### 3. Linting: `@jterrazz/typescript` retained, with monorepo-shaped config

- Kept the house lint stack: `typescript check` / `typescript fix` runs **tsgo + oxlint +
  oxfmt + knip** in parallel, exactly as in `package-test`. It works in the workspace
  setup because `@jterrazz/typescript` resolves tool bins from the hoisted root
  `node_modules/.bin`.
- `oxlint.config.ts` extends the `node` profile and ignores `testdata/**` — the corpus
  is deliberately malformed, and `dist/**` is the profile's own business.
- Added a root **`knip.json`** declaring per-workspace entry points (analysis `src/index.ts`;
  server `src/cli.ts` + `packages/server/bin/hoverfly-lsp.js`; root `oxfmt.config.ts` + `oxlint.config.ts` +
  `vitest.config.ts`) and a few `ignoreDependencies`:
    - `vscode-json-languageservice` in `packages/analysis`: a real dependency declared now per
      D1/report 03, but **not yet imported** (Phase 2 wires it). Without the ignore, knip
      would flag it as unused.
    - `tsc` as an unlisted binary at root: `tsc --build` drives the build, and the
      compiler arrives with `@jterrazz/typescript` rather than as a direct dependency.
- `oxfmt.config.ts` carries the tree's own ignore patterns — the fixture corpus and the
  two byte-identical schema copies — each with its reason on the line. They lived in a
  `.prettierignore` until the toolchain's contract moved them into the config.
- Formatting note: `oxfmt.config.ts` now wires the family preset
  (`@jterrazz/typescript`'s `oxfmt`) — 4-space indent, single quotes, 100-char width,
  matching every other house repo, in place of the earlier bare 2-space tool default.

### 4. CI: the house reusable, with one local gate in the `Makefile`

- `.github/workflows/validate.yaml` calls
  `jterrazz/jterrazz-actions/.github/workflows/validate.yaml@main` on node 24, which runs
  `make build && make lint && make test` — the same three targets every house repo exposes.
- The one step the reusable does not carry is the docs-freshness check, so it is a
  `Makefile` target (`docs`) that `make lint` depends on: it regenerates
  `docs/reference/` from the built analysis package and refuses a drifted tree.
- The build type-checks every member, so no separate typecheck stage runs in CI; the
  `typecheck` target stays for local use.

### 5. Workspace dependency protocol: `*`, not `workspace:*`

- `packages/server` depends on `@hoverfly-lsp/analysis` via **`"*"`** (npm-resolved workspace
  symlink), since npm workspaces do **not** support pnpm/yarn's `workspace:*` protocol.

### 6. Release pipeline: house flow (`release: created` + OIDC), monorepo-aware

- House single-package repos call
  `jterrazz/jterrazz-actions/.github/workflows/release-npm.yaml@main` on the GitHub
  `release: created` event. That reusable workflow runs `make build` and a **single**
  root-level `npm publish --access public --provenance` with **no `NODE_AUTH_TOKEN`**: auth
  is tokenless **npm OIDC trusted publishing**.
- The reusable can't be used as-is: we publish **one** package (`@jterrazz/hoverfly-lsp`;
  `@hoverfly-lsp/analysis` is **private** (never published) and inlined into the server bundle by
  esbuild, so the server has no runtime dep on it) and attach a VS Code `.vsix`. A root
  `npm publish` would try to publish the private monorepo root and ignore the workspaces.
- So **`.github/workflows/release.yml`** matches the house **conventions** but is monorepo-aware:
  same **`release: created`** trigger, same **OIDC trusted publishing** (`--provenance` +
  `id-token: write`, **no `NPM_TOKEN`**), node 24. It:
    1. runs the same house gate as `validate.yaml`, on node 24,
    2. verifies `github.event.release.tag_name` equals the version in every manifest (analysis,
       server, vscode, zed `extension.toml`, claude-code `plugin.json`) before publishing,
    3. `npm publish`es `@jterrazz/hoverfly-lsp` with `--access public --provenance` (tokenless OIDC),
    4. packages the `.vsix` and uploads it onto the just-created release (`gh release upload`).
- **One-time**: configure npm trusted publishing (repo `jterrazz/hoverfly-lsp`, workflow
  `release.yml`) for `@jterrazz/hoverfly-lsp`, exactly as for the other `@jterrazz` packages. No
  `NPM_TOKEN` secret is needed. `@hoverfly-lsp/analysis` is private, so nothing to configure for it.
- **Manual (no tokens in CI)**, documented in docs/04-operating.md: VS Code Marketplace
  (`vsce publish`), Open VSX (`ovsx publish`), Zed registry PR, Claude Code marketplace
  refresh, SchemaStore submission.
- **Versioning**: all manifests pinned to **`0.1.0`**. The single published package uses the
  user's own scope, **`@jterrazz/hoverfly-lsp`** (the bin/command stays `hoverfly-lsp`);
  `@hoverfly-lsp/analysis` keeps its name but is `private` and never published. The vsce
  constraint that an extension version cannot be `0.0.0` is satisfied. The server bin's
  `bin` value was de-`./`-prefixed so `npm publish` no longer auto-corrects/strips the bin
  mapping (`npm publish --dry-run` is clean for the published package). The `editors/vscode`
  directory has **no LICENSE file**, so `vsce package` emits a non-blocking LICENSE warning;
  the repo root is MIT.

## Non-divergences (house style followed)

- `type: module` everywhere; MIT license; author `Jean-Baptiste Terrazzoni`.
- `@jterrazz/typescript` as the single quality gate; `npm run lint` == `typescript check`.
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
