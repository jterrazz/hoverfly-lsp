# 04 — IDE Integration for hoverfly-lsp

> How to wire a stdio-based LSP server into every target editor, solve the
> "we only want to activate on Hoverfly JSON files, not all JSON" problem, and
> ship a JSON Schema as a zero-install fallback.

---

## Table of Contents

1. [VS Code — Minimal Extension](#1-vs-code--minimal-extension)
2. [Zed — Extension System](#2-zed--extension-system)
3. [IntelliJ / JetBrains — LSP4IJ vs Native LSP API](#3-intellij--jetbrains--lsp4ij-vs-native-lsp-api)
4. [Claude Code — LSP Plugin](#4-claude-code--lsp-plugin)
5. [The Critical Problem: File Targeting](#5-the-critical-problem-file-targeting)
6. [JSON Schema as a Zero-Install Fallback](#6-json-schema-as-a-zero-install-fallback)
7. [Recommended Canonical File Naming Convention](#7-recommended-canonical-file-naming-convention)
8. [Summary and Decision Table](#8-summary-and-decision-table)

---

## 1. VS Code — Minimal Extension

### 1.1 Package versions (as of June 2026)

| Package                          | Version    | Notes                                             |
| -------------------------------- | ---------- | ------------------------------------------------- |
| `vscode-languageclient`          | **10.0.0** | Released 2026-06-03; pairs with LSP Protocol 3.18 |
| `vscode-languageserver`          | 10.0.0     | Server-side companion                             |
| `vscode-languageserver-protocol` | 3.18.0     | Wire protocol definitions                         |

Version 9.0.x paired with Protocol 3.17. The jump to 10.0.0 brought Protocol 3.18 support. No version before 9.0 should be used for new work.

**Breaking changes from 8.x → 9.x (still relevant for migration):**

- `client.start()` and `client.stop()` now return `Promise<void>` instead of `Disposable`.
- All handler registrations return a `Disposable` to allow later unregistration.
- Logging switched from `OutputChannel` to `LogOutputChannel`.

### 1.2 Defining a custom language ID

The recommended approach is to register a **new language ID** (`hoverfly-simulation`) rather than reusing the built-in `json` ID. This is exactly what the Azure Pipelines extension does for `.yml` files: it registers `azure-pipelines` and uses `filenamePatterns` to claim specific filenames, so the extension activates only on those files and leaves all other YAML files alone.

**`package.json` (root extension manifest):**

```json
{
  "name": "hoverfly-lsp",
  "displayName": "Hoverfly Simulation Language Support",
  "description": "Diagnostics, autocomplete, and hover docs for Hoverfly simulation files",
  "version": "0.1.0",
  "publisher": "your-publisher-id",
  "engines": { "vscode": "^1.82.0" },
  "categories": ["Programming Languages", "Linters"],
  "activationEvents": [],
  "main": "./out/extension.js",
  "contributes": {
    "languages": [
      {
        "id": "hoverfly-simulation",
        "aliases": ["Hoverfly Simulation", "hoverfly"],
        "filenames": ["simulation.json"],
        "filenamePatterns": [
          "*.hoverfly.json",
          "**/hoverfly/**/*.json",
          "**/.hoverfly/**/*.json",
          "hoverfly-simulation.json"
        ],
        "configuration": "./language-configuration.json"
      }
    ],
    "grammars": [
      {
        "language": "hoverfly-simulation",
        "scopeName": "source.json.hoverfly",
        "path": "./syntaxes/hoverfly.tmLanguage.json",
        "embeddedLanguages": {
          "meta.embedded.block.json": "json"
        }
      }
    ],
    "configuration": {
      "title": "Hoverfly LSP",
      "properties": {
        "hoverflyLsp.trace.server": {
          "type": "string",
          "enum": ["off", "messages", "verbose"],
          "default": "off",
          "description": "Traces communication between VS Code and the Hoverfly language server."
        }
      }
    }
  },
  "dependencies": {
    "vscode-languageclient": "^10.0.0"
  },
  "devDependencies": {
    "@types/vscode": "^1.82.0",
    "typescript": "^5.0.0"
  }
}
```

**Notes on `activationEvents`:**
As of VS Code 1.74.0+, leaving `activationEvents` as `[]` (empty array) is correct — VS Code automatically activates extensions based on their `contributes.languages` `filenamePatterns`. For compatibility with older VS Code, you would add `"onLanguage:hoverfly-simulation"`, but that is no longer required.

### 1.3 `extension.ts` — Stdio client setup

```typescript
import * as path from "path";
import { workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient;

export async function activate(context: ExtensionContext): Promise<void> {
  // Path to the server binary installed alongside the extension.
  // In production, this would be something like:
  //   const serverBin = context.asAbsolutePath(path.join('node_modules', '.bin', 'hoverfly-lsp'));
  // For a Node.js server module:
  const serverModule = context.asAbsolutePath(path.join("server", "out", "server.js"));

  const serverOptions: ServerOptions = {
    run: {
      module: serverModule,
      transport: TransportKind.stdio,
    },
    debug: {
      module: serverModule,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  // If your server is a standalone binary (not a Node.js module):
  // const serverOptions: ServerOptions = {
  //   command: '/usr/local/bin/hoverfly-lsp',
  //   args: ['--stdio'],
  //   transport: TransportKind.stdio,
  // };

  const clientOptions: LanguageClientOptions = {
    // Only activate for files with the hoverfly-simulation language ID.
    // The filenamePatterns in package.json assign the language ID;
    // this documentSelector ensures the LSP client only handles those files.
    documentSelector: [
      { scheme: "file", language: "hoverfly-simulation" },
      // Optionally also handle untitled hoverfly files:
      { scheme: "untitled", language: "hoverfly-simulation" },
    ],
    synchronize: {
      // Watch for changes to .hoverfly.json files in the workspace
      fileEvents: workspace.createFileSystemWatcher("**/*.hoverfly.json"),
    },
    outputChannelName: "Hoverfly LSP",
  };

  client = new LanguageClient(
    "hoverfly-lsp",
    "Hoverfly Language Server",
    serverOptions,
    clientOptions,
  );

  await client.start();
}

export async function deactivate(): Promise<void> {
  if (!client) return;
  await client.stop();
}
```

### 1.4 `language-configuration.json`

```json
{
  "comments": {},
  "brackets": [
    ["{", "}"],
    ["[", "]"]
  ],
  "autoClosingPairs": [
    { "open": "{", "close": "}" },
    { "open": "[", "close": "]" },
    { "open": "\"", "close": "\"" }
  ],
  "surroundingPairs": [
    ["{", "}"],
    ["[", "]"],
    ["\"", "\""]
  ]
}
```

### 1.5 How the documentSelector pattern approach works

The `filenamePatterns` in `contributes.languages` assign VS Code's internal language ID to matching files. Once a file has the `hoverfly-simulation` language ID, the LSP client's `documentSelector: [{ language: 'hoverfly-simulation' }]` picks it up. No other JSON files are affected.

You can also use a **pattern-only** document selector without a custom language ID, but this is discouraged because it prevents other extensions from contributing features for the same language and makes the `onLanguage` activation event unavailable:

```typescript
// Less preferred — works but couples you to file paths instead of language ID
documentSelector: [
  { scheme: "file", pattern: "**/*.hoverfly.json" },
  { scheme: "file", pattern: "**/hoverfly/**/*.json" },
];
```

### 1.6 Reusing vs defining a new language ID

| Approach                                       | Pros                                                                                                                     | Cons                                                                                                                                                                 |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **New ID `hoverfly-simulation`** (recommended) | Clean isolation; activates only on target files; other JSON tooling still works on these files via built-in JSON support | User must know to associate files if using non-standard names                                                                                                        |
| **Reuse built-in `json`**                      | Zero user config needed                                                                                                  | Activates on all JSON files; your LSP gets called for every `.json` file and must return empty results for non-Hoverfly files; pollutes the JSON language experience |

The Azure Pipelines extension (`azure-pipelines`) is the canonical precedent for the "new language ID" approach: it claims `.yml` files matching pipeline naming patterns, leaving all other YAML to the built-in YAML extension.

---

## 2. Zed — Extension System

### 2.1 Architecture overview

Zed extensions are compiled to **WebAssembly** (`wasm32-wasip1`) from Rust. They are sandboxed and communicate with Zed through the `zed_extension_api` crate. Extensions cannot be simple shell scripts or configuration files — Rust code is required for anything that provides a language server.

Zed also supports a simpler **settings-only** approach via `settings.json` for servers already in PATH (see section 2.5), but this has limitations for npm-binary resolution.

### 2.2 Extension directory layout

```
hoverfly-lsp-zed/
├── extension.toml          # Manifest (required)
├── Cargo.toml              # Rust workspace manifest
├── src/
│   └── lib.rs              # Rust extension code
└── languages/
    └── hoverfly-simulation/
        ├── config.toml     # Language metadata
        └── highlights.scm  # Tree-sitter highlight queries (can be minimal)
```

### 2.3 `extension.toml`

```toml
id = "hoverfly-simulation"
name = "Hoverfly Simulation"
version = "0.1.0"
schema_version = 1
authors = ["Your Name <you@example.com>"]
description = "Language support for Hoverfly API simulation files"
repository = "https://github.com/your-org/hoverfly-lsp-zed"

# Declare the language server this extension provides
[language_servers.hoverfly-lsp]
name = "Hoverfly LSP"
languages = ["Hoverfly Simulation"]

# Map LSP languageId (sent to the server on initialize) to the Zed language name
[language_servers.hoverfly-lsp.language_ids]
"Hoverfly Simulation" = "hoverfly-simulation"
```

**Constraint**: extension IDs and names must not contain the words `zed`, `Zed`, or `extension`.

### 2.4 `languages/hoverfly-simulation/config.toml`

```toml
name = "Hoverfly Simulation"
grammar = "json"            # Reuse JSON grammar for syntax highlighting

# File targeting — these are the path suffixes Zed uses to detect the language.
# Zed matches on the FULL filename suffix, not just extension.
path_suffixes = ["hoverfly.json", "hoverfly-simulation.json"]

# Also match files inside hoverfly/ directories named simulation.json:
# (Zed does not support glob patterns in path_suffixes as of 2025;
# for directory-based matching you need the Rust extension code.)

tab_size = 2
line_comments = []
```

**Important**: `path_suffixes` in Zed config.toml matches on the suffix of the full filename. `"hoverfly.json"` will match `api.hoverfly.json`, `my.hoverfly.json`, etc. It does **not** support glob wildcards — those require the Rust layer.

### 2.5 `src/lib.rs` — Rust extension with npm binary resolution

```rust
use zed_extension_api::{self as zed, LanguageServerId, Result};

struct HoverflyExtension {
    cached_binary_path: Option<String>,
}

impl zed::Extension for HoverflyExtension {
    fn new() -> Self {
        HoverflyExtension {
            cached_binary_path: None,
        }
    }

    fn language_server_command(
        &mut self,
        _language_server_id: &LanguageServerId,
        worktree: &zed::Worktree,
    ) -> Result<zed::Command> {
        // Strategy 1: Check for a locally installed binary in the worktree's
        // node_modules first (project-local install).
        if let Some(local_path) = worktree.which("hoverfly-lsp") {
            return Ok(zed::Command {
                command: local_path,
                args: vec!["--stdio".to_string()],
                env: vec![],
            });
        }

        // Strategy 2: Use Zed's managed npm package installation.
        // This downloads and caches the package inside Zed's extension storage.
        let package_name = "hoverfly-lsp";
        let installed_version = zed::npm_package_installed_version(package_name)?;
        let latest_version = zed::npm_package_latest_version(package_name)?;

        if installed_version.as_deref() != Some(&latest_version) {
            zed::npm_install_package(package_name, &latest_version)?;
        }

        // Build path to the installed binary
        let node = zed::node_binary_path()?;
        let binary = format!(
            "{}/node_modules/.bin/{}",
            zed::extension_path(),
            package_name
        );

        Ok(zed::Command {
            command: node,
            args: vec![binary, "--stdio".to_string()],
            env: vec![],
        })
    }
}

zed::register_extension!(HoverflyExtension);
```

### 2.6 `Cargo.toml`

```toml
[package]
name = "hoverfly-lsp-zed"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
# Always use the latest version from crates.io
zed_extension_api = "0.3.0"
```

Check https://crates.io/crates/zed_extension_api for the current latest version.

### 2.7 Tree-sitter grammar (`highlights.scm`)

Since we reuse the `json` grammar, the highlights.scm can be empty or minimal:

```scheme
; hoverfly-simulation highlights
; Inherits all JSON highlighting from the json grammar.
; Add custom highlighting rules here if desired.
```

A `languages/hoverfly-simulation/highlights.scm` file must exist even if empty.

### 2.8 Installing a dev extension locally

```bash
# From within Zed (Command Palette):
# "zed: install dev extension" → select the extension directory

# Or from the Extensions panel:
# Click "Install Dev Extension" button → navigate to your extension folder
```

**Prerequisites:**

- Rust must be installed via `rustup` (not Homebrew). Zed uses its own rustup-based compilation.
- If the published version of the extension is already installed, it is automatically uninstalled when the dev version is loaded.
- Check `~/.local/share/zed/logs/Zed.log` for compilation errors.
- For verbose logs, launch: `zed --foreground`

### 2.9 Settings-only approach (no Rust required)

If the `hoverfly-lsp` binary is already on PATH (e.g., installed globally via `npm install -g hoverfly-lsp`), users can configure it without a Zed extension by adding to their `~/.config/zed/settings.json`:

```json
{
  "lsp": {
    "hoverfly-lsp": {
      "binary": {
        "path": "/usr/local/bin/hoverfly-lsp",
        "arguments": ["--stdio"]
      }
    }
  },
  "file_types": {
    "Hoverfly Simulation": ["*.hoverfly.json", "hoverfly-simulation.json"]
  }
}
```

**Limitation**: This requires a custom language already registered (via an extension or built-in). The `file_types` setting can only remap files to existing language names, it cannot create new languages. So the settings-only approach works only after installing the extension, or if the user is content with JSON syntax highlighting.

---

## 3. IntelliJ / JetBrains — LSP4IJ vs Native LSP API

### 3.1 The landscape (as of 2026)

|                           | Native JetBrains LSP API                                                                                                                                                            | LSP4IJ (Red Hat)                                                   |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| **IDE editions**          | Ultimate (historically); **all users from 2025.3** after unified distribution                                                                                                       | **All editions** including Community, free forever                 |
| **Minimum version**       | 2023.2 (first introduced); production quality from 2025.2                                                                                                                           | IntelliJ 2024.2+ (last 4 major releases supported)                 |
| **Plugin SDK dependency** | `com.intellij.modules.lsp` — built into IDE                                                                                                                                         | Third-party plugin marketplace dependency                          |
| **LSP features**          | Diagnostics, completion, hover, go-to-def, find-refs (2023.2+); plus code lens, range formatting, call hierarchy, type hierarchy, rename, on-type formatting (added through 2026.1) | Most LSP 3.17 features including all the above plus many more      |
| **File targeting**        | Code-level (`isSupportedFile` Kotlin method)                                                                                                                                        | GUI mapping + plugin.xml extension points                          |
| **Configuration style**   | Requires writing a JetBrains plugin (Kotlin/Java)                                                                                                                                   | Can use GUI "New Language Server" dialog — no plugin code required |
| **Open source**           | No                                                                                                                                                                                  | Yes (Apache 2.0)                                                   |

### 3.2 Recommendation

**Use LSP4IJ** for the initial release of hoverfly-lsp IDE integration because:

1. It works on all IntelliJ variants including the free Community edition.
2. Configuration requires zero IntelliJ plugin development — users add the server via the GUI.
3. It supports file name patterns (glob-based), which is exactly what we need to target `*.hoverfly.json` without affecting all JSON files.
4. The JetBrains native API is converging toward universal availability in 2025.3, but LSP4IJ will remain the better choice for plugin-free deployment.

If you want to ship a first-class JetBrains plugin (distributable via the marketplace), consider building against the native API targeting 2025.2+ and bundling LSP4IJ as a dependency for users on 2024.x.

### 3.3 LSP4IJ — User-defined server configuration (no plugin code required)

**Step 1**: Install LSP4IJ from the JetBrains Marketplace (plugin ID: `LSP4IJ`).

**Step 2**: Open `Settings → Tools → Language Server Protocol → Language Servers`, click **+** → `New Language Server`.

**Step 3**: Fill in the **Server** tab:

| Field                 | Value                  |
| --------------------- | ---------------------- |
| Server name           | `Hoverfly LSP`         |
| Command               | `hoverfly-lsp --stdio` |
| Environment variables | _(optional)_           |

On Windows, prefix with `cmd /c`: `cmd /c hoverfly-lsp --stdio`.
Use macros for portability: `$PROJECT_DIR$`, `$USER_HOME$`.

**Step 4**: In the **Mappings** tab, click **+** in the **File name patterns** section:

| Pattern                    | Language ID           |
| -------------------------- | --------------------- |
| `*.hoverfly.json`          | `hoverfly-simulation` |
| `hoverfly-simulation.json` | `hoverfly-simulation` |
| `simulation.json`          | `hoverfly-simulation` |

The **Language ID** column sets the `TextDocumentItem#languageId` sent to the server in `textDocument/didOpen` — set it to `hoverfly-simulation` so the server can identify the file type.

**Step 5**: Optional — in the **Configuration** tab, paste initialization options JSON:

```json
{
  "hoverflyLsp": {
    "validation": {
      "strict": true
    }
  }
}
```

### 3.4 LSP4IJ — Distributable template (for sharing with teams)

LSP4IJ supports exportable templates as zip files. The `template.json` inside follows this structure:

```json
{
  "name": "Hoverfly LSP",
  "programArgs": "--stdio",
  "commandLine": "hoverfly-lsp",
  "fileAssociations": [
    {
      "kind": "fileNamePattern",
      "patterns": "*.hoverfly.json;hoverfly-simulation.json;simulation.json",
      "languageId": "hoverfly-simulation"
    }
  ],
  "initializationOptions": {},
  "settings": {}
}
```

### 3.5 Native LSP API — Plugin code (for marketplace distribution)

For teams that want a JetBrains plugin (requires IntelliJ 2023.2+ and targets Ultimate or 2025.3+ unified distribution):

**`plugin.xml`:**

```xml
<idea-plugin>
  <id>io.hoverfly.lsp</id>
  <name>Hoverfly Simulation LSP</name>
  <version>0.1.0</version>
  <depends>com.intellij.modules.platform</depends>
  <depends>com.intellij.modules.lsp</depends>

  <extensions defaultExtensionNs="com.intellij.platform.lsp">
    <serverSupportProvider
      implementation="io.hoverfly.lsp.HoverflyLspServerSupportProvider"/>
  </extensions>
</idea-plugin>
```

**`HoverflyLspServerSupportProvider.kt`:**

```kotlin
package io.hoverfly.lsp

import com.intellij.openapi.project.Project
import com.intellij.openapi.vfs.VirtualFile
import com.intellij.platform.lsp.api.LspServerSupportProvider
import com.intellij.platform.lsp.api.LspServerStarter
import com.intellij.platform.lsp.api.ProjectWideLspServerDescriptor
import com.intellij.execution.configurations.GeneralCommandLine

class HoverflyLspServerSupportProvider : LspServerSupportProvider {
    override fun fileOpened(
        project: Project,
        file: VirtualFile,
        serverStarter: LspServerStarter
    ) {
        if (isHoverflySimulationFile(file)) {
            serverStarter.ensureServerStarted(HoverflyLspServerDescriptor(project))
        }
    }
}

private fun isHoverflySimulationFile(file: VirtualFile): Boolean {
    if (file.extension != "json") return false
    val name = file.name
    return name.endsWith(".hoverfly.json")
        || name == "simulation.json"
        || name == "hoverfly-simulation.json"
        || file.parent?.name == "hoverfly"
        || file.parent?.name == ".hoverfly"
}

class HoverflyLspServerDescriptor(project: Project) :
    ProjectWideLspServerDescriptor(project, "Hoverfly LSP") {

    override fun isSupportedFile(file: VirtualFile): Boolean =
        isHoverflySimulationFile(file)

    override fun createCommandLine(): GeneralCommandLine =
        GeneralCommandLine("hoverfly-lsp", "--stdio")
}
```

**`build.gradle.kts`:**

```kotlin
plugins {
    id("org.jetbrains.intellij.platform") version "2.16.0"
}

intellijPlatform {
    pluginConfiguration {
        ideaVersion {
            sinceBuild = "232"     // 2023.2
            untilBuild = provider { null }
        }
    }
}

dependencies {
    intellijPlatform {
        intellijIdeaUltimate("2025.2.1")
    }
}
```

---

## 4. Claude Code — LSP Plugin

### 4.1 How Claude Code consumes LSP servers (2026 mechanism)

Claude Code has a **first-class LSP plugin system** (as of v2.x). LSP servers are NOT registered via MCP `mcpServers` — they use a dedicated **`.lsp.json`** component in the plugin system.

This is distinct from the cclsp third-party tool (which wraps LSP as MCP tools). The native Claude Code approach is preferred because it integrates directly with the agent's file editing loop: after every `Write` or `Edit` tool call, Claude Code queries the LSP server for diagnostics and injects them into its context automatically.

### 4.2 Plugin structure for LSP delivery

A Claude Code plugin is a directory installed via `claude plugin install <path>` or the `/plugin` marketplace. The relevant files are:

```
hoverfly-lsp-claude/
├── plugin.json          # Plugin manifest
└── .lsp.json            # LSP server configuration
```

**`plugin.json`:**

```json
{
  "name": "hoverfly-lsp",
  "description": "Hoverfly simulation file diagnostics and intelligence for Claude Code",
  "version": "0.1.0"
}
```

**`.lsp.json`:**

```json
{
  "hoverfly-lsp": {
    "command": "hoverfly-lsp",
    "args": ["--stdio"],
    "extensionToLanguage": {
      ".hoverfly.json": "hoverfly-simulation",
      ".json": "json"
    },
    "diagnostics": true,
    "transport": "stdio",
    "initializationOptions": {
      "hoverflyLsp": {
        "contentDetection": true
      }
    },
    "startupTimeout": 10000,
    "maxRestarts": 3
  }
}
```

**Important caveat on `extensionToLanguage`**: The keys are file extensions. For `*.hoverfly.json` files, the extension as seen by the filesystem is `.json`, not `.hoverfly.json`. This means the `extensionToLanguage` map cannot distinguish `foo.hoverfly.json` from `foo.json` based on extension alone. The workaround is:

1. Use `.json` as the key and rely on **server-side content detection** (the server reads the file and returns empty results for non-Hoverfly JSON — see Section 5.4).
2. Promote the `.hoverfly.json` filename convention and document that users should use that suffix.
3. Use a unique extension like `.hvsim` and promote that as the canonical extension (see Section 7).

**`.lsp.json` field reference:**

| Field                   | Required | Description                                      |
| ----------------------- | -------- | ------------------------------------------------ |
| `command`               | Yes      | LSP binary name (must be in `$PATH`)             |
| `args`                  | No       | Arguments; `["--stdio"]` for stdio transport     |
| `extensionToLanguage`   | Yes      | Maps file extensions to LSP `languageId` strings |
| `transport`             | No       | `stdio` (default) or `socket`                    |
| `diagnostics`           | No       | Push diagnostics after edits (default `true`)    |
| `env`                   | No       | Environment variables                            |
| `initializationOptions` | No       | Passed to server on `initialize`                 |
| `settings`              | No       | Sent via `workspace/didChangeConfiguration`      |
| `workspaceFolder`       | No       | Override workspace root path                     |
| `startupTimeout`        | No       | Milliseconds to wait for server startup          |
| `maxRestarts`           | No       | Max restart attempts before giving up            |

### 4.3 Installing the plugin

```bash
# Install globally (available in all projects)
claude plugin install ./hoverfly-lsp-claude --scope user

# Install for current project only (checked into .claude/settings.json)
claude plugin install ./hoverfly-lsp-claude --scope project

# Install from npm (once published)
claude plugin install @hoverfly/lsp-claude

# Verify installation
claude plugin list
```

### 4.4 What LSP features Claude Code uses

Claude Code's native LSP integration provides:

- **Instant diagnostics** — errors/warnings injected into context after each `Write`/`Edit`
- **Code navigation** — go to definition, find references (used during codebase exploration)
- **Hover information** — type and documentation information

The binary must be separately installed. If `hoverfly-lsp` is not in PATH, Claude Code logs `Executable not found in $PATH` in the `/plugin` Errors tab.

### 4.5 Alternative: cclsp (third-party MCP bridge)

The community tool [cclsp](https://github.com/ktnyt/cclsp) wraps any LSP server as an MCP server, exposing LSP operations as MCP tools. This predates the native LSP plugin system. For hoverfly-lsp, prefer the native `.lsp.json` approach.

If you need cclsp compatibility for older Claude Code versions, the config is:

**`.claude/cclsp.json`:**

```json
{
  "servers": [
    {
      "extensions": ["json"],
      "command": ["hoverfly-lsp", "--stdio"],
      "rootDir": "."
    }
  ]
}
```

**`.mcp.json` (project root):**

```json
{
  "mcpServers": {
    "cclsp": {
      "command": "cclsp",
      "env": {
        "CCLSP_CONFIG_PATH": "${workspaceFolder}/.claude/cclsp.json"
      }
    }
  }
}
```

cclsp exposes these MCP tools: `find_definition`, `find_references`, `rename_symbol`, `rename_symbol_strict`, `get_diagnostics`, `restart_server`.

---

## 5. The Critical Problem: File Targeting

### 5.1 Why this is hard

Hoverfly simulations are plain `.json` files. Every strategy that activates on `.json` extension will also activate on `package.json`, `tsconfig.json`, `data.json`, etc. This must be avoided because:

- The LSP server would be called for every JSON file, causing unnecessary overhead.
- The server would return empty/null responses for non-Hoverfly files, potentially confusing other tools.
- Users would see Hoverfly diagnostics appearing on unrelated JSON files.

### 5.2 What analogous tools do

| Tool                                   | File targeting strategy                                                                                                                                                     |
| -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Azure Pipelines** (VS Code)          | Registers new language ID `azure-pipelines`; uses `filenamePatterns`: `azure-pipelines.{yml,yaml}`, `**/azure-pipelines/**/*.{yml,yaml}`, etc. No content sniffing.         |
| **Tailwind CSS** (VS Code)             | Activates on `css`, `html`, `javascript`, `typescript` language IDs — broad but appropriate for its use case. Uses workspace config file (`tailwind.config.js`) as trigger. |
| **turbo.json** (VS Code / JSON Schema) | Relies on exact filename `turbo.json`; publishes schema to SchemaStore with `"fileMatch": ["turbo.json"]`. No custom language ID needed.                                    |
| **package.json** (VS Code built-in)    | Built-in special case using exact filename match.                                                                                                                           |
| **Docker** (VS Code)                   | Registers `dockerfile` language ID; `filenamePatterns: ["Dockerfile", "Dockerfile.*", "*.dockerfile"]`.                                                                     |

**Pattern**: The best tools define a **new language ID** (not reuse an existing one) and use **filename conventions** to activate reliably.

### 5.3 Per-editor targeting strategy

#### VS Code

Use `contributes.languages` with `filenamePatterns` to assign the `hoverfly-simulation` language ID. The `documentSelector` in the extension uses `{ language: 'hoverfly-simulation' }`. This is robust and has no overhead on non-Hoverfly JSON files.

```json
"filenamePatterns": [
  "*.hoverfly.json",
  "**/hoverfly/**/*.json",
  "**/.hoverfly/**/*.json",
  "hoverfly-simulation.json",
  "simulation.json"
]
```

#### Zed

Use `path_suffixes` in `languages/hoverfly-simulation/config.toml`. Zed matches suffixes against the full filename (so `"hoverfly.json"` matches `api.hoverfly.json`). For directory-based matching (`hoverfly/simulation.json`), the Rust `language_server_command` can inspect `worktree` paths, but this requires custom logic beyond `path_suffixes`.

```toml
path_suffixes = ["hoverfly.json", "hoverfly-simulation.json"]
```

Users can also configure `file_types` in `settings.json`:

```json
"file_types": {
  "Hoverfly Simulation": ["*.hoverfly.json"]
}
```

#### IntelliJ / LSP4IJ

Use the **File name patterns** mapping in LSP4IJ settings. Enter patterns like `*.hoverfly.json` and `simulation.json`. The LSP4IJ plugin applies these server-side, so only matching files trigger the language server.

#### Claude Code

The `extensionToLanguage` map in `.lsp.json` operates on file extensions only (`.json`). To avoid activating on all JSON, implement **server-side content detection** (see 5.4) or use a custom extension like `.hvsim`.

### 5.4 Server-side content detection (bail-out strategy)

When filename-based targeting is ambiguous (especially in Claude Code), the server must detect non-Hoverfly JSON documents and respond politely. The canonical approach:

**On `textDocument/didOpen`:**

```typescript
// In the LSP server's textDocument/didOpen handler
function isHoverflySimulation(content: string): boolean {
  try {
    const doc = JSON.parse(content);
    return (
      typeof doc === "object" &&
      doc !== null &&
      typeof doc.data === "object" &&
      Array.isArray(doc.data?.pairs) &&
      typeof doc.meta === "object" &&
      typeof doc.meta?.schemaVersion === "string" &&
      doc.meta.schemaVersion.startsWith("v")
    );
  } catch {
    return false;
  }
}

// Store which documents are Hoverfly simulations
const hoverflyDocuments = new Set<string>();

connection.onDidOpenTextDocument((params) => {
  const uri = params.textDocument.uri;
  if (isHoverflySimulation(params.textDocument.text)) {
    hoverflyDocuments.add(uri);
  }
  // For non-Hoverfly files, do nothing — don't publish diagnostics
});

connection.onDidCloseTextDocument((params) => {
  hoverflyDocuments.delete(params.textDocument.uri);
});
```

**On completion/hover/diagnostics requests** — check `hoverflyDocuments.has(uri)` and return `null` / empty arrays if not a Hoverfly file.

The unique fingerprint of a Hoverfly simulation is:

- Root object with `data` and `meta` keys
- `data.pairs` is an array
- `meta.schemaVersion` is a string matching `/^v\d+$/` (e.g., `"v5"`)
- `meta.hoverflyVersion` optionally present

### 5.5 Glob pattern syntax reference

| Editor                             | Pattern              | Notes                                      |
| ---------------------------------- | -------------------- | ------------------------------------------ |
| VS Code `filenamePatterns`         | `*.hoverfly.json`    | Glob applied to filename only (no path)    |
| VS Code `documentSelector.pattern` | `**/*.hoverfly.json` | Full path glob                             |
| VS Code `json.schemas.fileMatch`   | `*.hoverfly.json`    | Or with path: `/hoverfly/*.json`           |
| Zed `path_suffixes`                | `hoverfly.json`      | Suffix of full filename; no wildcards      |
| Zed `file_types`                   | `*.hoverfly.json`    | Glob with wildcards supported              |
| LSP4IJ File name patterns          | `*.hoverfly.json`    | Standard glob; semicolon-separated list    |
| IntelliJ native `isSupportedFile`  | N/A                  | Kotlin code, arbitrary logic               |
| SchemaStore `fileMatch`            | `*.hoverfly.json`    | `*` and `**` wildcards; `!` for exclusions |

### 5.6 Content-sniffing via `$schema` property

A cleaner zero-config alternative is to recommend that all Hoverfly simulation files include:

```json
{
  "$schema": "https://raw.githubusercontent.com/your-org/hoverfly-lsp/main/schema/hoverfly-simulation.json",
  "data": { ... },
  "meta": { ... }
}
```

VS Code's built-in JSON language server automatically applies schema validation when a `$schema` property is present, without any extension. The LSP server can also check for this property as part of its content detection logic.

---

## 6. JSON Schema as a Zero-Install Fallback

### 6.1 Purpose

A plain JSON Schema gives basic validation and completion in any editor that supports JSON Schema (VS Code, IntelliJ, Neovim with nvim-lspconfig + vscode-json-languageserver, etc.) without requiring users to install anything beyond the editor itself.

### 6.2 Schema structure (hoverfly-simulation.schema.json)

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "$id": "https://raw.githubusercontent.com/your-org/hoverfly-lsp/main/schema/hoverfly-simulation.json",
  "title": "Hoverfly Simulation",
  "description": "Hoverfly v5 simulation file — describes request matchers and mocked responses",
  "type": "object",
  "required": ["data", "meta"],
  "additionalProperties": false,
  "properties": {
    "$schema": {
      "type": "string",
      "description": "JSON Schema reference (optional, used by editors for validation)"
    },
    "data": {
      "type": "object",
      "description": "Simulation data containing request-response pairs",
      "required": ["pairs"],
      "properties": {
        "pairs": {
          "type": "array",
          "description": "Array of request matcher to response mappings",
          "items": { "$ref": "#/definitions/pair" }
        },
        "globalActions": { "$ref": "#/definitions/globalActions" }
      }
    },
    "meta": {
      "type": "object",
      "description": "Simulation metadata",
      "required": ["schemaVersion"],
      "properties": {
        "schemaVersion": {
          "type": "string",
          "pattern": "^v\\d+$",
          "description": "Hoverfly simulation schema version (e.g. \"v5\")"
        },
        "hoverflyVersion": {
          "type": "string",
          "description": "Hoverfly version that exported this simulation"
        },
        "timeExported": {
          "type": "string",
          "format": "date-time"
        }
      }
    }
  },
  "definitions": {
    "pair": {
      "type": "object",
      "required": ["request", "response"],
      "properties": {
        "request": { "$ref": "#/definitions/requestMatchers" },
        "response": { "$ref": "#/definitions/response" }
      }
    },
    "matcherValue": {
      "oneOf": [
        {
          "type": "object",
          "properties": {
            "matcher": {
              "type": "string",
              "enum": ["exact", "glob", "regex", "xpath", "jsonpath", "jwt", "array"]
            },
            "value": {}
          }
        },
        { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } }
      ]
    },
    "requestMatchers": {
      "type": "object",
      "properties": {
        "body": { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } },
        "destination": { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } },
        "headers": {
          "type": "object",
          "additionalProperties": {
            "type": "array",
            "items": { "$ref": "#/definitions/matcherValue" }
          }
        },
        "method": { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } },
        "path": { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } },
        "query": { "type": "object" },
        "requiresState": { "type": "object" },
        "scheme": { "type": "array", "items": { "$ref": "#/definitions/matcherValue" } }
      }
    },
    "response": {
      "type": "object",
      "required": ["status"],
      "properties": {
        "status": { "type": "integer", "minimum": 100, "maximum": 599 },
        "body": { "type": "string" },
        "bodyFile": { "type": "string" },
        "headers": {
          "type": "object",
          "additionalProperties": { "type": "array", "items": { "type": "string" } }
        },
        "encodedBody": { "type": "boolean" },
        "templated": { "type": "boolean" },
        "transitionsState": { "type": "object" },
        "removesState": { "type": "array", "items": { "type": "string" } },
        "fixedDelay": { "type": "integer", "description": "Fixed delay in milliseconds" },
        "logNormalDelay": { "$ref": "#/definitions/logNormalDelay" }
      }
    },
    "logNormalDelay": {
      "type": "object",
      "properties": {
        "min": { "type": "integer" },
        "max": { "type": "integer" },
        "mean": { "type": "integer" },
        "median": { "type": "integer" }
      }
    },
    "globalActions": {
      "type": "object",
      "properties": {
        "delays": {
          "type": "array",
          "items": {
            "type": "object",
            "properties": {
              "urlPattern": { "type": "string" },
              "httpMethod": { "type": "string" },
              "delay": { "type": "integer" }
            }
          }
        }
      }
    }
  }
}
```

### 6.3 VS Code — zero-install activation via `json.schemas`

Users can add to their workspace `.vscode/settings.json` without installing any extension:

```json
{
  "json.schemas": [
    {
      "fileMatch": ["*.hoverfly.json", "hoverfly-simulation.json", "**/hoverfly/**/*.json"],
      "url": "https://raw.githubusercontent.com/your-org/hoverfly-lsp/main/schema/hoverfly-simulation.json"
    }
  ]
}
```

This activates VS Code's built-in JSON language server schema validation and completion — no extension required.

### 6.4 Submitting to SchemaStore

SchemaStore is consumed automatically by VS Code (via the built-in JSON language server), IntelliJ, Neovim, and many other editors. Submitting here gives zero-install validation everywhere.

**Submit via PR to [github.com/SchemaStore/schemastore](https://github.com/SchemaStore/schemastore):**

1. Add your schema JSON to `src/schemas/json/hoverfly-simulation.json`.
2. Add an entry to `src/api/json/catalog.json`:

```json
{
  "name": "Hoverfly Simulation",
  "description": "Hoverfly API simulation file (request matchers and mocked responses)",
  "fileMatch": ["*.hoverfly.json", "hoverfly-simulation.json"],
  "url": "https://json.schemastore.org/hoverfly-simulation.json"
}
```

**Notes:**

- The `url` field must be an absolute URI. Once merged, the schema is mirrored to `https://json.schemastore.org/<name>.json`.
- `fileMatch` is optional for schemas that have no filename convention, but since we promote `*.hoverfly.json`, include it.
- `simulation.json` should NOT be in `fileMatch` for SchemaStore — it is too generic and will collide with other tools that use `simulation.json` as a filename.

### 6.5 Enabling `$schema` self-declaration

Promote adding `"$schema"` to every simulation file:

```json
{
  "$schema": "https://json.schemastore.org/hoverfly-simulation.json",
  "data": { "pairs": [] },
  "meta": { "schemaVersion": "v5" }
}
```

VS Code's built-in JSON support auto-applies the schema when `$schema` is present, regardless of `json.schemas` settings or any extension installation. This is the most reliable zero-install experience.

### 6.6 IntelliJ — zero-install JSON Schema

IntelliJ IDEA (all editions) has built-in JSON Schema support. Users can add `Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings`:

- Schema file or URL: `https://json.schemastore.org/hoverfly-simulation.json`
- File path patterns: `*.hoverfly.json`

Or via SchemaStore auto-sync (IntelliJ automatically pulls from SchemaStore catalog for known file patterns).

---

## 7. Recommended Canonical File Naming Convention

### 7.1 Recommendation

Promote **`*.hoverfly.json`** as the canonical extension for Hoverfly simulation files.

```
api-service.hoverfly.json
user-service.hoverfly.json
simulation.hoverfly.json
```

**Rationale:**

- The `.hoverfly.json` double-extension pattern is unambiguous and widely understood (cf. `.test.ts`, `.spec.js`, `.config.ts`).
- Every editor can target it with simple glob `*.hoverfly.json` without path-based heuristics.
- The Hoverfly CLI should be updated (or documented) to export simulations with this suffix by default: `hoverctl export api-service.hoverfly.json`.
- SchemaStore can safely include `*.hoverfly.json` in `fileMatch` without false positives.
- The double-extension is unambiguous to the LSP server's content detector (even if it still performs content sniffing as defense-in-depth).

### 7.2 Secondary naming patterns to support

These should be supported but not promoted as primary:

| Pattern                             | Context                                                     |
| ----------------------------------- | ----------------------------------------------------------- |
| `simulation.json`                   | Legacy Hoverfly default; common in existing projects        |
| `hoverfly-simulation.json`          | Verbose but unambiguous                                     |
| `**/hoverfly/**/*.json`             | Directory-scoped convention (all JSON in a `hoverfly/` dir) |
| `**/hoverfly-simulations/**/*.json` | Team convention for simulation directories                  |

### 7.3 What NOT to use

- `simulation.json` as the only naming convention — too generic, will collide.
- `*.json` with only directory-based detection — difficult to express in all editors and creates false positives in monorepos.
- A completely custom extension like `.hvsim` — while cleaner for tooling, it creates friction (editors won't syntax-highlight it, no JSON formatter will run on it without extra config). Only adopt if the ecosystem demands it.

---

## 8. Summary and Decision Table

### 8.1 Editor integration quick reference

| Editor            | Config file(s)                                | Key dependency                          | File targeting mechanism                                   | Install complexity                         |
| ----------------- | --------------------------------------------- | --------------------------------------- | ---------------------------------------------------------- | ------------------------------------------ |
| VS Code           | `package.json`, `extension.ts`                | `vscode-languageclient@10.0.0`          | `filenamePatterns` + new language ID `hoverfly-simulation` | Publish to VS Marketplace                  |
| Zed               | `extension.toml`, `src/lib.rs`, `config.toml` | `zed_extension_api` crate (Rust + WASM) | `path_suffixes` in config.toml                             | Publish to Zed extension registry          |
| IntelliJ (user)   | LSP4IJ GUI settings                           | LSP4IJ plugin (marketplace)             | File name pattern mapping in GUI                           | User installs LSP4IJ + configures manually |
| IntelliJ (plugin) | `plugin.xml`, Kotlin code                     | `com.intellij.modules.lsp` (2023.2+)    | `isSupportedFile` Kotlin method                            | Publish to JetBrains Marketplace           |
| Claude Code       | `plugin.json`, `.lsp.json`                    | None (native feature)                   | `extensionToLanguage` + server-side content detection      | `claude plugin install`                    |

### 8.2 File targeting strategy by editor

| Editor          | Primary strategy                                                   | Secondary/fallback                      |
| --------------- | ------------------------------------------------------------------ | --------------------------------------- |
| VS Code         | `filenamePatterns: ["*.hoverfly.json"]` in `contributes.languages` | `$schema` property in file              |
| Zed             | `path_suffixes: ["hoverfly.json"]` in config.toml                  | `file_types` in settings.json           |
| IntelliJ/LSP4IJ | `*.hoverfly.json` pattern in Mappings tab                          | JSON Schema Mappings in IDE settings    |
| IntelliJ native | `isSupportedFile` checks `.endsWith(".hoverfly.json")`             | N/A                                     |
| Claude Code     | Server-side content detection + `.hoverfly.json` convention        | cclsp MCP bridge (legacy)               |
| Any editor      | `$schema` property in file → SchemaStore                           | Manual `json.schemas` workspace setting |

### 8.3 Zero-install fallback coverage

```
User has only VS Code (no extension):
  → Add to .vscode/settings.json: json.schemas with fileMatch "*.hoverfly.json"
  → OR: add "$schema" to simulation files → auto-detected

User has only IntelliJ (no plugin):
  → Add JSON Schema Mapping in IDE settings
  → OR: add "$schema" to simulation files → auto-detected (SchemaStore)

Anyone (SchemaStore):
  → Submit schema to SchemaStore → all supporting editors get it automatically
  → Promotion: always generate simulation files with "$schema" property
```

### 8.4 Recommended implementation order

1. **Ship JSON Schema to SchemaStore** — immediate value for all editor users, zero code.
2. **VS Code extension** — largest user base; use `vscode-languageclient@10.0.0`, `hoverfly-simulation` language ID, `filenamePatterns: ["*.hoverfly.json"]`.
3. **Claude Code plugin** — critical for agentic workflows; use native `.lsp.json` plugin format.
4. **IntelliJ via LSP4IJ** — document the user-defined server config; no IntelliJ plugin code required initially.
5. **Zed extension** — growing editor; requires Rust/WASM compilation but the API is stable.
6. **IntelliJ native plugin** — only needed if targeting the JetBrains Marketplace; requires IntelliJ 2023.2+.

---

## References

- [VS Code Language Server Extension Guide](https://code.visualstudio.com/api/language-extensions/language-server-extension-guide)
- [VS Code Document Selectors](https://code.visualstudio.com/api/references/document-selector)
- [VS Code Contribution Points — contributes.languages](https://code.visualstudio.com/api/references/contribution-points)
- [vscode-languageclient npm package (v10.0.0)](https://www.npmjs.com/package/vscode-languageclient)
- [microsoft/vscode-languageserver-node — releases](https://github.com/microsoft/vscode-languageserver-node)
- [azure-pipelines-vscode package.json (filenamePatterns reference)](https://github.com/microsoft/azure-pipelines-vscode)
- [Zed Language Extensions documentation](https://zed.dev/docs/extensions/languages)
- [Zed Developing Extensions documentation](https://zed.dev/docs/extensions/developing-extensions)
- [Zed Configuring Languages](https://zed.dev/docs/configuring-languages)
- [zed_extension_api crate on docs.rs](https://docs.rs/zed_extension_api)
- [redhat-developer/lsp4ij GitHub](https://github.com/redhat-developer/lsp4ij)
- [LSP4IJ on JetBrains Marketplace](https://plugins.jetbrains.com/plugin/23257-lsp4ij)
- [LSP4IJ User-Defined Language Server docs](https://github.com/redhat-developer/lsp4ij/blob/main/docs/UserDefinedLanguageServer.md)
- [JetBrains: LSP API available to all IntelliJ users (2025)](https://blog.jetbrains.com/platform/2025/09/the-lsp-api-is-now-available-to-all-intellij-idea-users-and-plugin-developers/)
- [IntelliJ Platform LSP documentation](https://plugins.jetbrains.com/docs/intellij/language-server-protocol.html)
- [Claude Code Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Claude Code MCP documentation](https://code.claude.com/docs/en/mcp)
- [ktnyt/cclsp — Claude Code LSP bridge](https://github.com/ktnyt/cclsp)
- [JSON Schema Store](https://www.schemastore.org/)
- [VS Code JSON editing documentation](https://code.visualstudio.com/docs/languages/json)
- [Hoverfly Simulation Schema reference](https://docs.hoverfly.io/en/latest/pages/reference/simulationschema.html)
