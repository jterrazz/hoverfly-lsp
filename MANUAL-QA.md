# Manual QA — editor integrations

This file collects everything the phase-8 verifier could **not** exercise headlessly in the
build environment. Each item needs a human running a real editor. Everything else (builds,
type-checks, JSON/TOML syntax, `vsce package`, `cargo check`, the LSP `initialize` handshake
over every launcher) was verified automatically — see the "Verified automatically" section at
the end for what you do **not** need to re-check.

All `testdata/...` paths are relative to the repo root. The canonical simulation filenames are
`*.hoverfly.json` and `hoverfly-simulation.json`. The server is `hoverfly-lsp --stdio`.

---

## VS Code (`editors/vscode/`)

The end-to-end editor behaviour cannot run headlessly (no extension host in CI).

**Setup:** from the repo root, `npm install && npm run build`, then
`npm run package --workspace=hoverfly-lsp-vscode` and
`code --install-extension editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix`
(or open `editors/vscode` and press **F5** for an Extension Development Host).

- [ ] Bottom-right language indicator reads **Hoverfly** when a `*.hoverfly.json` is open.
- [ ] `testdata/valid/minimal.hoverfly.json` → **no** diagnostics.
- [ ] `testdata/valid/rich-stateful-templated.hoverfly.json` → no errors; hover over a matcher
      name (e.g. `"glob"`) shows registry docs.
- [ ] `testdata/invalid/hf4xx/dangling-states.hoverfly.json` → squiggles for `HF401/HF402/HF403`.
- [ ] Type a matcher value `{ "matcher": "" }` and trigger completion inside the quotes → matcher
      names appear (`exact`, `regex`, `jsonpath`, …).
- [ ] Open an unrelated `.json` (e.g. `package.json`) → **no** Hoverfly diagnostics, normal JSON mode.
- [ ] Set `"hoverfly.trace.server": "verbose"` → the **Hoverfly LSP** output channel shows the handshake.
- [ ] `hoverfly.server.path` override: point it at a built `packages/server/bin/hoverfly-lsp.js`
      and confirm the server still starts (resolution priority 1).
- [ ] Workspace install path: `npm install hoverfly-lsp` in the workspace (once published) and
      confirm `<workspace>/node_modules/.bin/hoverfly-lsp` is preferred over the bundled server.
- [ ] **Marketplace publish (future):** `code --install-extension jterrazz.hoverfly-lsp-vscode`
      installs the published extension.
