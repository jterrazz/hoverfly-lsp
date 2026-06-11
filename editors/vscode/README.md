# Hoverfly — VS Code extension

Language support for [Hoverfly](https://docs.hoverfly.io/) JSON simulation files: diagnostics,
completion, and hover docs, powered by the `hoverfly-lsp` language server.

The extension registers a dedicated `hoverfly-simulation` language id and activates only on
Hoverfly files — `*.hoverfly.json` and `hoverfly-simulation.json` — so your other `.json` files
are untouched. (The server also content-fingerprints every document it sees and returns empty
results for non-simulations, so activation is safe even when the fallback selector is hit.)

## Features

- **Diagnostics** — schema and semantic checks (unknown matchers, dangling state, templating
  errors, …) surfaced as squiggles, both pushed live and available via pull.
- **Completion** — matcher names, template helpers, faker types, and `postServeAction` names.
- **Hover** — registry docs for matchers and helpers.
- Syntax highlighting reuses VS Code's built-in JSON grammar (`source.json`).

## Install

### From a packaged `.vsix` (current — not yet on the Marketplace)

The extension is not published to the Marketplace / Open VSX yet. Build a `.vsix` and install it:

```bash
# From the repo root, install workspace deps and build the server bundle the extension ships.
npm install
npm run build --workspace=hoverfly-lsp            # builds packages/server -> dist/cli.cjs
npm run build --workspace=hoverfly-lsp-vscode     # bundles the extension + copies the server in
npm run package --workspace=hoverfly-lsp-vscode   # -> editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
```

Then in VS Code: **Extensions** view → `…` menu → **Install from VSIX…**, or:

```bash
code --install-extension editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
```

### Dev (run from source, no packaging)

1. `npm install` at the repo root.
2. `npm run build --workspace=hoverfly-lsp` (server) then
   `npm run build --workspace=hoverfly-lsp-vscode` (extension).
3. Open `editors/vscode` in VS Code and press **F5** to launch an Extension Development Host, or
   point `code --extensionDevelopmentPath=editors/vscode` at a test workspace.
4. For an incremental loop, run `npm run watch --workspace=hoverfly-lsp-vscode`.

### From the Marketplace (future — once published)

Once published, install via the Extensions view (search "Hoverfly") or:

```bash
code --install-extension jterrazz.hoverfly-lsp-vscode
```

## Server resolution

The extension launches `hoverfly-lsp` over stdio. It picks the server in this order:

1. **`hoverfly.server.path`** setting — an explicit absolute path to a server entry (run with
   Node). Highest priority.
2. **Workspace install** — `<workspaceRoot>/node_modules/.bin/hoverfly-lsp`, if present (lets a
   project pin its own server version).
3. **Bundled server** — the copy shipped inside the extension (`server/bin/hoverfly-lsp.js`). This
   is the zero-install default and always works.

## Settings

| Setting                      | Type       | Description                                                                                         |
| ---------------------------- | ---------- | --------------------------------------------------------------------------------------------------- |
| `hoverfly.registeredActions` | `string[]` | Post-serve action names registered with your Hoverfly; used to complete/validate `postServeAction`. |
| `hoverfly.server.path`       | `string`   | Absolute path to a `hoverfly-lsp` entry to launch (overrides workspace + bundled). Empty = auto.    |
| `hoverfly.trace.server`      | `enum`     | `off` \| `messages` \| `verbose` — trace the LSP traffic in the "Hoverfly LSP" output channel.      |

`hoverfly.registeredActions` is delivered to the server via `workspace/configuration` (section
`hoverfly`) and as `initializationOptions` for clients that read config at startup.

## Verification

All commands run from the repo root.

```bash
# 1. Install + build the server, then the extension (bundles + copies the server).
npm install
npm run build --workspace=hoverfly-lsp
npm run build --workspace=hoverfly-lsp-vscode

# Expect: editors/vscode/dist/extension.cjs and editors/vscode/server/{bin,dist}/ exist.
ls editors/vscode/dist/extension.cjs editors/vscode/server/bin/hoverfly-lsp.js editors/vscode/server/dist/cli.cjs

# 2. Unit-test the server-resolution logic.
npx vitest --run editors/vscode/test

# 3. Produce a .vsix (no Marketplace account needed).
npm run package --workspace=hoverfly-lsp-vscode
ls editors/vscode/*.vsix
```

### Semantic highlighting

The server advertises an LSP **semantic tokens** provider, so VS Code colors the Hoverfly-specific
constructs a plain JSON grammar cannot see — chiefly the Handlebars template syntax inside templated
response body/header strings (`{{ faker 'Name' }}`, `{{ Request.Path.[1] }}`, `{{#each …}}`) and
matcher-name enums (`exact`, `regex`, `jwt`, …).

This works **out of the box** with no settings to flip:

- VS Code enables semantic highlighting by default (`editor.semanticHighlighting.enabled` defaults
  to `"configuredByTheme"`, and every built-in theme opts in). You only need to touch it if you
  previously set it to `false`.
- The legend uses only **standard** LSP token types (`function`, `keyword`, `variable`, `property`,
  `enumMember`, `string`, `number`, `operator`, …), which every shipped theme already colors — so
  no custom `editor.tokenColorCustomizations` / `editor.semanticTokenColorCustomizations` are
  required. (You may still add them to taste.)

To confirm tokens are flowing, open a templated `*.hoverfly.json`, run **Developer: Inspect Editor
Tokens and Scopes** from the command palette, and click inside a `{{ … }}` — the "semantic token
type" line should read `function` on a helper name, `operator` on the `{{`, etc.

### Manual QA checklist

The end-to-end editor behavior cannot be exercised headlessly; verify it by hand in a real
VS Code window:

1. Install the `.vsix` (or launch the Extension Development Host with **F5**).
2. Open one of the repo fixtures (all paths relative to repo root):
   - `testdata/valid/minimal.hoverfly.json` — should show **no** diagnostics.
   - `testdata/valid/rich-stateful-templated.hoverfly.json` — should show no errors; hover over a
     matcher name (e.g. `"glob"`) to see registry docs.
   - `testdata/invalid/hf4xx/dangling-states.hoverfly.json` — should show **squiggles** for
     `HF401`/`HF402`/`HF403` dangling-state diagnostics.
3. In a `*.hoverfly.json` file, type a matcher value `{ "matcher": "" }` and trigger completion
   inside the quotes — expect matcher names (`exact`, `regex`, `jsonpath`, …).
4. In a templated body (`"templated": true`, `"body": "{{ faker 'Name' }}"`), confirm the template
   syntax is colored: the helper name (`faker`) reads as a function, the `{{`/`}}` as operators,
   and a known faker type (`'Name'`) as an enum member (use **Developer: Inspect Editor Tokens and
   Scopes** to see the semantic token type). A plain `.json` shows no such coloring.
5. Confirm the bottom-right language indicator reads **Hoverfly**.
6. Open an unrelated `.json` (e.g. `package.json`) — expect **no** Hoverfly diagnostics and the
   normal JSON language mode.
7. Optional: set `"hoverfly.trace.server": "verbose"` and check the **Hoverfly LSP** output
   channel for the LSP handshake.

To verify the `hoverfly.server.path` override or the workspace-`node_modules` path, point the
setting at a built `packages/server/bin/hoverfly-lsp.js` (or `npm install hoverfly-lsp` once it is
published) and confirm the server still starts.
