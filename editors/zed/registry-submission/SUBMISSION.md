# Submitting Hoverfly to the Zed extension registry

Ready-to-submit bundle for adding the **Hoverfly** Zed extension to
[`zed-industries/extensions`](https://github.com/zed-industries/extensions).

The extension source stays in this repo at `editors/zed/`. Zed's registry pulls
it in as a **git submodule** and references the subdirectory via a `path` key.
Zed's CI compiles the WebAssembly from source — you do **not** ship a binary.

## TL;DR — what gets submitted

| Field                                 | Value                                                 |
| ------------------------------------- | ----------------------------------------------------- |
| Extension `id` / registry key         | `hoverfly`                                            |
| Source repo                           | `https://github.com/jterrazz/hoverfly-lsp`            |
| Submodule path in registry            | `extensions/hoverfly`                                 |
| Subdir within submodule (`path`)      | `editors/zed`                                         |
| Pinned commit / tag                   | `v0.1.0` (`054274f7f822bc4c31ab1fedf594a57b5d744e10`) |
| `version` (must match extension.toml) | `0.1.0`                                               |

The `extensions.toml` block to add is in
[`extensions-toml-entry.toml`](./extensions-toml-entry.toml).

## Confirmed mechanism (verified against the live registry, 2026-06-14)

- **Submodule + `extensions.toml` entry.** New extensions are added as a git
  submodule under `extensions/<id>/` plus a table in the top-level
  `extensions.toml`. Source:
  <https://zed.dev/docs/extensions/developing-extensions> ("Publishing your
  extension").
- **Subdirectory `path` key IS supported** — this is the make-or-break point for
  us, and it works. The docs show the subdir form explicitly:
  ```toml
  [my-extension]
  submodule = "extensions/my-extension"
  path = "packages/zed"
  version = "0.0.1"
  ```
  Live precedent with our exact layout: the `agnix` entry uses
  `submodule = "extensions/agnix"` + `path = "editors/zed"`. So **no
  root move / separate repo is needed** — `editors/zed` works as-is.
- **`version` must match `extension.toml`** at the pinned submodule commit. Docs:
  "Make sure the `version` matches the one set in `extension.toml` at the
  particular commit." Ours is `0.1.0` in `editors/zed/extension.toml` at `v0.1.0`.
- **Zed CI builds the WASM from source.** The registry CI
  (`.github/workflows/ci.yml`) installs Rust **1.90** with target
  **`wasm32-wasip2`** and runs `pnpm package-extensions` (via the
  `zed-extension` CLI) to compile each extension. You do not commit a `.wasm`.
  (Our `editors/zed/extension.wasm` is a local build artifact and is gitignored —
  good.)
- **CI also enforces sorting and forbids Git LFS.** It runs
  `git diff --exit-code -- extensions.toml .gitmodules` and fails if unsorted,
  telling you to run `pnpm sort-extensions`. It also rejects any submodule using
  Git LFS (we don't).

## extension.toml validation status

`editors/zed/extension.toml` already has every field the registry needs:

- Required: `id = "hoverfly"`, `name = "Hoverfly"`, `version = "0.1.0"`,
  `schema_version = 1` — all present.
- Recommended: `authors`, `repository`, `description` — all present.

No changes were required.

## Step-by-step

> Requires: a GitHub account, `git`, and `pnpm` (CI uses pnpm 11 / Node 24,
> but any recent pnpm works for the local sort).

### 1. Fork and clone the registry

```bash
# Fork https://github.com/zed-industries/extensions in the GitHub UI first.
git clone --recurse-submodules https://github.com/<your-username>/extensions.git
cd extensions
git remote add upstream https://github.com/zed-industries/extensions.git
```

> `--recurse-submodules` can take a while (the registry has many submodules).
> If you skip it, run `git submodule update --init` only for what you need.

### 2. Add the Hoverfly repo as a submodule

The submodule must be pinned to the `v0.1.0` commit (its `editors/zed` is
current — nothing changed there after the tag).

```bash
git submodule add https://github.com/jterrazz/hoverfly-lsp.git extensions/hoverfly
cd extensions/hoverfly
git checkout 054274f7f822bc4c31ab1fedf594a57b5d744e10   # tag v0.1.0
cd ../..
git add extensions/hoverfly .gitmodules
```

### 3. Add the entry to `extensions.toml`

Add this block (also in `extensions-toml-entry.toml`):

```toml
[hoverfly]
submodule = "extensions/hoverfly"
path = "editors/zed"
version = "0.1.0"
```

### 4. Sort (required — CI rejects unsorted files)

```bash
pnpm install
pnpm sort-extensions
```

This alphabetizes `extensions.toml` and `.gitmodules`. Commit whatever it
changes.

### 5. Commit and open the PR

```bash
git add extensions.toml .gitmodules extensions/hoverfly
git commit -m "Add Hoverfly extension"
git push origin main   # or a feature branch on your fork
```

Open a PR from your fork to `zed-industries/extensions:main`. Title:
`Add Hoverfly extension`. In the body, mention it's a JSON-based language +
LSP extension whose server is the published npm package
`@jterrazz/hoverfly-lsp` (auto-installed by the extension at runtime).

### 6. Wait for CI / review

CI will build the extension (Rust 1.90 → `wasm32-wasip2`), run
`pnpm package-extensions`, and check sorting. A Zed maintainer reviews and
merges; the extension then appears in Zed's in-app extension list.

## Notes

- **Why `path = "editors/zed"` and not a root move:** the registry supports
  subdir extensions, so keeping the extension in this monorepo at `editors/zed`
  is the least-maintenance option. No `jterrazz/zed-hoverfly` repo or subtree
  split is needed.
- **Future updates:** to publish a new version, tag a new commit in this repo,
  bump `version` in `editors/zed/extension.toml`, then in your registry fork
  `cd extensions/hoverfly && git checkout <new-tag> && cd ../..`, update
  `version` in `extensions.toml` to match, `pnpm sort-extensions`, and open a PR.
