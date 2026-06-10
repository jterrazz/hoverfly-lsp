# hoverfly-lsp

<!-- Badges: replace placeholders once the npm package and Marketplace listing are published. -->

[![npm](https://img.shields.io/badge/npm-hoverfly--lsp-cb3837)](https://www.npmjs.com/package/hoverfly-lsp)
[![CI](https://img.shields.io/badge/CI-validate-blue)](./.github/workflows/validate.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

A **Language Server for [Hoverfly](https://hoverfly.io) JSON simulation files** — it brings
`tsc`-grade tooling to your API mocks: real-time **diagnostics**, semantic **type checking**,
**completion**, and **hover** docs for the Hoverfly v5 simulation format, in VS Code, Zed,
IntelliJ, and Claude Code agents.

Hoverfly only validates simulations at import time, and its schema is permissive — so most real
mistakes (wrong matcher casing, wrong value type, unresolved template variables, dead state
transitions) fail **silently** as pairs that never match, or **panic** the running instance.
hoverfly-lsp catches those _as you type_.

> **Status: pre-release.** The core analyzer and the stdio LSP server are implemented and
> tested, with editor integrations for VS Code, Zed, IntelliJ (LSP4IJ), and Claude Code. The
> `hoverfly-lsp` npm package and the SchemaStore entry are not published yet, so each editor
> integration ships a dev/local install path alongside the future npm path. See
> [MANUAL-QA.md](./MANUAL-QA.md) for in-editor checks that cannot run headlessly.

## Features

- **Diagnostics & semantic type-checking** — a stable, golden-tested catalog of `HFxxx` codes
  spanning structure, matchers, response fields, state flow, templating, and global actions.
  Severities mirror real Hoverfly behaviour: **error** when Hoverfly would reject the import or
  the pair could silently never match (or panic), **warning** for legal-but-suspicious, down to
  **hint**. Full catalog: [docs/diagnostics.md](./docs/diagnostics.md).
- **Completion** — fields, matcher names, template helper names, faker types, state keys, and
  `Vars`/`Literals` references.
- **Hover** — every field, matcher, helper, and faker type, with links to the Hoverfly docs.
- **Template intelligence** — a real block-aware Handlebars-subset parser validates
  `"templated": true` bodies: helper arity, the 52 Hoverfly helpers + 8 raymond built-ins,
  `Vars`/`Literals` resolution, `faker` types, and `now` offsets. See
  [docs/template-reference.md](./docs/template-reference.md).

<!-- SCREENSHOT PLACEHOLDER: drop a capture of inline HFxxx diagnostics at docs/images/diagnostics.png
     and uncomment the line below. -->
<!-- ![Inline diagnostics in an editor](./docs/images/diagnostics.png) -->

> 📸 _Screenshot placeholder — inline `HFxxx` diagnostics in an editor (to be added at `docs/images/diagnostics.png`)._

### Example: a caught panic-path error

An unknown matcher name does not fail Hoverfly's import — it **panics the instance at match
time** (nil func type assertion). The LSP flags it as an error before you ever run it:

```jsonc
{
  "request": {
    "path": [
      // ❌ HF201: Unknown matcher "contains" — Hoverfly panics at match time on unknown matchers
      { "matcher": "contains", "value": "/api/v1/orders" },
    ],
  },
  "response": { "status": 200, "body": "{}" },
}
```

### Example: template completion

Inside a `"templated": true` body, completion offers the helper catalog and validates arity as
you type:

```jsonc
{
  "response": {
    "templated": true,
    // typing `{{ ran` → randomString, randomStringLength, randomUuid, randomEmail, …
    "body": "{\"id\":\"{{ randomUuid }}\",\"createdAt\":\"{{ now '' 'unix' }}\"}",
  },
}
```

## Installation

The server is editor-agnostic (stdio LSP, bin `hoverfly-lsp --stdio`). Pick your editor:

| Editor               | Integration                         | Setup guide                                                      |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| VS Code              | Bundled extension (`.vsix`)         | [editors/vscode/README.md](./editors/vscode/README.md)           |
| Zed                  | Rust/WASM extension                 | [editors/zed/README.md](./editors/zed/README.md)                 |
| IntelliJ / JetBrains | LSP4IJ user-defined server template | [editors/intellij/README.md](./editors/intellij/README.md)       |
| Claude Code          | Plugin with `.lsp.json` LSP server  | [editors/claude-code/README.md](./editors/claude-code/README.md) |

### The `*.hoverfly.json` convention

Name your simulations **`*.hoverfly.json`** (or `hoverfly-simulation.json`). Explicitly-named
files always get full treatment, including a "this doesn't look like a simulation" diagnostic if
the shape is wrong. For any other `.json` file, the server **content-fingerprints** it — a root
`data` object plus a `meta.schemaVersion` starting with `v` — and politely returns empty results
when it isn't a simulation, so pointing the server at all JSON stays safe.

### Zero-install fallback (SchemaStore)

A JSON Schema published to [SchemaStore](https://www.schemastore.org/) gives basic validation and
completion in **every** editor that consumes the SchemaStore catalog (VS Code, IntelliJ, Neovim, …)
without installing anything — and a `"$schema"` self-declaration in a simulation file auto-applies
it. The schema has **not been submitted yet** (planned `fileMatch: ["*.hoverfly.json",
"hoverfly-simulation.json"]`, per architect decision D7 §6); until then, use a per-editor
integration above.

## Architecture

A single TypeScript stdio server (`packages/server`) wraps a pure analysis library
(`packages/core`, zero LSP transport deps) built on `vscode-json-languageservice` with
Hoverfly-specific semantic validators, a Handlebars-subset template engine, and registries
generated from the Hoverfly Go source. Dependency direction: `editors → server → core`. See
[PLAN.md](./PLAN.md) for the full plan and [research/](./research) for the binding research and
architect decisions.

```
packages/core     @hoverfly-lsp/core   — pure analysis library (zero LSP transport deps)
packages/server   hoverfly-lsp         — stdio LSP server (the published bin)
editors/          vscode / zed / intellij / claude-code editor integrations
testdata/         the reference corpus (valid/ + invalid/ goldens)
docs/             diagnostics + template reference (generated from core)
research/         research reports + architect decisions
```

## Documentation

- [docs/diagnostics.md](./docs/diagnostics.md) — the full `HFxxx` diagnostic catalog.
- [docs/template-reference.md](./docs/template-reference.md) — helpers, faker types, `now` offsets.
- [CONTRIBUTING.md](./CONTRIBUTING.md) — dev setup, corpus conventions, golden regeneration.
- [MANUAL-QA.md](./MANUAL-QA.md) — in-editor verification steps that cannot run headlessly.

## Development

```bash
npm install
npm run build          # tsc build across workspaces
npm test               # vitest
npm run typecheck      # tsc --build
npm run lint           # @jterrazz/codestyle (oxlint + oxfmt + tsgo + knip)
npm run docs:diagnostics  # regenerate docs/ from the built core
```

## License

MIT — all dependencies are MIT/Apache (verified, no copyleft; architect decision D6).
