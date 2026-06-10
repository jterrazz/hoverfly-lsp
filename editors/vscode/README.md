# hoverfly-lsp — VS Code extension

**Status: under construction (Phase 8).**

This will become the VS Code extension (`.vsix`) for Hoverfly simulation files:

- Language id `hoverfly-simulation`, file pattern `*.hoverfly.json`.
- A `vscode-languageclient` client that spawns the bundled `hoverfly-lsp` server over stdio.
- Bundles the server output so the extension is self-contained (no runtime `npm install`).
- Published to the VS Code Marketplace and Open VSX.

See [PLAN.md](../../PLAN.md) and decision D7 in `research/10-architect-decisions.md`.
