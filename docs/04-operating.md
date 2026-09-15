# Operating

Nothing here is deployed: this repository releases artefacts to five registries,
and every one of them starts from a GitHub Release. This chapter is the order of
operations, what is automated, what stays manual, and why.

## What ships, and where

| Artefact                      | Registry                           | Published by                   |
| ----------------------------- | ---------------------------------- | ------------------------------ |
| `@jterrazz/hoverfly-lsp`      | npm                                | `release.yml`, tokenlessly     |
| `hoverfly-lsp-vscode` `.vsix` | the GitHub Release                 | `release.yml`                  |
| the same `.vsix`              | VS Code Marketplace, Open VSX      | a human, from a local checkout |
| the IntelliJ plugin           | JetBrains Marketplace              | `./gradlew publishPlugin`      |
| the Zed extension             | the `zed-industries/extensions` PR | a human, from a fork           |

`@hoverfly-lsp/core` is private, never published, and inlined into the server
bundle by esbuild — the npm tarball carries no dependency on it.

The two npm-versioned manifests (`packages/core`, `packages/server`) must agree
with the release tag; the workflow refuses to publish otherwise
(`.github/workflows/release.yml:92`). The editor artefacts version
**independently**, because their registries treat a version as immutable and a
Marketplace-only fix must be able to move without an npm release.

## Cutting a release

1. Walk the parts of [MANUAL-QA.md](../MANUAL-QA.md) that need a real editor —
   in practice VS Code and IntelliJ. Once a version is on npm it cannot be
   replaced ([03-testing.md](03-testing.md) says why this step is not optional).
2. Bump the version in every manifest that ships: `packages/core`,
   `packages/server`, the root `package.json`, and — when they move —
   `editors/vscode`, `editors/zed/extension.toml`,
   `editors/claude-code/.claude-plugin/plugin.json`.
3. Cut the release, which is the trigger:

    ```bash
    gh release create vX.Y.Z --generate-notes
    gh run watch
    ```

4. When it is green, `npm view @jterrazz/hoverfly-lsp version` returns the new
   version and the `.vsix` is attached to the release.
5. Push the `.vsix` to the two extension registries (below), and refresh the
   IntelliJ and Zed artefacts if they moved.

`release.yml` fires on `release: published` — the trigger that fires whether the
release goes out directly or is saved as a draft first, unlike `created`. It
runs the shared house gate on Node 24, verifies the tag, publishes, and uploads
the `.vsix`. The publish step is idempotent: a version already on npm is
skipped rather than failed, so re-cutting a release still attaches its asset.

## Authentication

npm publishing is **tokenless**. The workflow authenticates through OIDC trusted
publishing — `npm publish --provenance` with `id-token: write` and no
`NODE_AUTH_TOKEN` — exactly as the other `@jterrazz` packages do. It required
one setup, done once per package on npmjs.com: a Trusted Publisher on
`@jterrazz/hoverfly-lsp` pointing at repository `jterrazz/hoverfly-lsp`,
workflow `release.yml`. There is no npm secret in this repository.

The manual publishes each carry their own credential, held by the publisher and
never by CI: a Marketplace PAT (Azure DevOps, scope **Marketplace: Manage**), an
Open VSX token, and `JETBRAINS_MARKETPLACE_TOKEN` for the Gradle publish task.

## The manual half

Both extension registries matter: the Microsoft Marketplace serves VS Code,
Open VSX serves Cursor, Windsurf and VSCodium, which cannot reach the former.

```bash
npx @vscode/vsce login Terrazzoni     # one-time, then paste the PAT
npx @vscode/vsce publish --packagePath editors/vscode/.artifacts/vsce/*.vsix
npx ovsx publish editors/vscode/.artifacts/vsce/*.vsix -p "$OVSX_TOKEN"
```

The IntelliJ plugin is built and published from `editors/intellij/plugin` with
Gradle (`./gradlew buildPlugin`, then `./gradlew publishPlugin` once the token is
exported); its build output goes to `.artifacts/gradle/`. The Zed extension
reaches Zed's registry through a pull request against
`zed-industries/extensions` from a fork, prepared from
`editors/zed/registry-submission/`.

Two submissions remain open rather than done: the SchemaStore catalog entry
(`schemas/README.md` carries the exact steps) and the Claude Code plugin
marketplace refresh. Neither blocks a usable release.

## The footprint a user carries

The server is a single self-contained CommonJS bundle plus its bin shim —
`npm install -g @jterrazz/hoverfly-lsp` leaves one `hoverfly-lsp` on `$PATH` and
nothing else. It speaks stdio and holds no state between sessions, and its
schema resolver answers the one bundled URI from memory and rejects every other,
so it touches neither the network nor the filesystem at runtime
(`packages/core/src/service.ts:124`). Its one
setting, `hoverfly.registeredActions`, comes from the client at `initialize` or
through `workspace/configuration`; there is no configuration file and no secret
anywhere in the running system.
