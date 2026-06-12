# hoverfly-lsp — Master Plan

A production-quality Language Server for **Hoverfly JSON simulation files**, giving
VS Code, Zed, IntelliJ and Claude Code agents real-time diagnostics, semantic
"type checking", autocomplete and hover docs — everything `tsc`-grade tooling does,
scoped to the Hoverfly v5 simulation format.

Research basis: `research/01-09` (two multi-agent research rounds against the official
docs **and** the Hoverfly Go source). Binding decisions: `research/10-architect-decisions.md`.

## Why this is worth building

- The field is empty: no Hoverfly LSP, extension, or SchemaStore entry exists anywhere.
- Hoverfly only validates at import time, and its schema is permissive — most real mistakes
  (wrong matcher casing, wrong value type, unresolved template vars, dead state transitions)
  fail **silently** as never-matching pairs. That's exactly what a semantic analyzer fixes.
- One TypeScript stdio server covers all four target clients.

## Architecture (decided)

```
hoverfly-lsp/
├── packages/
│   ├── core/                  # pure analysis library — ZERO LSP transport deps
│   │   └── src/
│   │       ├── schema/        # bundled enhanced JSON Schema + schema service wiring
│   │       ├── registry/      # matcher table, templating helper catalog, faker types (generated from Hoverfly source)
│   │       ├── semantic/      # HFxxx validators (one file per rule family)
│   │       ├── template/      # {{ }} Handlebars-subset parser + analyzer
│   │       ├── contributions/ # completion & hover (JSONWorkerContribution)
│   │       └── service.ts     # createHoverflyLanguageService() facade
│   └── server/                # vscode-languageserver@10 wrapper, bin: hoverfly-lsp --stdio
├── editors/
│   ├── vscode/                # extension, language id "hoverfly-simulation", bundles server
│   ├── zed/                   # Rust/WASM extension, installs server from npm
│   ├── intellij/              # LSP4IJ template + setup docs
│   └── claude-code/           # Claude Code plugin (LSP component)
├── schemas/                   # standalone JSON Schema (SchemaStore submission artifact)
├── testdata/                  # THE reference corpus (valid/, invalid/, completion/, hover/)
└── research/                  # research reports + architect decisions
```

