# hoverfly-lsp

A Language Server for [Hoverfly](https://hoverfly.io) JSON simulation files. It brings
`tsc`-grade tooling — real-time diagnostics, semantic validation, completion and hover —
to Hoverfly v5 simulations in VS Code, Zed, IntelliJ and Claude Code agents.

> **Status: pre-release.** The core analyzer and the stdio LSP server are implemented, with
> editor integrations for VS Code, Zed, IntelliJ (LSP4IJ) and Claude Code. The `hoverfly-lsp`
> npm package is not published yet, so each integration ships a dev/local install path
> alongside the future npm-installed path. See [MANUAL-QA.md](./MANUAL-QA.md) for the
> in-editor verification that cannot run headlessly.

See [PLAN.md](./PLAN.md) for the master plan and [research/](./research) for the
binding research and architect decisions.

## Layout

```
packages/core     @hoverfly-lsp/core   — pure analysis library (zero LSP transport deps)
packages/server   hoverfly-lsp         — stdio LSP server (the published bin)
editors/          vscode / zed / intellij / claude-code editor integrations
testdata/         the reference corpus (valid/ + invalid/)
research/         research reports + architect decisions
```

## Editor setup

The server is editor-agnostic (stdio LSP, bin `hoverfly-lsp --stdio`). Each editor has its own
integration under `editors/`, with a README covering both the dev/local path (today) and the
future npm-published path. All of them target the canonical filenames `*.hoverfly.json` and
`hoverfly-simulation.json`; the server also content-fingerprints any JSON and returns empty
results for non-simulations, so broad activation stays safe.

| Editor               | Integration                         | Setup guide                                                      |
| -------------------- | ----------------------------------- | ---------------------------------------------------------------- |
| VS Code              | Bundled extension (`.vsix`)         | [editors/vscode/README.md](./editors/vscode/README.md)           |
| Zed                  | Rust/WASM extension                 | [editors/zed/README.md](./editors/zed/README.md)                 |
| IntelliJ / JetBrains | LSP4IJ user-defined server template | [editors/intellij/README.md](./editors/intellij/README.md)       |
| Claude Code          | Plugin with `.lsp.json` LSP server  | [editors/claude-code/README.md](./editors/claude-code/README.md) |

**Zero-install (any editor, upcoming):** a JSON Schema published to
[SchemaStore](https://www.schemastore.org/) gives basic validation and completion in every
editor that consumes the SchemaStore catalog (VS Code, IntelliJ, Neovim, …) without installing
anything — and `"$schema"` self-declaration in a simulation file auto-applies it. The schema has
**not been submitted to SchemaStore yet** (planned: `fileMatch: ["*.hoverfly.json",
"hoverfly-simulation.json"]`, per architect decision D7 §6); until then, use a per-editor
integration above.

Manual-QA steps that cannot be exercised headlessly are collected in [MANUAL-QA.md](./MANUAL-QA.md).

## Development

```bash
npm install
npm run build       # tsc build across workspaces
npm test            # vitest
npm run typecheck   # tsc --build
npm run lint        # @jterrazz/codestyle (oxlint + oxfmt + tsgo + knip)
```

## License

MIT
