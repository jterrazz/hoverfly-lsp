# hoverfly-lsp Claude Code plugin

Gives Claude Code real-time diagnostics and code intelligence for Hoverfly JSON simulation
files (`*.hoverfly.json`, `hoverfly-simulation.json`, and any content-detected simulation).
After Claude edits a simulation, Claude Code pushes the language server's diagnostics straight
into its context, so it sees (and can fix) Hoverfly errors in the same turn.

## What's in here

```
editors/claude-code/
├── .claude-plugin/
│   └── plugin.json     Plugin manifest (name, version, author, lspServers pointer)
├── .lsp.json           LSP server config consumed by Claude Code
├── bin/
│   └── launch.cjs      Launcher that locates and runs the hoverfly-lsp server bundle
└── README.md
```

`.lsp.json` registers one server (`hoverfly`) on the `.json` extension and runs
`node ${CLAUDE_PLUGIN_ROOT}/bin/launch.cjs --stdio`. `${CLAUDE_PLUGIN_ROOT}` is substituted by
Claude Code to the plugin's install directory and is also exported to the LSP subprocess.

The launcher (`launch.cjs`) resolves the server bundle in this order:

1. **`$HOVERFLY_LSP_PATH`**: explicit override. Either the bundle (`dist/cli.cjs`) directly or
   a directory containing it. Use this for dev or to pin a specific build.
2. **`node_modules`**: an installed `hoverfly-lsp` package, resolved from both the project cwd
   and the plugin directory. This is the future npm-installed path.
3. **Repo-relative dev bundle**: `../../../packages/server/dist/cli.cjs`, for running straight
   from a hoverfly-lsp checkout.

`launch.cjs` is `.cjs` on purpose: it must be CommonJS whether it runs from the ESM-typed repo
(`"type": "module"`) or from Claude Code's plugin cache (no enclosing `package.json`).

> **Note on distribution.** A marketplace install **copies** the plugin into Claude Code's
> cache, so resolution path 3 (repo-relative) only applies when the plugin runs in place from
> the repo. The published plugin must make path 1 or 2 succeed: either bundle the server
> alongside `bin/` or declare an npm dependency on `hoverfly-lsp` so `node_modules` resolution
> works in the cache. Until `hoverfly-lsp` is on npm, install with `HOVERFLY_LSP_PATH` set (see
> below).

## Why it's safe to map all of `.json`

Claude Code's `.lsp.json` only supports single-extension keys; there is no `.hoverfly.json`
or glob key, so the server is mapped to `.json`. That is intentional: the server
**content-fingerprints** every file it's handed and returns **empty results** for any JSON that
isn't a Hoverfly simulation (a root object with `data` and a `meta.schemaVersion` starting with
`"v"`). So `package.json`, `tsconfig.json`, and friends get **zero** diagnostics; only real
simulations light up. This was verified end-to-end (see QA below).

## Install: local / dev (today)

Until `hoverfly-lsp` is published to npm, install from a local marketplace and point the
launcher at your built server bundle.

```bash
# 1. Build the server bundle once (from the repo root)
npm run build

# 2. Register this directory as a local marketplace and install the plugin
claude plugin marketplace add /ABS/PATH/TO/hoverfly-lsp/editors/claude-code
claude plugin install hoverfly-lsp --scope user

# 3. Tell the launcher where the server bundle is, then start Claude Code
export HOVERFLY_LSP_PATH=/ABS/PATH/TO/hoverfly-lsp/packages/server/dist/cli.cjs
claude
```

`claude plugin marketplace add` accepts a directory that contains a `.claude-plugin/` with a
manifest; this plugin directory qualifies. The first time you open a project, Claude Code starts
LSP servers only after you trust the workspace.

If you have a global server install (`npm i -g @jterrazz/hoverfly-lsp`, once published), step 3 is
unnecessary; the launcher finds it via `node_modules`.

## Install: published marketplace (future)

Once the plugin is on a marketplace and `@jterrazz/hoverfly-lsp` is on npm:

```bash
npm install -g @jterrazz/hoverfly-lsp   # or add as a project dependency
claude plugin marketplace add jterrazz/hoverfly-lsp
claude plugin install hoverfly-lsp
```

No `HOVERFLY_LSP_PATH` needed: the launcher resolves the npm-installed server.

## Verification

All commands below were run on this machine (macOS, Claude Code 2.1.173) and pass.

### 1. Manifest validates

```bash
claude plugin validate ./editors/claude-code --strict
# → "Validation passed"
```

### 2. Server-side contract over the launcher (no Claude needed)

Drive the launcher exactly as Claude Code does (`node bin/launch.cjs --stdio`) with an LSP
`didOpen` for a broken simulation and for a non-simulation `.json`. Expect diagnostics on the
first, none on the second:

```bash
SCRATCH=$(mktemp -d)
cp testdata/invalid/hf2xx/hf201-unknown-matcher.hoverfly.json "$SCRATCH/broken.hoverfly.json"
printf '{ "name": "x", "version": "1.0.0" }' > "$SCRATCH/notes.json"
# (use a minimal LSP stdio client; see the QA checklist for the exact assertions)
```

Observed result:

```
broken.hoverfly.json → 1 diagnostic: HF201 (severity Error)
  "Unknown matcher \"xform\": Hoverfly panics at match time on unknown matchers"
notes.json           → published, 0 diagnostics (fingerprint declined)
launcher exit 0
```

This path was also confirmed with `HOVERFLY_LSP_PATH` set to both the bundle file and the
server package directory.

### 3. Real end-to-end inside Claude Code (headless)

With the plugin installed (per dev install above) and `HOVERFLY_LSP_PATH` exported:

```bash
cd "$SCRATCH"
claude -p "Edit broken.hoverfly.json: change the response status from 200 to 201 and save. \
After the edit, report any LSP diagnostics Claude Code surfaced, with code and message verbatim." \
  --permission-mode acceptEdits --allowedTools "Read,Edit"
```

Observed: Claude Code surfaced **HF201** with the verbatim message on the `xform` matcher after
the edit. The same prompt against `notes.json` surfaced **NONE**; fingerprint confirmed quiet.

## QA checklist

- [x] `claude plugin validate ./editors/claude-code --strict` passes.
- [x] `claude plugin install` reports the plugin enabled; `claude plugin details` lists
      `LSP servers (1) hoverfly`.
- [x] Launcher (`node bin/launch.cjs --stdio`) starts the server and reports diagnostics on a
      broken `*.hoverfly.json` (HF201, Error).
- [x] Launcher reports **0** diagnostics on a non-simulation `.json` (fingerprint declines).
- [x] `HOVERFLY_LSP_PATH` override works as both a file path and a directory path.
- [x] Headless `claude -p` surfaces the HF diagnostic after an edit to a simulation, and stays
      silent after an edit to a normal `.json`.
- [ ] **Manual QA: coexistence with another `.json`-mapped LSP plugin.** This environment had
      `swift-lsp` installed (different extensions), so a true `.json`/`.json` collision was not
      exercised. Before shipping, install a second plugin that also maps `.json` and confirm both
      servers run (or document the limitation). See research/09 §9 and §13 (Compatibility Tests).
- [ ] **Manual QA: published path.** The `node_modules` resolution (launcher path 2) and the
      marketplace-cache copy were reasoned about and the dev fallback's cache limitation
      documented, but the fully-published flow (npm-installed `hoverfly-lsp` + remote
      marketplace, no `HOVERFLY_LSP_PATH`) cannot be exercised until `hoverfly-lsp` is on npm.