Foundation: `vscode-json-languageservice` (the engine VS Code's own JSON mode uses) provides
error-recovering parsing and schema-driven baseline; Hoverfly intelligence layers on top via
its documented extension points. Dependency direction: `editors → server → core`.

## Feature matrix (v1)

| Feature                                           | Source                                                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Structural validation                             | enhanced official schema (faithful to Hoverfly's `schema.json`)                                          |
| Matcher name & value-type checking                | normative table from Go matcher registry (14 matchers)                                                   |
| `body`/`bodyFile`, Content-Length parity warnings | mirrors Hoverfly's own import warnings, same wording                                                     |
| State flow analysis                               | `requiresState` ↔ `transitionsState`/`removesState` cross-refs, `sequence:` aware                        |
| Template validation (`templated: true`)           | Handlebars-subset parser; 52 helpers w/ arity; `Request.*`, `State.*`, `Vars.*`, `Literals.*` resolution |
| Completion                                        | fields, matcher names, helper names, faker types, state keys, Vars/Literals                              |
| Hover                                             | every field/matcher/helper, with docs.hoverfly.io links                                                  |
| Stable diagnostic codes                           | `HF1xx`–`HF6xx` catalog, golden-tested                                                                   |

## Phases

Each phase = one supervised multi-agent workflow (Opus/Sonnet implementers, adversarial
reviewers); Fable directs, reviews between phases, and gates progression on green tests.

1. **Scaffold** — monorepo, tsconfig/ESM, Vitest, CI (validate on PR), jterrazz conventions, git init. _(task #3)_ ✅ **Done.**
2. **Core foundation** — bundled schema, generated registries (matchers/helpers/faker), fingerprint, language-service wiring; first smoke tests. _(task #4)_ ✅ **Done.**
3. **Semantic validators** — freeze the HFxxx catalog, implement rule-by-rule. _(task #5)_ ✅ **Done** — HF1xx–HF6xx (37 codes) shipped with golden + unit coverage.
4. **Template engine** — parser + analyzer + completions inside body strings. _(task #6)_ ✅ **Done** — block-aware Handlebars-subset parser + HF5xx analyzer.
5. **Completion & hover contributions.** _(task #7)_ ✅ **Done** — fields, matchers, helpers, faker, state keys, Vars/Literals; hover with docs links.
6. **Reference corpus** — the big one: hundreds of valid/invalid fixtures covering every matcher × value type, every response field, templating, state machines, v1–v5.3; golden diagnostic snapshots; cursor-marker (`$0`) completion/hover tests. Grown continuously from phase 2, completed here with a coverage-audit agent. _(task #8)_ ✅ **Done** — 54 valid + 107 invalid goldens; ground-truth-verified against real Hoverfly v1.12.8 (see D9).
7. **LSP server** — stdio bin, push+pull diagnostics, JSON-RPC integration tests. _(task #9)_ ✅ **Done.**
8. **Editor integrations** — VS Code / Zed / IntelliJ / Claude Code, each verified end-to-end. _(task #10)_ ✅ **Done** — all four integrated; in-editor checks documented in MANUAL-QA.md.
9. **Ship** — SchemaStore PR artifact, README + docs, schema-drift CI vs Hoverfly master, npm + Marketplace release pipeline. _(task #11)_ 🚧 **In progress** — README + generated docs (diagnostics, template reference) + docs-drift CI landed; npm publish, Marketplace/Open VSX release, and the SchemaStore submission remain.

## v0.1.0 — shipped scope

What v0.1.0 delivers (869 tests green):

- **Format:** Hoverfly v5.x JSON simulations, fully featured; v1–v4 accepted with an upgrade hint
  (no completion investment), per architect decision D6.
- **Diagnostics:** the frozen `HF1xx`–`HF6xx` catalog (37 codes), golden-tested, each carrying
  `code` + `source: "hoverfly"` + `codeDescription.href`. See [docs/diagnostics.md](./docs/diagnostics.md).
- **Templating:** block-aware Handlebars-subset parser; 52 Hoverfly helpers + 8 raymond built-ins
  with arity checks; `Vars`/`Literals` resolution; 210 faker types (gofakeit v6.28.0); `now`
  offset validation. See [docs/template-reference.md](./docs/template-reference.md).
- **Completion & hover:** fields, matcher names, helper names, faker types, state keys,
  `Vars`/`Literals`; hover docs with docs.hoverfly.io links.
- **Server:** stdio bin `hoverfly-lsp --stdio`, push **and** pull diagnostics (pull matters for
  headless agents).
- **Editors:** VS Code (bundled `.vsix`), Zed (Rust/WASM), IntelliJ (LSP4IJ template), Claude Code
  (plugin with `.lsp.json`).
- **Safety:** content fingerprint (D3) makes pointing the server at any `.json` safe.
- **Provenance:** schema + helper/faker catalogs pinned to a `HOVERFLY_COMMIT`; weekly schema-drift
  CI vs Hoverfly master.

Out of scope for v1 (D6): YAML simulations, the hoverfly-java DSL, middleware, and Hoverfly
Cloud-only extensions.

## Post-v1 ideas

- **Strict version-gated mode** — opt-in enforcement that a v5.x feature is only used under a
  high-enough version tag (e.g. `array` matcher requires its introducing version). Off by default
  today; versions are intent markers, not enforced (D4).
- **Hoverfly Cloud features** — validation/completion for `docs.cloud.hoverfly.io`-only extensions.
- **Code actions / quick fixes** — autofix matcher casing (HF202), `jsonPartial → jsonpartial`,
  remove `body`-or-`bodyFile` (HF301), enable `templated` (HF501), etc.
- **Formatting** — a simulation-aware formatter / canonicaliser.

## Testing pyramid (decided)

- **Bulk at core**: golden diagnostics (`testdata/invalid/**/*.hoverfly.json` + sibling
  `.diagnostics.golden`), fixture validity (`testdata/valid/**` must produce zero diagnostics),
  cursor-marker completion/hover tests (tsgo-fourslash style).
- **Thin at server**: full stdio JSON-RPC round-trips (initialize → didOpen → diagnostics → completion).
- **Edge**: each editor extension gets a minimal smoke test / documented manual verification.
- Tooling: Vitest (`toMatchFileSnapshot` for goldens).

## Key risks & mitigations

- **Template parser scope creep** (block helpers, subexpressions): grammar decided by source
  verification (report 08); start with full tokenizer + nesting, arity table generated from source.
- **Schema drift** (Hoverfly releases monthly): `HOVERFLY_COMMIT` pin + weekly CI drift check.
- **`.json`-wide activation** (Claude Code, generic editors): content fingerprint (D3) makes the
  server safe to point at any JSON file.
