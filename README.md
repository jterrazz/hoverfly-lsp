# Hoverfly LSP

[![CI](https://github.com/jterrazz/hoverfly-lsp/actions/workflows/validate.yml/badge.svg)](https://github.com/jterrazz/hoverfly-lsp/actions/workflows/validate.yml)
[![npm](https://img.shields.io/npm/v/@jterrazz/hoverfly-lsp?label=npm)](https://www.npmjs.com/package/@jterrazz/hoverfly-lsp)
[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/Terrazzoni.hoverfly-lsp-vscode?label=VS%20Code)](https://marketplace.visualstudio.com/items?itemName=Terrazzoni.hoverfly-lsp-vscode)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](#license)

A language server for [Hoverfly](https://hoverfly.io) simulation files: errors as you type,
autocomplete everywhere, and docs on hover, in any editor. It is the first and only IDE tooling
for Hoverfly.

Hoverfly fails silently. Its import schema is permissive, so the mistakes that actually break a
mock (a mis-cased matcher, a wrong value type, a template variable that never resolves, a dead
state transition) pass import without error and just produce pairs that never match. An unknown
matcher is worse: it panics the running instance at match time. Hoverfly LSP catches all of this
at edit time, so you stop the edit-import-`curl`-502-guess loop.

> New to language servers? It is the technology behind TypeScript's red squiggles and editor
> autocomplete. One server implements the smarts once, and the Language Server Protocol lets every
> editor reuse it. This is that, for Hoverfly simulation JSON.

## Features

- **Diagnostics for the mistakes Hoverfly never reports.** Typo'd keys, mis-cased or unknown
  matchers, wrong value types, malformed templates, unresolved variables, dead state transitions:
  flagged as you type, with severities graded the way Hoverfly actually treats each case.
- **Autocomplete for everything.** Every field, all 14 matchers, 60 template helpers (with argument
  snippets), 210 faker types, and your own state keys, variables, and literals.
- **Hover docs** on every field, matcher, and helper, so you stop tab-switching to docs.hoverfly.io.
- **Template-aware highlighting** that colors the `{{ ... }}` syntax living inside body strings.
- **Works everywhere.** VS Code, Zed, IntelliJ and the JetBrains family, Neovim, Claude Code and
  other AI agents: any client that speaks LSP, all from one server.
- **Trustworthy by design.** Every check is verified against a real Hoverfly instance, not just the
  docs, under a zero-false-positive policy: if it underlines something, Hoverfly treats it as wrong.

## In action

An unknown matcher imports fine but panics Hoverfly at match time. The server flags it as an error
before you ever run a request:

```jsonc
{
  "request": {
    // HF201 (error): Unknown matcher "contains"; Hoverfly panics at match time on unknown matchers
    "path": [{ "matcher": "contains", "value": "/api/v1/orders" }],
  },
  "response": { "status": 200 },
}
```

Chained matchers use `doMatch`, which Hoverfly's v5 schema requires to be a single object, not an
array (real Hoverfly rejects the array form with HTTP 400):

```jsonc
{
  "matcher": "jsonpath",
  "value": "$.id",
  // HF102 (error): Incorrect type. Expected "object".
  "doMatch": [{ "matcher": "exact", "value": "42" }],
}
```

Inside a `"templated": true` body, `{{ Vars.x }}` and `{{ Literals.x }}` are resolved against the
file's own definitions, and faker types are checked against the pinned gofakeit registry:

```jsonc
// HF505 (error): Variable "missing" is not defined in data.variables
"body": "{\"token\":\"{{ Vars.missing }}\"}"
```

## Install

The server is editor-agnostic: a stdio LSP launched as `hoverfly-lsp --stdio`, published on npm as
[`@jterrazz/hoverfly-lsp`](https://www.npmjs.com/package/@jterrazz/hoverfly-lsp). Most editors below
install or bundle it for you.

### VS Code

Install **Hoverfly** from the
[Marketplace](https://marketplace.visualstudio.com/items?itemName=Terrazzoni.hoverfly-lsp-vscode)
(search "Hoverfly" in the Extensions view) or run:

```bash
code --install-extension Terrazzoni.hoverfly-lsp-vscode
```

The extension bundles the server, so there is nothing else to set up. Open any `*.hoverfly.json` or
`*.hfy` file and diagnostics, completion, and hover work immediately.
Details: [editors/vscode/README.md](./editors/vscode/README.md).

### Zed

The [registry submission](https://github.com/zed-industries/extensions/pull/6477) is open; once it
merges, install **Hoverfly** from Zed's Extensions panel. To run it now as a dev extension (Zed
compiles it to `wasm32-wasip2` itself via rustup, and auto-installs the server from npm):

```bash
rustup target add wasm32-wasip2
# Zed: command palette -> "zed: install dev extension" -> select editors/zed
```

Zed needs the rustup toolchain (a Homebrew-only Rust has no `wasm32-wasip2` target), and a
GUI-launched Zed may not see `~/.cargo/bin` on `$PATH`. Both caveats and the fixes are in
[editors/zed/README.md](./editors/zed/README.md).

### IntelliJ and the JetBrains family

The **Hoverfly** plugin is on the
[JetBrains Marketplace](https://plugins.jetbrains.com/plugin/32283-hoverfly) (in review at first
publish; install it from the IDE's plugin browser once approved). It works across IntelliJ IDEA,
PyCharm, WebStorm, GoLand, and the rest, and pulls in
[LSP4IJ](https://github.com/redhat-developer/lsp4ij) automatically.
Details: [editors/intellij/README.md](./editors/intellij/README.md).

### Claude Code

A plugin that pushes the server's diagnostics into Claude's context right after it edits a
simulation, so it sees and fixes Hoverfly errors in the same turn:

```bash
npm install -g @jterrazz/hoverfly-lsp
claude plugin marketplace add /ABS/PATH/TO/hoverfly-lsp/editors/claude-code
claude plugin install hoverfly-lsp --scope user
```

Details: [editors/claude-code/README.md](./editors/claude-code/README.md).

### Neovim and any other LSP editor

```bash
npm install -g @jterrazz/hoverfly-lsp
```

Then point any LSP client at `hoverfly-lsp --stdio`. With `nvim-lspconfig`:

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

Semantic-token highlighting is on by default in Neovim 0.9+ once the client advertises the
capability (`nvim-lspconfig` does).

### AI coding agents

`hoverfly-lsp` is a standard stdio LSP, so point any agent at `hoverfly-lsp --stdio` for `.json`
files and it gets Hoverfly diagnostics in-context after every edit. Pointing it at all `.json` is
safe: the server fingerprints each file and stays silent on non-Hoverfly JSON. After
`npm install -g @jterrazz/hoverfly-lsp`:

- **GitHub Copilot CLI**, `~/.copilot/lsp-config.json` or `.github/lsp.json`:

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

- **OpenCode** (`opencode.json`) and **Qwen Code** use the same shape: a `hoverfly` server with
  `command` `["hoverfly-lsp", "--stdio"]` over `.json`.
- **Codex CLI**: via the [`codex-lsp`](https://github.com/code-yeongyu/codex-lsp) plugin (Codex has
  no native LSP yet), same server entry.
- **Any MCP-only agent (e.g. Gemini CLI)**: reach the server through a generic LSP-to-MCP bridge
  such as [`mcp-language-server`](https://github.com/isaacphi/mcp-language-server), with its LSP set
  to `hoverfly-lsp --stdio`. No Hoverfly-specific artifact needed.

Cursor, Windsurf, and VSCodium run the VS Code extension; install it from
[Open VSX](https://open-vsx.org/) and their agent modes read the diagnostics from it.

### Zero-install JSON Schema

A JSON Schema gives basic validation and completion in any editor that consumes the
[SchemaStore](https://www.schemastore.org/) catalog. It is not submitted yet; until then, point
`$schema` (or VS Code's `json.schemas`) at [`schemas/hoverfly-simulation.json`](./schemas/README.md).

## Configuration

Name simulations **`*.hoverfly.json`** (canonical), **`*.hfy`** (compact), or
**`hoverfly-simulation.json`**. These always get full treatment, including a "this does not look
like a simulation" diagnostic when the shape is wrong. Any other `.json` is content-fingerprinted (a
root `data` object plus a `meta.schemaVersion` starting with `v`); non-simulations get zero
diagnostics, so pointing the server at all JSON is safe.

| Setting                      | Type       | What it does                                                                                                                                 |
| ---------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `hoverfly.registeredActions` | `string[]` | Post-serve actions registered with your Hoverfly, used to complete and validate `response.postServeAction` (unknowable from the file alone). |

VS Code reads it from settings; IntelliJ and Claude Code take it as `initializationOptions`.

## Diagnostics

Every diagnostic carries a stable `HFxxx` code, `source: "hoverfly"`, and a link to the catalog.
**Codes are a stable API**: a code's meaning never changes once frozen (new codes may be added;
deprecated ones are never reused). Severity follows what Hoverfly does: **error** = it would reject
the import, or the pair could silently never match or panic; **warning** = legal but almost
certainly a mistake; **information** and **hint** = style and upgrade nudges.

50+ codes span 6 families: `HF1xx` structure, `HF2xx` matchers, `HF3xx` response, `HF4xx` state,
`HF5xx` templating, `HF6xx` global actions. Full reference: **[docs/diagnostics.md](./docs/diagnostics.md)**;
template helpers and faker types: **[docs/template-reference.md](./docs/template-reference.md)**.

## Highlighting

An editor colors a Hoverfly file in two layers. The JSON structure (keys, strings, numbers) comes
from the built-in tree-sitter grammar and is always on. The Hoverfly-specific parts come from the
server's LSP semantic tokens: the `{{ ... }}` template internals (helpers, `Request`/`State`/`Vars`
paths, faker types) and matcher-name enums, which a static grammar cannot see inside a string. Both
use standard token types, so any theme colors them with no setup.

Semantic tokens are on by default in VS Code, Neovim, and IntelliJ. **Zed has them off by default**:
add `"semantic_tokens": "combined"` to your settings to light up the template coloring.

## How it works

A single TypeScript stdio server wraps a pure analysis library, built on
[`vscode-json-languageservice`](https://github.com/microsoft/vscode-json-languageservice) (the
error-recovering JSON engine VS Code itself uses) with Hoverfly-specific validators and a
Handlebars-subset template engine on top. Dependency direction is strictly `editors -> server -> core`.

```
packages/core      @hoverfly-lsp/core      pure analysis library (private; bundled into the server)
packages/server    @jterrazz/hoverfly-lsp  stdio LSP server (the published package; bin: hoverfly-lsp)
editors/           vscode, zed, intellij, claude-code   thin per-editor launchers
docs/              diagnostics + template reference (generated from core)
testdata/          the reference corpus (valid/ + invalid/ goldens)
research/          binding research + the architect decision log
schemas/           bundled Hoverfly schema + upstream provenance
```

The matcher, helper, and faker registries are generated from a pinned Hoverfly source (`master`
commit `aeff9058`), and a weekly drift-CI job flags when upstream Hoverfly moves. Testing sits on a
162-fixture golden corpus where every `valid/` fixture was imported into a real **Hoverfly v1.12.8**
to confirm the corpus is ground truth, not just self-consistent. The decision log is in
[research/10-architect-decisions.md](./research/10-architect-decisions.md).

## Contributing

Node >= 20, npm-workspaces monorepo.

```bash
npm install
npm run build          # tsc across workspaces
npm test               # vitest (869 tests)
npm run lint           # oxlint + oxfmt + tsgo + knip
```

To add a diagnostic: register the code in `packages/core/src/semantic/catalog.ts`, emit it from a
validator under `packages/core/src/semantic/`, add an `invalid/` fixture and regenerate its golden
(`env UPDATE_GOLDENS=1 npx vitest --run packages/core/test/semantic/golden.test.ts`), then
`npm run docs:diagnostics`. See [CONTRIBUTING.md](./CONTRIBUTING.md) and
[testdata/README.md](./testdata/README.md). In-editor release checks: [MANUAL-QA.md](./MANUAL-QA.md).

## License

MIT. All dependencies are MIT or Apache, with no copyleft.
