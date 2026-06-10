# hoverfly-lsp — IntelliJ Integration via LSP4IJ

Adds diagnostics, completions, and hover documentation for Hoverfly simulation files
(`*.hoverfly.json`, `hoverfly-simulation.json`) to any JetBrains IDE using
[LSP4IJ](https://github.com/redhat-developer/lsp4ij) — including the **free Community edition**.

---

## Contents

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
npm install -g hoverfly-lsp
hoverfly-lsp --version   # verify
```

### Option B — npx (no permanent install; server restarts are slower)

You can configure the server command as `npx hoverfly-lsp --stdio` in Step 4 instead.
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
4. Click **OK** — the server named **Hoverfly LSP** appears in the list.
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
| Server name | `Hoverfly LSP`         |
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
`Hoverfly LSP` appear with a green indicator once the server starts.

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

The **Hoverfly LSP** row should show **Running** status.

Check the LSP4IJ logs if the server fails to start:

```
View → Tool Windows → LSP → Console (select "Hoverfly LSP" in the dropdown)
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

## Manual QA checklist

Run through these steps after any change to the server or this integration:

- [ ] `hoverfly-lsp --version` prints a version string from a terminal
- [ ] `hoverfly-lsp --stdio` starts without error and waits for LSP input
- [ ] LSP4IJ plugin is installed (Settings → Plugins → Installed)
- [ ] Language server entry "Hoverfly LSP" appears in Settings → Tools → Language Servers
- [ ] Opening `*.hoverfly.json` shows "Hoverfly LSP: Running" in the status bar
- [ ] A missing `response.status` field produces a red diagnostic underline
- [ ] Hovering over `schemaVersion` shows a documentation popup
- [ ] Autocompletion triggers inside `"matcher":` value position
- [ ] Opening an unrelated `package.json` does **not** trigger Hoverfly LSP
- [ ] On Windows: server starts with `cmd /C hoverfly-lsp --stdio`
- [ ] After `npm install -g hoverfly-lsp` (future): binary resolves without `node` prefix
