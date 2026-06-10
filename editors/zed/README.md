# hoverfly-lsp — Zed extension

Language support for [Hoverfly](https://docs.hoverfly.io) API simulation files in
[Zed](https://zed.dev). The extension registers a **Hoverfly Simulation** language
for `*.hoverfly.json` and `hoverfly-simulation.json`, reuses the JSON grammar for
syntax highlighting, and wires up the `hoverfly-lsp` language server (diagnostics,
completion, hover) over stdio.

All intelligence lives in the `hoverfly-lsp` npm package (architect decision D7);
this Rust/WASM extension is a thin launcher that locates and starts that binary.

## How the server binary is resolved

`language_server_command` tries, in order:

1. **Project-local** — `<worktree>/node_modules/.bin/hoverfly-lsp` (if you ran
   `npm install hoverfly-lsp` in your project).
2. **Global `$PATH`** — e.g. after `npm install -g hoverfly-lsp`.
3. **Zed-managed** — Zed runs `npm install hoverfly-lsp` into the extension's
   storage and launches `node node_modules/hoverfly-lsp/bin/hoverfly-lsp.js`.

In all cases the server is invoked with `--stdio`. If none of the above resolves,
Zed surfaces an installation error in its log.

> The `hoverfly-lsp` npm package is not yet published. Until it is, **step 3 will
> fail** (npm can't find the package) — use step 1 or 2 with a local build of the
> server. See [Dev install](#dev-install).

## File targeting

`languages/hoverfly-simulation/config.toml` declares:

```toml
path_suffixes = ["hoverfly.json", "hoverfly-simulation.json"]
```

Zed matches these against the suffix of the full filename, so `api.hoverfly.json`,
`users.hoverfly.json`, and `hoverfly-simulation.json` are all detected. These are
plain suffixes, not globs. The server additionally content-fingerprints every file
it is sent and returns empty results for non-simulation JSON, so the activation is
safe even if a non-simulation `*.hoverfly.json` slips through.

To claim additional names without editing the extension, add to your Zed
`settings.json`:

```json
{
  "file_types": {
    "Hoverfly Simulation": ["**/hoverfly/**/*.json"]
  }
}
```

## Install

### Prerequisites

- **Rust via `rustup`** (Zed compiles the extension to `wasm32-wasip1` itself and
  manages the wasm target through rustup; a Homebrew-only Rust will not work):

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  rustup target add wasm32-wasip1
  ```

- **Node.js** on `$PATH` (used by resolution steps 1–3 above).

### Dev install (current — package not yet published)

Because `hoverfly-lsp` is not on npm yet, make the server resolvable first.

1. Build the server from this repo and expose it on `$PATH`:

   ```bash
   npm install            # repo root
   npm run build          # builds packages/server -> dist/cli.cjs
   npm link --workspace packages/server   # puts `hoverfly-lsp` on $PATH
   hoverfly-lsp --stdio </dev/null        # smoke test: should start and wait
   ```

   Alternatively, install it project-locally in the workspace you'll open in Zed:
   `npm install /absolute/path/to/hoverfly-lsp/packages/server`.

2. Install the dev extension in Zed:
   - Command palette → **`zed: install dev extension`** → select this
     `editors/zed` directory.
   - Or: Extensions panel → **Install Dev Extension** → choose `editors/zed`.

   Zed compiles `src/lib.rs` to wasm and loads it. If a published version is
   installed, Zed auto-uninstalls it while the dev version is loaded.

3. Open a `*.hoverfly.json` file. The status bar language should read
   **Hoverfly Simulation** and the **Hoverfly LSP** server should start.

Logs: `~/.local/share/zed/logs/Zed.log`, or launch `zed --foreground` for verbose
output. Compilation errors for the extension appear here.

### Published install (future)

Once published to the Zed extension registry: open the Extensions panel, search
**Hoverfly Simulation**, click Install. Once `hoverfly-lsp` is on npm, no manual
server setup is needed — resolution step 3 installs it automatically.

## Verification

Local checks (this directory):

```bash
# 1. TOML manifests parse
python3 - <<'PY'
import tomllib
for f in ("extension.toml","Cargo.toml","languages/hoverfly-simulation/config.toml"):
    tomllib.load(open(f,"rb")); print("OK", f)
PY

# 2. Rust type-checks against the pinned zed_extension_api
cargo check

# 3. Full wasm build (requires rustup + the wasm target)
rustup target add wasm32-wasip1
cargo build --release --target wasm32-wasip1
```

`cargo check` succeeds with the Homebrew toolchain. The `wasm32-wasip1` build
requires the wasm std component, which only `rustup` provides — see Prerequisites.

### Manual QA checklist (in Zed)

- [ ] `zed: install dev extension` on `editors/zed` compiles without errors
      (check `Zed.log`).
- [ ] Opening `testdata/valid/minimal.hoverfly.json` shows language
      **Hoverfly Simulation** in the status bar.
- [ ] Opening `hoverfly-simulation.json` is detected the same way.
- [ ] JSON syntax highlighting is applied (keys, strings, numbers, `true`/`false`/
      `null`).
- [ ] The **Hoverfly LSP** server starts (visible in the language server logs).
- [ ] Introduce a deliberate error (e.g. set `meta.schemaVersion` to a bad value)
      and confirm a diagnostic appears.
- [ ] Open an unrelated JSON file (e.g. `package.json`) and confirm it is NOT
      detected as Hoverfly Simulation and shows no Hoverfly diagnostics.
- [ ] With a project-local `node_modules/.bin/hoverfly-lsp`, confirm it is used in
      preference to a global install.

## Layout

```
editors/zed/
├── extension.toml                          # manifest: id, language server, json grammar (pinned)
├── Cargo.toml                              # cdylib crate, zed_extension_api 0.7.0
├── Cargo.lock                              # committed for reproducible builds
├── src/lib.rs                              # Extension impl: binary resolution + --stdio
└── languages/hoverfly-simulation/
    ├── config.toml                         # name, grammar=json, path_suffixes
    └── highlights.scm                      # JSON highlight queries
```