- [ ] **Open VSX publish (REQUIRED, not optional):** `ovsx publish` the `.vsix` to
      [Open VSX](https://open-vsx.org/). Cursor, Windsurf, and VSCodium default to Open VSX and
      **cannot** use the MS Marketplace, so this is required for one-click install on the VS Code
      forks. Verify by installing the extension from the marketplace UI inside Cursor/Windsurf.

> Note: `vsce package` emits a "LICENSE not found" warning because the extension directory has no
> own LICENSE file (the repo is MIT at root). Add a `LICENSE` under `editors/vscode/` before
> Marketplace publish to silence it — cosmetic only, does not block packaging.

---

## Zed (`editors/zed/`)

`cargo check` passes with the available toolchain, but Zed builds the extension for the
`wasm32-wasip2` target, which requires **rustup** (the build host had Homebrew Rust only, no
rustup, no wasm target). The wasm build and all in-editor behaviour are manual.

**Setup:** install Rust via rustup and `rustup target add wasm32-wasip2`. Build the server
(`npm run build` at repo root) and put it on `$PATH` (`npm link --workspace packages/server`)
because `hoverfly-lsp` is not on npm yet — Zed's managed-install path (resolution step 3) cannot
work until it is published.

> **Toolchain gotchas (cost us time tonight).** Homebrew Rust has no `wasm32-wasip2` std
> component and will fail the Zed build; `brew uninstall rust` or make `~/.cargo/bin` win on
> `$PATH` so `which cargo` is rustup's. And a Zed launched from Finder/Dock does not inherit
> `~/.cargo/bin` — launch it from a terminal (`zed .`) or add `~/.cargo/bin` to the GUI `$PATH`.

> **No zero-setup bundling.** The server file cannot be shipped inside the extension: Zed's wasm
> sandbox preopens only the extension _work_ dir as cwd (`crates/extension_host/.../wasm_host.rs`),
> so committed files (in the _installed_ dir) are unreachable at runtime, and the published archive
> only contains `extension.toml`/`extension.wasm`/`languages/`/`grammars/`. Zero-setup arrives only
> when `hoverfly-lsp` is published to npm (resolution step 3 then auto-installs it).

- [ ] `cargo build --release --target wasm32-wasip2` succeeds (needs rustup + wasm target).
- [ ] `zed: install dev extension` on `editors/zed` compiles without errors (check
      `~/.local/share/zed/logs/Zed.log`).
- [ ] Opening `testdata/valid/minimal.hoverfly.json` shows language **Hoverfly**.
- [ ] Opening a file named `hoverfly-simulation.json` is detected the same way.
- [ ] JSON syntax highlighting applies (keys, strings, numbers, `true`/`false`/`null`).
- [ ] The **Hoverfly LSP** server starts (visible in the language-server logs).
- [ ] Introduce an error (e.g. bad `meta.schemaVersion`) → a diagnostic appears.
- [ ] Open an unrelated `.json` (e.g. `package.json`) → NOT detected as Hoverfly, no diagnostics.
- [ ] With a project-local `node_modules/.bin/hoverfly-lsp`, confirm it is preferred over a global
      install (resolution step 1 over step 2).
- [ ] **Published path (future):** once `hoverfly-lsp` is on npm, Zed's managed npm install
      (resolution step 3) installs and launches the server with no manual `$PATH` setup.

---

## IntelliJ / JetBrains via LSP4IJ (`editors/intellij/`)

`template.json` and `initializationOptions.json` are valid JSON and match the **current upstream
LSP4IJ template format** (verified against `redhat-developer/lsp4ij`
`src/main/resources/templates/lsp/typescript-language-server/template.json`: `id`, `name`,
`programArgs.{default,windows}`, `fileTypeMappings[].fileType.{name,patterns}` + `languageId`).
No IntelliJ instance was available, so import and runtime behaviour are manual.

> Format note: upstream bundled templates wrap `programArgs.default` in a login shell
> (`sh -c <cmd>`); ours uses the bare `hoverfly-lsp --stdio`. The bare form is valid (LSP4IJ
> splits the string), but if the server is installed via a shell-managed Node (nvm/fnm/mise) and
> the IDE was not launched from that shell, prefer the manual Server-tab config or wrap with
> `sh -c`.

**Setup:** IntelliJ 2024.2+ (any edition); install **LSP4IJ** from the Marketplace; install the
server binary (dev: `npm link --workspace packages/server`; future: `npm install -g hoverfly-lsp`).

- [ ] `hoverfly-lsp --version` and `hoverfly-lsp --stdio` work from a terminal (both verified on
      the build host — re-check on the QA machine's PATH).
- [ ] LSP4IJ installed (Settings → Plugins → Installed).
- [ ] Import `editors/intellij/template.json` via Settings → Tools → Language Servers → **+** →
      _Import from template_ → the server **Hoverfly** appears. (If import is absent in your
      LSP4IJ version, configure manually per README Step 4.)
- [ ] Opening `*.hoverfly.json` shows **Hoverfly: Running** in the status bar.
- [ ] A missing `response.status` field produces a red diagnostic underline.
- [ ] Hovering over `schemaVersion` shows a documentation popup.
- [ ] Completion triggers in `"matcher":` value position.
- [ ] Opening an unrelated `package.json` does **not** trigger Hoverfly LSP.
- [ ] On Windows: server starts with `cmd /C hoverfly-lsp --stdio` (the `programArgs.windows` value).
- [ ] Optional: paste `initializationOptions.json` (`{ "registeredActions": [] }`) into the
      Configuration tab — server starts and `postServeAction` completion reflects the list.

---

## Claude Code (`editors/claude-code/`)

The launcher contract was verified headlessly: `node bin/launch.cjs --stdio` performs a correct
LSP `initialize` handshake (returns `serverInfo.name = "hoverfly-lsp"`), via both the
repo-relative dev bundle and the `HOVERFLY_LSP_PATH` override (file and directory). The two items
below need a real Claude Code install / a second `.json` plugin and could not be exercised here.

**Setup:** `npm run build` at repo root; register the local marketplace
(`claude plugin marketplace add /ABS/PATH/.../editors/claude-code`),
`claude plugin install hoverfly-lsp --scope user`, and
`export HOVERFLY_LSP_PATH=/ABS/PATH/.../packages/server/dist/cli.cjs`.

- [ ] `claude plugin validate ./editors/claude-code --strict` → "Validation passed".
- [ ] `claude plugin install` enables the plugin; `claude plugin details` lists `LSP servers (1) hoverfly`.
- [ ] **Coexistence with another `.json`-mapped LSP plugin** (research/09 §9, §13). The
      `.lsp.json` maps `.json`; confirm that installing a second plugin that also maps `.json`
      does not break either server (both run, or document the limitation). Not testable without a
      second `.json` plugin.
- [ ] **Fully-published flow** (no `HOVERFLY_LSP_PATH`): once `hoverfly-lsp` is on npm, install it
      (`npm i -g hoverfly-lsp` or as a project dep) + a remote marketplace, and confirm the
      launcher resolves the server via `node_modules` (resolution step 2). Cannot run until the
      package is published.
- [ ] Headless smoke: `claude -p "edit a broken *.hoverfly.json and report diagnostics"` surfaces
      the expected `HF2xx` diagnostic after the edit, and stays silent after editing a plain `.json`.

---

## SchemaStore (zero-install, upcoming — all editors)

- [ ] **Not yet submitted.** Submit the enhanced-but-faithful schema to
      [SchemaStore](https://github.com/SchemaStore/schemastore) with
      `fileMatch: ["*.hoverfly.json", "hoverfly-simulation.json"]` (NOT bare `simulation.json` —
      too generic), per architect decision D7 §6. After merge, verify zero-install validation in a
      clean VS Code / IntelliJ (no extension/plugin) on a `*.hoverfly.json`, and that `"$schema"`
      self-declaration auto-applies the schema.

---

## Verified automatically (do not re-check)

- Repo gates at root: `npm run build`, `npm run test` (608 passing), `npm run typecheck`,
  `npm run lint` (oxlint + oxfmt + tsc + knip) — all green with the editor dirs in place.
- VS Code: `npm run build --workspace=hoverfly-lsp-vscode` bundles `dist/extension.cjs` and copies
  the server into `server/`; `vsce package` produces the `.vsix` (9 files, includes the bundled
  server); the bundled `server/bin/hoverfly-lsp.js` answers `initialize` with
  `serverInfo.name = "hoverfly-lsp"`; `server-resolution.ts` unit tests pass.
- Zed: `extension.toml`, `Cargo.toml`, `config.toml` parse; `cargo check` compiles `src/lib.rs`
  against `zed_extension_api 0.7.0` (native target).
- IntelliJ: `template.json` + `initializationOptions.json` are valid JSON and match the live
  LSP4IJ template schema.
- Claude Code: `.lsp.json`, `plugin.json` valid JSON; `launch.cjs` drives a full `initialize`
  handshake over stdio (dev bundle + `HOVERFLY_LSP_PATH` override).
- Cross-track consistency: canonical filenames (`*.hoverfly.json`, `hoverfly-simulation.json`),
  bin name (`hoverfly-lsp`), transport flag (`--stdio`), and the `hoverfly.registeredActions`
  setting / `registeredActions` init option are consistent across all four tracks.
