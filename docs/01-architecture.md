# Architecture

What this repository is: one pure analysis library, one stdio language server
wrapped around it, and four thin editor launchers that all speak to the same
binary. This chapter draws the lines and says why they are where they are.

## The three layers

Dependency direction is strict and one-way: `editors → server → core`. Nothing
below ever reaches up.

| Layer             | Package                  | What it is                                                                           |
| ----------------- | ------------------------ | ------------------------------------------------------------------------------------ |
| `packages/core`   | `@hoverfly-lsp/core`     | The analysis library: parse, schema, registries, templates, rules. Private, bundled. |
| `packages/server` | `@jterrazz/hoverfly-lsp` | The LSP transport: `initialize`, capabilities, document sync, `bin: hoverfly-lsp`.   |
| `editors/`        | four launchers           | VS Code, Zed, IntelliJ, Claude Code — locate the server and start it, nothing more.  |

`packages/core` carries **zero LSP transport dependencies**: the JSON language
service, the LSP _types_, a text-document model, and the two engines the rules
need (`re2js`, `fast-xml-parser`) — nothing that speaks a wire protocol
(`packages/core/package.json:23`). It is consumed as a real TypeScript project
reference — `tsconfig.base.json` adds the emitting, composite half the house
`node` preset leaves out (decision D1). A transport import in
core is the one architectural regression to watch for.

`@hoverfly-lsp/core` is `"private": true` and is never published. esbuild inlines
it into the server's single-file CommonJS bundle
(`packages/server/esbuild.config.js`), so the published tarball has no runtime
dependency on it — `packages/server/package.json:10` ships exactly `bin/` and
`dist/cli.cjs`.

## Inside core

The library is a pipeline over one text document. Each stage is a directory
under `packages/core/src/`, and `service.ts` is the facade that composes them
into `createHoverflyLanguageService()`.

| Directory          | Owns                                                                                           |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `fingerprint.ts`   | Whether a `.json` file is a Hoverfly simulation at all — filename set plus content fingerprint |
| `schema/`          | The bundled enhanced JSON Schema, generated into a TS module, plus the upstream provenance pin |
| `registry/`        | The matcher table, the templating helpers, the faker types, HTTP and structure facts           |
| `template/`        | A Handlebars-subset parser, analyzer, AST and string source map for `{{ … }}` inside bodies    |
| `semantic/`        | The frozen `HFxxx` catalog, the rule engine, and one rule file per code family                 |
| `contributions/`   | Hover and completion, layered onto `vscode-json-languageservice` as a `JSONWorkerContribution` |
| `semantic-tokens/` | The frozen token legend and the pure producer that emits template-aware tokens                 |

Two of those directories carry their own close-up notes, kept beside the code
they describe: `packages/core/src/semantic/README.md` (how to add a rule family)
and `packages/core/src/contributions/README.md` (the hover content policy and
the completion coverage matrix).

### The catalog is the single source of truth

Every diagnostic's severity, message template and documentation href come from
`packages/core/src/semantic/catalog.ts`, and a rule reaches them only through
`makeDiagnostic()` (`packages/core/src/semantic/diagnostics.ts:65`). A rule never
inlines a severity or a message string, so a code's meaning is defined in exactly
one place and the golden snapshots stay stable.

Codes are a **stable API**: once a code is frozen its meaning never changes, new
codes may be added, and a deprecated code is never reused. The href each code
carries resolves to `https://hoverfly-lsp.dev/diagnostics/<code>`
(`packages/core/src/semantic/catalog.ts:21`) — a published address, not a path in
this tree, so moving a page in this repository never moves a diagnostic's link.

### The registries are transcribed and pinned

The matcher, helper and faker tables are not read from the Hoverfly docs, which
are wrong in several places. They are transcribed from the Hoverfly Go source at
a pinned commit, recorded as `HOVERFLY_COMMIT` in
`packages/core/src/schema/provenance.ts` and mirrored in
`schemas/upstream-source-hashes.json`. A weekly workflow diffs upstream against
that baseline and opens one tracking issue when it moves; it never updates
anything itself (`.github/workflows/schema-drift.yml`).

## The server

`packages/server` is transport and nothing else. It creates the connection,
answers `initialize` with the capabilities core's frozen legend implies, keeps a
`TextDocuments` store, and forwards every question to the service.

Diagnostics are advertised through **both** channels: a `diagnosticProvider` for
clients that pull (`textDocument/diagnostic`), and a debounced push on
`didOpen`/`didChange` for clients that do not. The server reads the client's
capabilities at `initialize` and skips the push path when pull is available, so
no client pays for both (`packages/server/src/capabilities.ts:55`).

The semantic-tokens legend is taken verbatim and in order from core's
`SEMANTIC_TOKEN_TYPES` / `SEMANTIC_TOKEN_MODIFIERS`. The wire protocol carries
integer indices into those arrays, so a hand-retyped copy would silently
mis-colour every token.

The bin accepts the four LSP transports (`--stdio` by default, `--node-ipc`,
`--socket=PORT`, `--pipe=NAME`) plus `--version` and `--help`
(`packages/server/src/cli.ts`). The version is injected into the bundle by
esbuild `define`, so the shipped file never reads `package.json` at runtime.

## The editors

Each launcher is deliberately thin: all intelligence lives in the npm package,
and an editor integration only has to find it and start it with `--stdio`.

| Launcher              | Ships the server how                                                            |
| --------------------- | ------------------------------------------------------------------------------- |
| `editors/vscode`      | Bundles it: esbuild copies the server into the extension before `vsce package`  |
| `editors/zed`         | Rust/WASM extension; resolves project-local, then `$PATH`, then Zed-managed npm |
| `editors/intellij`    | LSP4IJ plugin; Gradle copies the server bundle into the plugin resources        |
| `editors/claude-code` | A plugin whose `launch.cjs` starts the globally installed npm package           |

The Zed extension is also mirrored into the Zed registry through a separate
fork; `editors/zed/registry-submission/` holds what that submission carries.

## What is not a layer

`testdata/` is the reference corpus — the behavioural contract the semantic
pipeline is judged against, not a source layer
([03-testing.md](03-testing.md)).

`schemas/` holds the standalone SchemaStore artifact and the upstream baseline
the drift watcher compares against; it is a distribution of the same schema core
bundles, kept separate because SchemaStore consumes a plain file.

`docs/reference/` is a projection of core, written by
`scripts/generate-diagnostic-docs.mjs` and never by hand
([02-developing.md](02-developing.md)).

`research/` is the provenance trail: the two multi-agent research rounds against
the Hoverfly Go source, the ground-truth run against a real Hoverfly v1.12.8, and
`research/10-architect-decisions.md`, which is this repository's binding decision
log (D1–D9) and the tie-breaker when two reports disagree.
