# hoverfly-lsp — Claude Code plugin

**Status: under construction (Phase 8).**

A Claude Code plugin exposing the LSP component. Per the verified shape (decision D8):
`.lsp.json` at plugin root with `command` + `extensionToLanguage` (mapping `".json"`),
optional `args`/`transport`/`diagnostics`. The content fingerprint (D3) is the activation
filter so the server is safe to point at any `.json` file. Pre-ship: verify coexistence
with another `.json`-mapped LSP plugin.

See [PLAN.md](../../PLAN.md) and `research/09-claude-code-lsp.md`.
