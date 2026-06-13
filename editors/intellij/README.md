# hoverfly-lsp — IntelliJ Integration

Adds diagnostics, completions, hover documentation, and semantic highlighting for Hoverfly
simulation files (`*.hoverfly.json`, `*.hfy`, `hoverfly-simulation.json`) to any JetBrains IDE —
including the **free Community edition**. Built on
[LSP4IJ](https://github.com/redhat-developer/lsp4ij).

There are two ways to set this up:

1. **[Install the plugin (recommended)](#install-the-plugin-recommended)** — a one-click `.zip`
   that bundles the language server and configures LSP4IJ for you. No manual LSP setup.
2. **[Manual LSP4IJ template (fallback)](#manual-lsp4ij-template-fallback)** — import
   `template.json` by hand and install the `hoverfly-lsp` binary yourself.

---

## Install the plugin (recommended)

The plugin lives under [`plugin/`](./plugin) and ships the Hoverfly language server bundled
inside it — installing the `.zip` is all that is required (plus a Node.js runtime, see below).

### 1. Get the `.zip`

Build it from source (requires JDK 21; the Gradle wrapper is committed):

```bash
# Ensure the server bundle is current, then build the plugin:
npm run build                                   # at the repo root — produces packages/server/dist/cli.cjs
cd editors/intellij/plugin
JAVA_HOME=/path/to/jdk-21 ./gradlew buildPlugin  # macOS Homebrew: /opt/homebrew/opt/openjdk@21/libexec/openjdk.jdk/Contents/Home
```

The plugin appears at `editors/intellij/plugin/build/distributions/Hoverfly-0.1.0.zip`.

### 2. Install it in the IDE

1. Open **Settings → Plugins**.
2. Click the **gear icon** (⚙) → **Install Plugin from Disk…**.
3. Select `Hoverfly-0.1.0.zip`.
4. IntelliJ prompts to install the required **LSP4IJ** dependency — accept it
   (or install LSP4IJ first from **Marketplace**; plugin id `com.redhat.devtools.lsp4ij`).
5. **Restart** the IDE when prompted.

### 3. Node.js requirement

The plugin launches the bundled server with Node.js (20+). A GUI-launched IDE does **not**
inherit your shell `PATH` (no nvm/fnm/mise), so the plugin auto-detects `node` from, in order:

1. the `HOVERFLY_LSP_NODE` environment variable,
2. common fixed locations (`/opt/homebrew/bin/node`, `/usr/local/bin/node`, `/usr/bin/node`),
3. the newest version under `~/.nvm/versions/node/*/bin/node`, plus fnm/mise install dirs,
4. `node` on `PATH` (usually empty for GUI apps),
5. Windows `nodejs` install locations.

If you see a "Node.js not found" notification, set `HOVERFLY_LSP_NODE` to the absolute path of a
`node` binary (e.g. via **launchctl setenv** on macOS, or your shell profile if you launch the IDE
from a terminal) and restart the IDE:

```bash
which node                                       # copy this path
launchctl setenv HOVERFLY_LSP_NODE /absolute/path/to/node   # macOS, applies to GUI apps after relaunch
```

### 4. Verify

Open any `*.hoverfly.json` file. The **Hoverfly** server should appear as **Running** under
**Settings → Languages & Frameworks → Language Servers** (or the LSP console:
**View → Tool Windows → LSP**). Removing a required `response.status` field should surface a red
diagnostic; hovering `schemaVersion` should show docs. See the
[Manual QA checklist](#manual-qa-checklist) for the full smoke test.

---

## Manual LSP4IJ template (fallback)

Use this if you prefer not to build/install the plugin, or want to point at a globally installed
`hoverfly-lsp` binary instead of the bundled server.

### Contents

- [`template.json`](./template.json) — importable LSP4IJ user-defined language server template
- [`initializationOptions.json`](./initializationOptions.json) — optional init-time settings

---

## Prerequisites

| Requirement             | Details                                               |
| ----------------------- | ----------------------------------------------------- |
| **IDE version**         | IntelliJ IDEA 2024.2 or later (Community or Ultimate) |
| **LSP4IJ plugin**       | Version 0.7.0 or later                                |
| **Node.js**             | 20 or later                                           |
| **hoverfly-lsp binary** | See install options below                             |

---

## Step 1 — Install the `hoverfly-lsp` binary

### Option A — npm global install (recommended once published)

```bash
npm install -g @jterrazz/hoverfly-lsp
hoverfly-lsp --version   # verify
```

### Option B — npx (no permanent install; server restarts are slower)

You can configure the server command as `npx @jterrazz/hoverfly-lsp --stdio` in Step 4 instead.
Note: npx adds 1–3 seconds on each server restart; not recommended for daily use.

### Option C — dev/local install (current, pre-npm-publish)

```bash
# From the hoverfly-lsp repository root:
npm install
npm run build
# Then link the binary so it is on PATH:
npm link --workspace packages/server
hoverfly-lsp --version   # verify
```

> Once the package is published to npm, Option A replaces Option C and no re-configuration
> of LSP4IJ is needed — the binary name `hoverfly-lsp` stays the same.

---

## Step 2 — Install LSP4IJ

1. Open **Settings → Plugins → Marketplace**.
2. Search for **LSP4IJ**.
3. Click **Install** and restart the IDE.

Plugin page: https://plugins.jetbrains.com/plugin/23257-lsp4ij

---

## Step 3 — Import the template (fastest path)

LSP4IJ supports importing a pre-built user-defined language server template.

1. Open **Settings → Tools → Language Servers**.
2. Click the **+** icon, then **Import from template...** (or **New Language Server → Import**).
3. Select the file [`editors/intellij/template.json`](./template.json) from this repository.
4. Click **OK** — the server named **Hoverfly** appears in the list.
5. Proceed to Step 5.

> If the **Import from template** option is absent in your LSP4IJ version, use
> [Step 4 — Manual configuration](#step-4--manual-configuration-alternative) instead.

---

## Step 4 — Manual configuration (alternative to Step 3)

Use this if your LSP4IJ version does not have template import, or if you want to customise
individual fields.

1. Open **Settings → Tools → Language Servers**.
2. Click **+** → **New Language Server**.

### Server tab

| Field       | Value                  |
| ----------- | ---------------------- |
| Server name | `Hoverfly`             |
| Command     | `hoverfly-lsp --stdio` |

For Windows, use: `cmd /C hoverfly-lsp --stdio`

For npx (no global install): `npx hoverfly-lsp --stdio`

For a dev path (pre-publish): replace `hoverfly-lsp` with the absolute path to the binary,
e.g. `/Users/you/Developer/hoverfly-lsp/packages/server/bin/hoverfly-lsp.js` prefixed with
`node`:

```
node /path/to/hoverfly-lsp/packages/server/bin/hoverfly-lsp.js --stdio
```

### Mappings tab

Click **+** in the **File name patterns** section and add each row:

| Pattern                    | Language ID           |
| -------------------------- | --------------------- |
| `*.hoverfly.json`          | `hoverfly-simulation` |
| `hoverfly-simulation.json` | `hoverfly-simulation` |

The Language ID value is sent to the server as `TextDocumentItem.languageId` on file open.

> Do not map `*.json` or `simulation.json` here — those patterns are too broad and will route
> all JSON files through the Hoverfly server. The server uses content fingerprinting as a
> second layer of defence, but the mapping is the primary filter.

### Configuration tab (optional)

Paste the contents of [`initializationOptions.json`](./initializationOptions.json) into the
**Initialization options** field:

```json
{
  "registeredActions": []
}
```

`registeredActions` is the only init-time setting the server reads (the names of the
`postServeAction`s registered with your Hoverfly instance, used to complete and validate
`response.postServeAction`). Content fingerprinting is always on and needs no configuration —
the server returns empty results for non-simulation JSON regardless of this object.

---

## Step 5 — Verify the integration

Open any `*.hoverfly.json` file. In the bottom-right of the IDE status bar you should see
`Hoverfly` appear with a green indicator once the server starts.

Trigger a diagnostic:

1. Create a test file `smoke.hoverfly.json` with invalid content:

```json
{
  "data": { "pairs": [{ "request": {}, "response": {} }] },
  "meta": { "schemaVersion": "v5" }
}
```

2. Remove the required `status` field from `response`: `"response": {}` — you should see a
   diagnostic error highlighting the missing field.

3. Hover over `schemaVersion` — hover documentation should appear.

Verify the server is running:

```
Settings → Tools → Language Servers
```

The **Hoverfly** row should show **Running** status.

Check the LSP4IJ logs if the server fails to start:

```
View → Tool Windows → LSP → Console (select "Hoverfly" in the dropdown)
```

Common failure: `hoverfly-lsp: command not found` — run `which hoverfly-lsp` in a terminal to
confirm the binary is on PATH. If using a shell-managed PATH (nvm, fnm, mise), launch
IntelliJ from the same shell or configure the full binary path in the Server tab.

---

## Alternative: Native JetBrains LSP API (Ultimate only, deferred)

IntelliJ IDEA Ultimate 2025.3+ includes a built-in LSP API that does not require the LSP4IJ
plugin. The native API supports the same LSP protocol and is configured via a JetBrains plugin
(Kotlin/Java code). Building a native plugin is deferred per project decision D7 because:

- LSP4IJ covers all IntelliJ editions including Community.
- A native plugin requires Kotlin plugin development and JetBrains Marketplace review.
- The native API converged to feature parity with LSP4IJ only from 2025.3 onwards.

When a native plugin is eventually built, it will target `com.intellij.modules.lsp` and use
`isSupportedFile` Kotlin logic to match `*.hoverfly.json` and `hoverfly-simulation.json`.

---

## Semantic highlighting

The server advertises an LSP **semantic tokens** provider. LSP4IJ supports semantic tokens and maps
them onto IntelliJ's `TextAttributesKey` color scheme, so the Handlebars template syntax inside
templated body/header strings (helper names, `{{ }}` delimiters, path roots/segments, known faker
types, matcher-name enums) is colored beyond what the JSON file type provides.

Notes specific to LSP4IJ / JetBrains:

- **Enable it if it is off.** Some LSP4IJ versions gate semantic tokens behind a per-server toggle.
  Open **Settings → Languages & Frameworks → Language Servers → Hoverfly**, and on the server's
  configuration there ensure semantic-token / "Semantic highlighting" support is enabled (LSP4IJ
  exposes this as a server feature; recent versions also surface a **Semantic tokens** color mapping
  page). If you see no template coloring, this toggle is the first thing to check.
- The legend uses only standard LSP token types; LSP4IJ ships a default mapping from those to the
  IDE color scheme, so no manual color setup is required for the tokens to take effect. You can
  refine the colors under **Settings → Editor → Color Scheme** if desired.
- Semantic tokens are a server feature: they only appear once the **Hoverfly** server shows
  **Running**.

## Manual QA checklist

Run through these steps after any change to the server or this integration:

- [ ] `hoverfly-lsp --version` prints a version string from a terminal
- [ ] `hoverfly-lsp --stdio` starts without error and waits for LSP input
- [ ] LSP4IJ plugin is installed (Settings → Plugins → Installed)
- [ ] Language server entry "Hoverfly" appears in Settings → Tools → Language Servers
- [ ] Opening `*.hoverfly.json` shows "Hoverfly: Running" in the status bar
- [ ] A missing `response.status` field produces a red diagnostic underline
- [ ] Hovering over `schemaVersion` shows a documentation popup
- [ ] In a templated body (`"templated": true`, `"body": "{{ faker 'Name' }}"`), the template syntax
      is colored (helper name, `{{`/`}}`, faker type) — enable the server's semantic-tokens toggle in
      the Language Servers settings first if no coloring appears
- [ ] Autocompletion triggers inside `"matcher":` value position
- [ ] Opening an unrelated `package.json` does **not** trigger Hoverfly
- [ ] On Windows: server starts with `cmd /C hoverfly-lsp --stdio`
- [ ] After `npm install -g @jterrazz/hoverfly-lsp` (future): binary resolves without `node` prefix
