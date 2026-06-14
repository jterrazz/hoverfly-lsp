# Hoverfly LSP

<!-- Badges: replace the placeholders once CI, the npm package, and the Marketplace listing are live. -->

[![CI](https://img.shields.io/badge/CI-validate-blue)](./.github/workflows/validate.yml)
[![npm](https://img.shields.io/npm/v/@jterrazz/hoverfly-lsp)](https://www.npmjs.com/package/@jterrazz/hoverfly-lsp)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

**Stop debugging silent mock failures.** Hoverfly LSP gives your editor full understanding of
[Hoverfly](https://hoverfly.io) simulation files — errors as you type, autocomplete everywhere,
docs on hover. It's **the first and only IDE tooling for Hoverfly**.

- **Catches the mistakes Hoverfly never tells you about.** A typo'd key, a wrong matcher casing, a
  malformed template — Hoverfly imports them fine, and then your mock silently never matches. This
  flags them as you type, before you ever run a request.
- **Autocomplete for everything.** Every field, all 14 matchers (with docs), 60 template helpers
  with argument snippets, 210 faker types — and even your own state keys, variables, and literals.
- **Hover any field, matcher, or helper for instant docs.** No more tab-switching to
  docs.hoverfly.io to remember what a matcher expects or what a helper returns.
- **Works everywhere.** VS Code, Zed, IntelliJ, Neovim, Claude Code agents — any editor that
  speaks the standard editor protocol.
- **Trustworthy by design.** Every check is verified against a real Hoverfly instance — not just
  the docs — under a zero-false-positive policy: if it underlines something, Hoverfly really does
  treat it as wrong.

### New to language servers?

It's the same technology behind TypeScript's red squiggles and the autocomplete you already use in
your editor. One server implements the smarts once; a shared standard — the Language Server
Protocol — lets every editor plug into it without each one reinventing the wheel. This project is
exactly that, built for Hoverfly simulation JSON. No prior tooling for Hoverfly has ever existed —
this is the first.

### Without it vs. with it

|             | The loop                                                                                |
| ----------- | --------------------------------------------------------------------------------------- |
| **Without** | Edit the JSON blind → import → `curl` → get a 502 → stare at the logs → guess → repeat. |
| **With**    | The editor underlines the exact token and tells you why — before Hoverfly ever runs.    |

> **Status: v0.1.0 on npm.** The server is published as
> [`@jterrazz/hoverfly-lsp`](https://www.npmjs.com/package/@jterrazz/hoverfly-lsp) (install with
> `npm i -g @jterrazz/hoverfly-lsp`), with editor integrations for VS Code, Zed, IntelliJ, and
> Claude Code (869 tests). The VS Code Marketplace / Open VSX listings and the SchemaStore entry are
> not up yet — those integrations also ship a dev/local path. See [MANUAL-QA.md](./MANUAL-QA.md) for
> the in-editor checks that cannot run headlessly.

---

## Why it matters

Hoverfly fails silently. Its import schema is permissive, so the mistakes that actually break a
mock — a mis-cased matcher, a wrong value type, a template variable that never resolves, a dead
state transition — don't error at import; they just produce pairs that never match (or, for an
unknown matcher, **panic the running instance** at match time). This server catches them at edit
time, with severities and messages ground-truth-verified against real **Hoverfly v1.12.8**.

---

## What you get

**Diagnostics that mirror real Hoverfly behaviour.** A stable catalog of `HFxxx` codes spanning
structure, matchers, response fields, state flow, templating, and global actions — severities
graded the way Hoverfly actually treats each case.

An unknown matcher does not fail Hoverfly's import; it **panics the instance at match time**. The
server flags it as an error before you ever run it:

```jsonc
{
  "request": {
    // ❌ HF201 (error): Unknown matcher "contains" — Hoverfly panics at match time on unknown matchers
    "path": [{ "matcher": "contains", "value": "/api/v1/orders" }],
  },
  "response": { "status": 200 },
}
```

Chained matchers use `doMatch` — and Hoverfly's v5 schema requires it to be a single **object**,
not an array (real Hoverfly v1.12.8 rejects the array form with HTTP 400):

```jsonc
{
  "matcher": "jsonpath",
  "value": "$.id",
  // ❌ HF102 (error): Incorrect type. Expected "object".
  "doMatch": [{ "matcher": "exact", "value": "42" }],
}
```

Inside a `"templated": true` body, faker types are checked against the pinned gofakeit registry —
a near-miss is surfaced (here as info, because Hoverfly renders an empty string rather than
failing):

```jsonc
// ❌ HF507 (info): Unknown faker type "Uuid" for gofakeit 6.28.0   →   did you mean `uuid`?
"body": "{\"id\":\"{{ faker 'Uuid' }}\"}"
```

A response carrying both `body` and `bodyFile` gets Hoverfly's own wording, verbatim:

```jsonc
// ⚠️ HF301 (warning): Response contains both body and bodyFile; please remove one of them,
//                     otherwise body is used if non-empty
"response": { "status": 200, "body": "{}", "bodyFile": "catalog.json" }
```

And `{{ Vars.x }}` / `{{ Literals.x }}` references are resolved against the file's definitions:

```jsonc
// ❌ HF505 (error): Variable "missing" is not defined in data.variables
"body": "{\"token\":\"{{ Vars.missing }}\"}"
```

**Completion & hover, registry-backed.** Generated from Hoverfly's own Go source, so they match
what the running server accepts:

- **14 matchers** with their value-type rules and array-config keys.
- **60 template helpers** — 52 Hoverfly helpers + 8 raymond built-ins — each with arity and a
  ready-to-insert snippet.
- **210 faker types** (gofakeit 6.28.0), completed inside `{{ faker '…' }}`.
- **Cross-referenced state keys** and `Vars`/`Literals`/`postServeAction` names pulled from the
  document itself.

Full code reference: **[docs/diagnostics.md](./docs/diagnostics.md)** ·
template reference: **[docs/template-reference.md](./docs/template-reference.md)**.

**Semantic highlighting that colors your templates.** The `{{ … }}` template syntax in a
`"templated": true` body — helpers, `Request`/`State`/`Vars` paths, faker types, `{{ }}` delimiters —
gets distinct colors, plus matcher names render as enums. See **[Syntax highlighting](#syntax-highlighting)**
below for how this works (and the one Zed setting it needs).

---

## Syntax highlighting

Your editor colors a Hoverfly file with **two independent layers**, and it helps to know which does
what:

1. **The JSON structure — from a tree-sitter grammar, always on.** We reuse the built-in JSON
   grammar, so keys, strings, numbers, and `true`/`false`/`null` are colored out of the box in every
   editor, no setup. This is the same mechanism that colors any `.json`, `.ts`, or `.rs` file.

2. **The Hoverfly-specific parts — from the LSP server's semantic tokens.** A static grammar cannot
   see inside a string, but Hoverfly's templates live _inside_ JSON string values
   (`"body": "{\"id\":\"{{ Request.Path.[1] }}\"}"`). The server understands them and emits typed
   tokens — `{{ }}` as operators, helpers (`now`, `faker`) as functions, `Request`/`State`/`Vars` as
   variables, path segments as properties, known faker types and matcher names as enums — mapped to
   the exact characters even through JSON escapes (`\n`, `\uXXXX`, surrogate pairs). The legend uses
   only **standard** LSP token types, so your theme colors them with no customization.

Because the template coloring comes from the server (not a grammar), it appears wherever the editor
requests LSP semantic tokens:

| Editor            | Semantic tokens                                                                                |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| VS Code           | On by default (`editor.semanticHighlighting.enabled` = `configuredByTheme`).                   |
| Neovim 0.9+       | On by default (`vim.lsp.semantic_tokens`).                                                     |
| IntelliJ / LSP4IJ | On; some versions gate it behind a per-server toggle.                                          |
| **Zed**           | **Off by default** — add `"semantic_tokens": "combined"` to settings, then restart the server. |

> **Note for every editor:** "semantic tokens off" doesn't mean a bland file — the JSON structure
> (layer 1) is still fully colored by tree-sitter. What you lose without them is only the _extra_
> Hoverfly layer: the template internals and matcher-name enums. That's why the difference is most
> visible on Hoverfly files (their distinctive content lives in strings) and barely noticeable on,
> say, TypeScript (whose tree-sitter grammar already covers most of the structure).

Per-editor enablement details and the QA checklist live in each editor's README (linked below) and
in [MANUAL-QA.md](./MANUAL-QA.md).

---

## Install & use

The server is editor-agnostic — a stdio LSP launched as `hoverfly-lsp --stdio`. Pick your editor.

### VS Code

`.vsix` now, Marketplace soon.

```bash
npm install                                       # repo root
npm run build --workspace=hoverfly-lsp            # server bundle
npm run build --workspace=hoverfly-lsp-vscode     # extension + bundled server
npm run package --workspace=hoverfly-lsp-vscode   # -> editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
code --install-extension editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
```

Or open `editors/vscode` and press **F5** for an Extension Development Host. Once published:
`code --install-extension Terrazzoni.hoverfly-lsp-vscode`. Details:
[editors/vscode/README.md](./editors/vscode/README.md).

### Zed

Dev extension now, registry soon. Zed compiles the extension to **`wasm32-wasip2`** itself via
**rustup**.

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add wasm32-wasip2
npm run build && npm link --workspace packages/server   # put hoverfly-lsp on $PATH (npm pkg unpublished)
# Zed: command palette → "zed: install dev extension" → select editors/zed
```

> **Homebrew Rust will not work and conflicts.** It has no `wasm32-wasip2` std component. Either
> `brew uninstall rust`, or make `~/.cargo/bin` win on `$PATH` so `which cargo` is rustup's.
> **GUI launch gotcha:** a Zed started from Finder/Dock won't have `~/.cargo/bin` on `$PATH` —
> launch it from a terminal (`zed .`), or add `~/.cargo/bin` to the GUI environment.

Details: [editors/zed/README.md](./editors/zed/README.md).

### IntelliJ / JetBrains

Via [LSP4IJ](https://github.com/redhat-developer/lsp4ij) (all editions, including free Community).
Install LSP4IJ from the Marketplace, then **Settings → Tools → Language Servers → + → Import from
template** and select [`editors/intellij/template.json`](./editors/intellij/template.json). The
server appears as **Hoverfly**. Details: [editors/intellij/README.md](./editors/intellij/README.md).

### Claude Code

A plugin that pushes the server's diagnostics into Claude's context right after it edits a
simulation, so it sees and fixes Hoverfly errors in the same turn.

```bash
npm run build
claude plugin marketplace add /ABS/PATH/TO/hoverfly-lsp/editors/claude-code
claude plugin install hoverfly-lsp --scope user
export HOVERFLY_LSP_PATH=/ABS/PATH/TO/hoverfly-lsp/packages/server/dist/cli.cjs   # until npm-published
```

Details: [editors/claude-code/README.md](./editors/claude-code/README.md).

### Any other editor

Point any LSP client at `hoverfly-lsp --stdio`. Neovim with `nvim-lspconfig`:

```lua
require("lspconfig.configs").hoverfly = {
  default_config = {
    cmd = { "hoverfly-lsp", "--stdio" },
    filetypes = { "json", "jsonc" },
    root_dir = require("lspconfig.util").find_git_ancestor,
  },
}
require("lspconfig").hoverfly.setup({})
```

The server also advertises an LSP **semantic tokens** provider, so Hoverfly template syntax inside
templated body/header strings (helper names, `{{ }}` delimiters, faker types, matcher-name enums) is
colored. Neovim's built-in `vim.lsp.semantic_tokens` is **on by default on 0.9+** — no extra setup
is needed beyond the client advertising the capability, which `vim.lsp.protocol.make_client_capabilities()`
(used by `nvim-lspconfig`) does automatically. Map the standard token types to highlight groups via
your colorscheme if you want to tune their appearance (e.g. `@lsp.type.function`, `@lsp.type.operator`,
`@lsp.type.enumMember`). To disable: `vim.lsp.semantic_tokens.stop(bufnr, client_id)` or clear the
`semanticTokensProvider` server capability in your `on_attach`.

### Use with AI coding agents

`hoverfly-lsp` is a standard stdio LSP — **point your agent at `hoverfly-lsp --stdio` for `.json`
files** and it gets Hoverfly diagnostics in-context after every edit. The broad `.json` extension
is safe: the server content-fingerprints each file and stays silent on non-Hoverfly JSON (see
[File conventions](#file-conventions)). The recipes below show the future npm-installed path
(the `@jterrazz/hoverfly-lsp` package puts the `hoverfly-lsp` bin on `$PATH`); **until the npm
package ships**, build the server and link it locally first —
`npm run build && npm link --workspace packages/server` — or substitute the absolute path to
`packages/server/dist/cli.cjs`.

**Claude Code** — shipped plugin (diagnostics pushed into context right after Claude edits a
simulation). See [the Claude Code section above](#claude-code).

**GitHub Copilot CLI** — `~/.copilot/lsp-config.json` (user) or `.github/lsp.json` (repo):

```json
{
  "lspServers": {
    "hoverfly": {
      "command": "hoverfly-lsp",
      "args": ["--stdio"],
      "fileExtensions": { ".json": "json" }
    }
  }
}
```

**OpenCode** — `opencode.json`:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "lsp": {
    "hoverfly": {
      "command": ["hoverfly-lsp", "--stdio"],
      "extensions": [".json"]
    }
  }
}
```

**Codex CLI** — via the [`code-yeongyu/codex-lsp`](https://github.com/code-yeongyu/codex-lsp)
plugin (Codex has no native LSP yet); `.codex/lsp-client.json` (project) or
`~/.codex/lsp-client.json`:

```json
{
  "lsp": {
    "hoverfly": {
      "command": ["hoverfly-lsp", "--stdio"],
      "extensions": [".json"]
    }
  }
}
```

**Qwen Code** — native [LSP config](https://qwenlm.github.io/qwen-code-docs/en/users/features/lsp/),
same shape: a `hoverfly` server with `command` `["hoverfly-lsp", "--stdio"]` over `.json`.

**Any MCP-capable agent (e.g. Gemini CLI)** — agents that speak MCP but not LSP reach the server
through a generic LSP→MCP bridge such as
[`isaacphi/mcp-language-server`](https://github.com/isaacphi/mcp-language-server). Register an MCP
server whose command launches the bridge against the workspace with the LSP set to
`hoverfly-lsp --stdio` (flags vary per bridge); it exposes `diagnostics`/`definition`/`references`
to the agent. No Hoverfly-specific artifact needed.

> **Cursor / Windsurf / VSCodium** run standard VS Code extensions — install the
> [VS Code extension](#vs-code) from **[Open VSX](https://open-vsx.org/)** (the fork default) for
> one-click setup; their agent modes then read Hoverfly diagnostics from the running extension.

### Zero-install: JSON Schema fallback

A JSON Schema gives basic validation and completion in **any** editor that consumes the
[SchemaStore](https://www.schemastore.org/) catalog — no install — and a `"$schema"` line in a
simulation auto-applies it. The schema is **not submitted yet** (planned
`fileMatch: ["*.hoverfly.json", "hoverfly-simulation.json"]`). Until then, in VS Code you can wire
the bundled schema by hand via `json.schemas` in your settings.

---

## File conventions

Name simulations **`*.hoverfly.json`** (canonical), **`*.hfy`** (compact), or
**`hoverfly-simulation.json`**. Explicitly named files always get full treatment, including a
"this doesn't look like a simulation" diagnostic when the shape is wrong. `*.hoverfly.json` keeps
the `.json` suffix so generic JSON tooling still applies; `*.hfy` is the shortest option and is the
cleanest fit for editors that key off a single file extension (e.g. Claude Code).

For any other `.json`, the server **content-fingerprints** it — a root `data` object plus a
`meta.schemaVersion` starting with `v`. Files that aren't simulations get **zero** diagnostics, so
pointing the server at all JSON (e.g. via Claude Code's `.json` mapping) is always safe.

## Settings

| Setting                      | Type       | What it does                                                                                                                                                       |
| ---------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hoverfly.registeredActions` | `string[]` | Names of `postServeAction`s registered with your Hoverfly — used to complete and validate `response.postServeAction`, which can't be verified from the file alone. |

It flows per editor: VS Code reads it from settings (`workspace/configuration` + init options);
IntelliJ and Claude Code accept it as `initializationOptions` (`{ "registeredActions": [...] }`).

## Diagnostics

Every diagnostic carries a stable `HFxxx` code, `source: "hoverfly"`, and a link back to the
catalog. **Codes are a stable API**: once frozen, a code's meaning never changes (new codes may be
added; deprecated ones are never reused). Severity policy: **error** = Hoverfly would reject the
import or the pair could silently never match (or panic); **warning** = legal but almost certainly
a mistake; **information**/**hint** = style and upgrade nudges.

There are **50+ codes across 6 families** (`HF1xx` structure · `HF2xx` matchers · `HF3xx` response ·
`HF4xx` state · `HF5xx` templating · `HF6xx` global actions). Full reference:
**[docs/diagnostics.md](./docs/diagnostics.md)**.

---

## Architecture

A single TypeScript stdio server wraps a pure analysis library, built on
[`vscode-json-languageservice`](https://github.com/microsoft/vscode-json-languageservice)
(error-recovering JSON parser, schema-driven diagnostics/completion/hover) with Hoverfly-specific
semantic validators and a Handlebars-subset template engine layered on top. Dependency direction
is strictly `editors → server → core`.

```
packages/core      @hoverfly-lsp/core      pure analysis library (private; bundled into the server)
packages/server    @jterrazz/hoverfly-lsp  stdio LSP server (the published package; bin: hoverfly-lsp)
editors/           vscode · zed · intellij · claude-code   thin per-editor launchers
docs/              diagnostics + template reference (generated from core)
testdata/          the reference corpus (valid/ + invalid/ goldens)
research/          binding research + the architect decision log
schemas/           bundled Hoverfly schema + upstream provenance
```

The matcher, helper, and faker registries are **generated from a pinned Hoverfly source**
(`master` commit `aeff9058`, see `packages/core/src/schema/provenance.ts`), and a **weekly drift
CI** job (`.github/workflows/schema-drift.yml`) diffs the bundled schema against that upstream and
flags when Hoverfly moves.

Testing is a pyramid on top of a **162-fixture golden corpus**
([testdata/](./testdata/README.md)): every `invalid/` fixture must emit exactly its frozen
`HFxxx` diagnostic, every `valid/` fixture must emit none — and every valid fixture was
**imported into a real Hoverfly v1.12.8** to confirm the corpus is ground truth, not just
self-consistent (see [research/12-ground-truth-results.md](./research/12-ground-truth-results.md)).
The full decision log lives in
[research/10-architect-decisions.md](./research/10-architect-decisions.md).

---

## Developing

Prerequisites: **Node ≥ 20** (see `.nvmrc`), npm. This is an npm-workspaces monorepo.

```bash
npm install
npm run build          # tsc build across workspaces (core, server, editors/vscode)
npm test               # vitest
npm run typecheck      # tsc --build
npm run lint           # @jterrazz/codestyle: oxlint + oxfmt + tsgo + knip
npm run lint:fix       # autofix lint/format
npm run docs:diagnostics  # regenerate docs/ from the built core
```

**Corpus & goldens.** Fixtures live in `testdata/{valid,invalid}/<domain>/`; each `invalid/`
fixture pairs with a frozen `*.diagnostics.golden`. Regenerate goldens after an intentional
change:

```bash
env UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts
```

**Adding a diagnostic rule:** (1) add the code + message + severity to
`packages/core/src/semantic/catalog.ts`; (2) emit it from the relevant validator under
`packages/core/src/semantic/`; (3) add a focused `invalid/` fixture (one code per fixture) and
regenerate its golden; (4) run `npm run docs:diagnostics`; (5) `npm test && npm run lint`.

See [CONTRIBUTING.md](./CONTRIBUTING.md) and [testdata/README.md](./testdata/README.md).

## Releasing

A tag-driven pipeline (`.github/workflows/release.yml`) builds and publishes the npm package and
editor artifacts on a version tag. Before tagging, walk the in-editor checks that can't run
headlessly: **[MANUAL-QA.md](./MANUAL-QA.md)**.

## Troubleshooting

- **Zed: "wasm target not found" / build fails.** You're on Homebrew Rust — it has no
  `wasm32-wasip2` std. `brew uninstall rust` or make `~/.cargo/bin` win on `$PATH`
  (`which cargo` should be `~/.cargo/bin/cargo`), then `rustup target add wasm32-wasip2`. If the
  build only fails when Zed is launched from Finder/Dock, it's the GUI `$PATH` missing
  `~/.cargo/bin` — launch Zed from a terminal (`zed .`).
- **No diagnostics on my file.** The file must be recognized as a simulation: name it
  `*.hoverfly.json` / `hoverfly-simulation.json`, or ensure its root has `data` and a
  `meta.schemaVersion` starting with `v` (the content fingerprint). A non-simulation `.json` is
  intentionally silent.
- **"Server not found" / "command not found".** `hoverfly-lsp` isn't on npm yet, so put it on
  `$PATH` first: `npm run build && npm link --workspace packages/server`, then `hoverfly-lsp
--version`. For VS Code use the bundled `.vsix`; for Claude Code set `HOVERFLY_LSP_PATH`. If
  your editor was launched from a GUI but Node lives under a shell-managed version manager
  (nvm/fnm/mise), launch the editor from a shell or set an absolute server path.

## License

MIT — all dependencies are MIT/Apache (verified, no copyleft).
