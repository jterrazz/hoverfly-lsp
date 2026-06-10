# hoverfly-lsp

A Language Server for [Hoverfly](https://hoverfly.io) JSON simulation files. It brings
`tsc`-grade tooling — real-time diagnostics, semantic validation, completion and hover —
to Hoverfly v5 simulations in VS Code, Zed, IntelliJ and Claude Code agents.

> **Status: under construction.** This repository currently contains the monorepo
> scaffold (core + server skeletons, test corpus, CI). No feature code yet.

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
