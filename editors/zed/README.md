# hoverfly-lsp — Zed extension

Language support for [Hoverfly](https://docs.hoverfly.io) API simulation files in
[Zed](https://zed.dev). The extension registers a **Hoverfly** language
for `*.hoverfly.json` and `hoverfly-simulation.json`, reuses the JSON grammar for
syntax highlighting, and wires up the `hoverfly-lsp` language server (diagnostics,
completion, hover) over stdio.

All intelligence lives in the `hoverfly-lsp` npm package (architect decision D7);
this Rust/WASM extension is a thin launcher that locates and starts that binary.

## How the server binary is resolved

`language_server_command` tries, in order:

1. **Project-local** — `<worktree>/node_modules/.bin/hoverfly-lsp` (if you ran
   `npm install @jterrazz/hoverfly-lsp` in your project).
2. **Global `$PATH`** — e.g. after `npm install -g @jterrazz/hoverfly-lsp`.
3. **Zed-managed** — Zed runs `npm install @jterrazz/hoverfly-lsp` into the extension's
   storage and launches `node node_modules/@jterrazz/hoverfly-lsp/bin/hoverfly-lsp.js`.

In all cases the server is invoked with `--stdio`. If none of the above resolves,
Zed surfaces an actionable installation error in its log telling you to
`npm install @jterrazz/hoverfly-lsp` (project) or `npm install -g @jterrazz/hoverfly-lsp` (global).

This is the canonical pattern used by first-party Node-LSP extensions
(`zed-industries/zed`'s `html`, `zed-extensions/vue`, `zed-extensions/svelte`):
they `npm_install_package` the server into the extension's work dir, compare
`npm_package_installed_version` against `npm_package_latest_version`, reinstall on
update, and launch via Zed's managed Node. Steps 1–2 are an extra project-local /
`$PATH` override (vue and svelte do the project-local lookup too), useful for a
locally-built server.

> The `hoverfly-lsp` npm package is not yet published. Until it is, **step 3 will
> fail** (npm can't find the package) — use step 1 or 2 with a local build of the
> server. See [Dev install](#dev-install).

### Why not ship the server inside the extension (zero-setup)?

It is not possible. A Zed extension runs as WebAssembly in a WASI sandbox that
**preopens only the extension's _work_ directory** as its working directory
(`crates/extension_host/src/wasm_host.rs`). Files committed to this repo live in
Zed's _installed_ directory, which the wasm cannot read. On top of that, the
published extension archive only contains `extension.toml`, `extension.wasm`,
`languages/`, and `grammars/` (per Zed's
[packaging](https://zed.dev/blog/zed-decoded-extensions)) — an arbitrary `server/`
directory would never even be included. So a bundled `dist/cli.cjs` asset is
unreachable at runtime for both dev _and_ registry installs. The only viable
zero-setup path is publishing `hoverfly-lsp` to npm, after which resolution step 3
installs it automatically with no manual setup.

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
    "Hoverfly": ["**/hoverfly/**/*.json"]
  }
}
```

## Install

### Prerequisites

- **Rust via `rustup`** (Zed compiles the extension to `wasm32-wasip2` itself and
  manages the wasm target through rustup; a Homebrew-only Rust will **not** work):

  ```bash
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
  rustup target add wasm32-wasip2
  ```

  > **Homebrew Rust conflicts with rustup.** If `which cargo` points at
  > `/opt/homebrew/bin/cargo` (or `/usr/local/bin/cargo`), Zed's build picks the
  > Homebrew toolchain, which has no `wasm32-wasip2` std component and fails.
  > Either `brew uninstall rust`, or ensure rustup's `~/.cargo/bin` precedes
  > Homebrew on `$PATH` so `which cargo` resolves to `~/.cargo/bin/cargo`.

  > **GUI launch and `$PATH`.** A Zed launched from Finder/Dock inherits the macOS
  > GUI environment, which usually does **not** include `~/.cargo/bin` — so the
  > extension build can't find `cargo`. Launch Zed from a terminal (`zed .`) where
  > your shell `$PATH` is in effect, or add `~/.cargo/bin` to the GUI `$PATH`
  > (e.g. via `launchctl setenv PATH` or a login-shell `$PATH` that the GUI reads).

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
   **Hoverfly** and the **Hoverfly LSP** server should start.

Logs: `~/.local/share/zed/logs/Zed.log`, or launch `zed --foreground` for verbose
output. Compilation errors for the extension appear here.

### Published install (future)

Once published to the Zed extension registry: open the Extensions panel, search
**Hoverfly**, click Install. Once `hoverfly-lsp` is on npm, no manual
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
rustup target add wasm32-wasip2
cargo build --release --target wasm32-wasip2
```

`cargo check` succeeds with the Homebrew toolchain. The `wasm32-wasip2` build
requires the wasm std component, which only `rustup` provides — see Prerequisites
(and the Homebrew-Rust / GUI-`$PATH` caveats there).

### Semantic highlighting

The server advertises an LSP **semantic tokens** provider that colors the Handlebars template
syntax inside templated body/header strings (helper names, `{{ }}` delimiters, path roots/segments,
known faker types, matcher-name enums) that the JSON grammar alone cannot see.

> **Zed requires you to opt in — semantic tokens are OFF by default** (`semantic_tokens: "off"`).
> Until you enable them, Zed never sends `textDocument/semanticTokens/full`, so the templates stay
> the plain string color. Add to your Zed `settings.json` (`cmd-,`):
>
> ```json
> {
>   "semantic_tokens": "combined"
> }
> ```
>
> `"combined"` overlays the server's tokens on Zed's tree-sitter JSON highlighting (recommended);
> `"full"` uses the server's tokens exclusively. To scope it to Hoverfly files only, nest it instead:
> `{ "languages": { "Hoverfly": { "semantic_tokens": "combined" } } }`. Then run
> **`editor: restart language server`** from the command palette (a mode change needs a server
> restart to take effect).

The legend uses only standard LSP token types, which Zed maps to its theme's existing highlight
categories (`function`, `keyword`, `property`, `variable`, `enumMember`, `string`, `number`,
`operator`); a given theme may render some types more subtly than others. To debug what is actually
applied, run **`dev: open highlights tree view`** from the command palette — it lists every token
(including LSP semantic tokens) for the current buffer. If you see nothing, confirm `semantic_tokens`
is enabled, the **Hoverfly LSP** server is running, and check `~/.local/share/zed/logs/Zed.log`.

### Manual QA checklist (in Zed)

- [ ] `zed: install dev extension` on `editors/zed` compiles without errors
      (check `Zed.log`).
- [ ] Opening `testdata/valid/minimal.hoverfly.json` shows language
      **Hoverfly** in the status bar.
- [ ] Opening `hoverfly-simulation.json` is detected the same way.
- [ ] JSON syntax highlighting is applied (keys, strings, numbers, `true`/`false`/
      `null`).
- [ ] With `"semantic_tokens": "combined"` set in Zed settings and the server restarted: in a
      templated body (`"templated": true`, `"body": "{{ faker 'Name' }}"`), the template syntax is
      colored differently from plain string content (helper name as a function, `{{`/`}}` as
      operators). Without the setting, Zed shows no semantic coloring (it is off by default).
- [ ] The **Hoverfly LSP** server starts (visible in the language server logs).
- [ ] Introduce a deliberate error (e.g. set `meta.schemaVersion` to a bad value)
      and confirm a diagnostic appears.
- [ ] Open an unrelated JSON file (e.g. `package.json`) and confirm it is NOT
      detected as Hoverfly and shows no Hoverfly diagnostics.
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
