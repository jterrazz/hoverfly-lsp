# Publishing Hoverfly LSP

A short, ordered playbook. Test first (Phase 0), then publish (Phase 1–2). Phase 3 is optional
and can come later. Everything is already release-ready: `npm publish --dry-run` passes for both
packages and the `.vsix` builds clean.

---

## Phase 0 — Test locally first (≈10 min)

Zed is already verified. Do a quick smoke check on **VS Code** and **IntelliJ** before publishing —
once a version is on npm it can't be replaced.

### VS Code

```bash
npm run build && npm run package --workspace hoverfly-lsp-vscode
code --install-extension editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
```

Open `testdata/valid/rich-stateful-templated.hoverfly.json` and confirm (full list in
[MANUAL-QA.md](./MANUAL-QA.md)):

- Status bar reads **Hoverfly**.
- Change `meta.schemaVersion` to `"v99x"` → a diagnostic appears (HF104).
- Type `"matcher": "` in a request field → matcher completions with docs.
- Hover a matcher name → docs popup.
- Templates inside a `"templated": true` body are colored (semantic tokens; VS Code is on by default).

### IntelliJ (via LSP4IJ)

1. Make the server resolvable on PATH (one-time, since npm isn't published yet):
   `npm run build && npm link --workspace packages/server` → `hoverfly-lsp --version` prints `0.1.0`.
2. Install the **LSP4IJ** plugin (Settings → Plugins → Marketplace → "LSP4IJ").
3. Settings → Languages & Frameworks → Language Servers → **+** → **Import from custom template** →
   select `editors/intellij/template.json` (command `hoverfly-lsp --stdio`, file patterns
   `*.hoverfly.json` / `*.hfy`).
4. Open a `*.hoverfly.json`, break a field, confirm the diagnostic. (Details:
   [editors/intellij/README.md](./editors/intellij/README.md).)

---

## Phase 1 — npm + GitHub Release (the house flow)

Same as the other `@jterrazz` packages: **publish by creating a GitHub Release.** That fires
`.github/workflows/release.yml`, which validates, publishes both npm packages
(`@hoverfly-lsp/core`, `hoverfly-lsp`) **tokenlessly via OIDC trusted publishing**
(`--provenance` + `id-token`, no `NPM_TOKEN`), and attaches the `.vsix` to the release.

**One-time setup — configure npm trusted publishing** (per package, like your other packages):

1. On npmjs.com, for **`@hoverfly-lsp/core`** and **`hoverfly-lsp`**, add a Trusted Publisher
   pointing at GitHub repo `jterrazz/hoverfly-lsp`, workflow `release.yml`. New package names can
   be pre-configured before the first publish. (npm docs: _Trusted publishing for npm packages_.)

> Why no token? The workflow mirrors `jterrazz-actions/release-npm.yaml`: `npm publish --provenance`
> with `id-token: write` and **no `NODE_AUTH_TOKEN`** — npm authenticates the run via OIDC.

**Cut the release** — the version is already `0.1.0` in every manifest:

```bash
gh release create v0.1.0 --generate-notes      # or via the GitHub UI: Releases → Draft a new release
```

Watch it: `gh run watch` (or the Actions tab). When green, `npm view hoverfly-lsp version` returns
`0.1.0` and the `.vsix` is attached to the release.

> Once `hoverfly-lsp` is on npm, **Zed / IntelliJ / Claude Code / Neovim** users get the server
> automatically — no more `npm link`.

---

## Phase 2 — VS Code Marketplace + Open VSX (local, ≈15 min one-time)

The `.vsix` from the Release (or your local build) goes to two registries. **Both matter:** the MS
Marketplace serves VS Code; Open VSX serves Cursor, Windsurf, and VSCodium (they can't use the MS
Marketplace).

### VS Code Marketplace

1. One-time: create the publisher **`jterrazz`** at <https://marketplace.visualstudio.com/manage>
   and a Personal Access Token (Azure DevOps → User Settings → Personal Access Tokens → scope
   **Marketplace: Manage**).
2. Publish:

   ```bash
   npx @vscode/vsce login jterrazz          # paste the PAT (one-time)
   npx @vscode/vsce publish --packagePath editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix
   ```

### Open VSX

1. One-time: sign in at <https://open-vsx.org> with GitHub, create an access token, and claim the
   namespace: `npx ovsx create-namespace jterrazz -p <OVSX_TOKEN>`.
2. Publish:

   ```bash
   npx ovsx publish editors/vscode/hoverfly-lsp-vscode-0.1.0.vsix -p <OVSX_TOKEN>
   ```

---

## Phase 3 — Optional, later

None of these block a usable release; do them when you want broader reach.

- **SchemaStore** (zero-install validation for everyone): submit `schemas/hoverfly-simulation.json`
  with `fileMatch: ["*.hoverfly.json", "*.hfy", "hoverfly-simulation.json"]`. Exact steps:
  [schemas/README.md](./schemas/README.md).
- **Zed extension registry**: open a PR adding the extension to `zed-industries/extensions`
  (points at `editors/zed`). Users then install it from Zed's Extensions panel.
- **Claude Code plugin marketplace**: submit/refresh the `editors/claude-code` plugin (it resolves
  `hoverfly-lsp` from npm). See [editors/claude-code/README.md](./editors/claude-code/README.md).

---

## Cutting later versions

Bump the version in every manifest (the release workflow verifies they all match the release tag),
then `gh release create vX.Y.Z --generate-notes`. Re-run the Phase 2 publish commands with the new
`.vsix`. Manifests to bump: `packages/core`, `packages/server`, `editors/vscode`,
`editors/zed/extension.toml`, `editors/claude-code/.claude-plugin/plugin.json`, plus the root
`package.json`.
