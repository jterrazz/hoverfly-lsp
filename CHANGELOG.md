# Changelog

All notable changes to **hoverfly-lsp** are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html). All packages and editor
extensions in this monorepo are versioned together.

## [0.1.0] - 2026-06-11

First public release: a Language Server bringing `tsc`-grade tooling — real-time
diagnostics, semantic validation, completion and hover — to Hoverfly v5 JSON simulation
files (`*.hoverfly.json`, `hoverfly-simulation.json`).

### Added

- **`hoverfly-lsp` (npm)** — the stdio LSP server bin, a single self-contained esbuild
  bundle. Editor-agnostic; serves Zed, IntelliJ/LSP4IJ, Claude Code, Neovim and any LSP
  client. Supports both **push and pull diagnostics** (pull matters for headless agents).
- **`@hoverfly-lsp/core` (npm)** — the pure analysis library (zero LSP transport deps),
  built on `vscode-json-languageservice` with Hoverfly-specific intelligence layered on
  via `JSONWorkerContribution` + AST-walking semantic validators.
- **Content fingerprinting (D3)** — a JSON file is treated as a simulation iff its root has
  an object `data` and a `meta.schemaVersion` starting with `v`. Non-simulations get empty
  results, so broad `.json` activation stays safe; explicitly-named files always get full
  treatment.
- **Schema diagnostics** — a bundled schema faithful to Hoverfly master's official
  `schema.json` (enhanced with titles/descriptions/examples), pinned per release via a
  `HOVERFLY_COMMIT` provenance constant.
- **Semantic validators (`HF1xx`–`HF6xx`)** — stable `HF`-prefixed diagnostic codes grouped
  by area: `HF1xx` schema/structure, `HF2xx` matchers, `HF3xx` response fields, `HF4xx`
  state, `HF5xx` templating, `HF6xx` globalActions/meta. Every diagnostic carries `code`,
  `source: "hoverfly"`, and a docs `codeDescription.href`.
  - Matcher registry validation: the 14 known matchers plus the `form` body pseudo-matcher,
    with panic-aware errors (unknown matcher, `config` on non-`array`, `form` outside `body`
    or wrong-case, `array` non-array value, object-shaped `doMatch` chains recursed at every
    nesting level).
  - Severity policy (D4): **error** when Hoverfly would reject the import or the pair could
    never match; **warning** for legal-but-likely-mistake (e.g. `body` + `bodyFile`,
    `Content-Length` mismatch, vacuous `negate`); **information**/**hint** for style and
    upgrade nudges (e.g. v1–v4 auto-upgrade, canonical lowercase matcher casing).
- **Templating intelligence** — a nested, block-aware Handlebars parser (block helpers,
  subexpressions, `@index/@first/@last/@key`, dotted paths) feeding completion, hover, and
  `HF5xx` diagnostics. Catalogs: 52 Hoverfly helpers + 8 raymond built-ins, 210 zero-arg
  gofakeit names (v6.28.0), and `{{ Vars.X }}` / `{{ Literals.X }}` resolution against
  `data.variables` / `data.literals`.
- **Completion & hover** — context-aware completion (matcher names, template helpers, faker
  types, paths) and hover docs that document Hoverfly's actual dialects (JSONPath = kubectl,
  XPath = `ChrisTrenkamp/xsel`).
- **Editor integrations**
  - **VS Code** — bundled extension (`.vsix`) shipping the server (zero-install), published
    to Marketplace + Open VSX (manual step).
  - **Zed** — Rust/WASM extension resolving the `hoverfly-lsp` npm bin at runtime.
  - **IntelliJ / JetBrains** — documented LSP4IJ user-defined-server template.
  - **Claude Code** — plugin with an `.lsp.json` LSP server; content fingerprint (D3)
    handles `.json`-wide activation safely.

### Notes

- **Scope (D6)**: JSON simulation format only; v5.x fully featured; v1–v4 accepted with an
  upgrade hint. Out of scope for v1: YAML simulations, hoverfly-java DSL, middleware,
  Hoverfly Cloud-only extensions.
- **Hoverfly pin**: schema + helper/faker catalogs are embedded against a pinned Hoverfly
  commit; a CI drift job (D6) diffs them against Hoverfly master and files an issue on drift.
- **Ground truth**: the valid fixture corpus was imported into real Hoverfly v1.12.8;
  `doMatch` is a single chained matcher object, and `HF601` scans both `delays[]` and
  `delaysLogNormal[]` (see architect decisions D9).
- **License**: MIT.

[0.1.0]: https://github.com/jterrazz/hoverfly-lsp/releases/tag/v0.1.0
