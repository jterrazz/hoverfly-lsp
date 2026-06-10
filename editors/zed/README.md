# hoverfly-lsp — Zed extension

**Status: under construction (Phase 8).**

A Zed extension (Rust/WASM `extension.toml`) that registers the `hoverfly-lsp` language
server and resolves the binary from npm. `path_suffixes = ["hoverfly.json",
"hoverfly-simulation.json"]`. All intelligence stays in the npm server (decision D7).

See [PLAN.md](../../PLAN.md).
