# 15 — Exposing hoverfly-lsp to AI Coding Agents (Patterns & Recommendation)

**Date:** 2026-06-11
**Question:** Do we build one integration per AI coding agent (OpenCode, Codex, Claude Code, Gemini CLI, …), or is there a better pattern (one MCP bridge serving all)?

---

## Executive Summary

**The market has converged on the exact pattern we already ship.** In 2026 the major coding-agent CLIs consume language tooling the same way Claude Code does: a small JSON config block that points at **any stdio LSP binary** and maps file extensions to language IDs. The field names differ cosmetically across agents but the shape is identical — `command` + `args` + an extension→language map. Diagnostics are the primary signal every agent wants; navigation (definition/references/hover) is secondary.

**Consequences for hoverfly-lsp:**

1. We do **not** need one shipped artifact per agent. Our existing stdio server (`hoverfly-lsp --stdio`) is the integration. Each agent just needs a ~5-line config snippet pointing at it.
2. The right deliverable for most agents is a **README recipe**, not a new file in `editors/`. The only shipped plugin worth keeping as a directory is the Claude Code one (it bundles a binary + plugin manifest and is installable via marketplace).
3. An **MCP bridge artifact is NOT justified now.** Mature generic LSP↔MCP bridges already exist (isaacphi/mcp-language-server and several others); any MCP-only agent can point one of them at our binary with zero work from us. Shipping our own `hoverfly-lsp-mcp` wrapper would duplicate well-maintained OSS for a shrinking gap (agents are adding native LSP config faster than MCP-only holdouts remain).
4. **Highest-leverage action:** add one "AI coding agents" section to the README with copy-paste config recipes for the four native-LSP CLIs (Claude Code, Copilot CLI, OpenCode, Codex-via-codex-lsp) plus one generic MCP-bridge recipe. That single doc change covers the entire agent landscape at near-zero maintenance.

---

## 1. Inventory: how each agent consumes language tooling (2026)

### Claude Code — native `.lsp.json` (we have this; NOT superseded)

- Native LSP plugin system via `.lsp.json` (top-level server key → `command`, `args`, `extensionToLanguage`). Diagnostics auto-injected into context after every edit; also exposes definition/references/hover/symbols/implementation/call-hierarchy.
- **Confirmed current, not superseded:** Claude Code 2.1.50+ supports the modern fields (`startupTimeout`, etc.); latest release cited 2.1.52. LSP is gated behind `ENABLE_LSP_TOOL` and configured via plugins; `.lsp.json` remains the documented mechanism for languages not in the marketplace. There is an active community marketplace (Piebald-AI/claude-code-lsps) shipping LSP plugins the same way.
- **We already ship:** `editors/claude-code/.lsp.json` + `.claude-plugin/plugin.json` + `bin/launch.cjs`. Keep as-is.
- Sources:
  - https://code.claude.com/docs/en/plugins-reference.md
  - https://code.claude.com/docs/en/discover-plugins.md
  - https://github.com/Piebald-AI/claude-code-lsps
  - https://news.ycombinator.com/item?id=46355165 (Claude Code gets native LSP support)

### OpenCode (sst/opencode) — native `lsp` section in `opencode.json`

- First-class LSP integration. Built-in servers for popular languages; custom servers declared under the `lsp` key. **Consumes diagnostics as agent feedback** (opens file → matches extension → starts matching LSP → feeds diagnostics to the agent).
- Config shape (verbatim from docs):
  ```json
  {
    "$schema": "https://opencode.ai/config.json",
    "lsp": {
      "hoverfly": {
        "command": ["hoverfly-lsp", "--stdio"],
        "extensions": [".json"]
      }
    }
  }
  ```
  Also supports `env`, `initialization` (init options), and `disabled`.
- **Effort for us:** README recipe only (5 lines). Note: like Claude Code, our `.json` extension is broad — server-side fingerprinting is what keeps us from false-firing on non-Hoverfly JSON.
- Sources:
  - https://opencode.ai/docs/lsp/
  - https://deepwiki.com/sst/opencode/5.4-language-server-integration

### OpenAI Codex CLI — no native LSP yet; LSP-via-MCP + post-edit hook plugins

- As of ~v0.125, **no built-in LSP**; it's one of the most-upvoted open feature requests (issues #8745, #14799). The expected near-term path is project-scoped MCP / `.codex/config.toml`.
- Mature community solution: **`code-yeongyu/codex-lsp`** — a generic, language-agnostic Codex plugin that (a) runs **post-edit diagnostics hooks** after `apply_patch`/`write`/`edit`/`multiedit` and returns blocking feedback on errors, and (b) exposes MCP tools (`lsp.diagnostics`, `lsp.goto_definition`, `lsp.find_references`, `lsp.symbols`, `lsp.prepare_rename`, `lsp.rename`). Works with **any stdio LSP**. Config:
  ```json
  {
    "lsp": {
      "hoverfly": {
        "command": ["hoverfly-lsp", "--stdio"],
        "extensions": [".json"]
      }
    }
  }
  ```
  at `.codex/lsp-client.json` (project) or `~/.codex/lsp-client.json`.
- **Effort for us:** README recipe pointing users at codex-lsp + the snippet above. Zero shipped artifacts.
- Sources:
  - https://github.com/openai/codex/issues/8745, https://github.com/openai/codex/issues/14799
  - https://github.com/code-yeongyu/codex-lsp
  - https://developers.openai.com/codex/mcp
  - https://codex.danielvaughan.com/2026/04/25/codex-cli-lsp-integration-language-server-semantic-code-intelligence/

### Gemini CLI — no native LSP; MCP-capable; "use the IDE's LSP" direction

- No native LSP server config. Open feature requests (#2465, #6690); the maintainer-favored direction is to reuse the LSP already running in the user's IDE rather than spawn its own. Gemini CLI **does** support MCP servers.
- Reachable today via a **generic LSP→MCP bridge** (LSP Bridge, agent-lsp, etc.) pointed at our binary, or — when the user runs Gemini CLI inside an IDE — via our existing IDE extensions (VS Code/Zed) feeding the IDE's diagnostics.
- **Effort for us:** covered by the generic MCP-bridge recipe; no Gemini-specific artifact.
- Sources:
  - https://github.com/google-gemini/gemini-cli/issues/2465, https://github.com/google-gemini/gemini-cli/issues/6690
  - https://geminicli.com/docs/tools/mcp-server/

### GitHub Copilot CLI — native LSP config + "LSP Setup skill" (notable)

- **Has native LSP support.** Configured via `~/.copilot/lsp-config.json` (user) or `lsp.json` / `.github/lsp.json` (repo). Schema is an `lspServers` object — nearly identical to Claude Code's `.lsp.json` (`command`, `args`, `fileExtensions` map). Does **not** bundle servers (install separately). Consumes definitions, references, hover, type resolution across deps, and diagnostics.
  ```json
  {
    "lspServers": {
      "hoverfly": {
        "command": "hoverfly-lsp",
        "args": ["--stdio"],
        "fileExtensions": { ".json": "json" }
      }
    }
  }
  ```
- **"LSP Setup skill" (June 2026):** an agent skill that auto-installs/configures LSP servers for 14 languages, and for unmapped languages "will search for an appropriate server and walk you through manual configuration." This is the **emerging "agent skill ships LSP config" pattern** — and it's the most plausible future distribution channel for us on Copilot (a hoverfly LSP-setup skill), but not needed now.
- **Effort for us:** README recipe (5 lines). Mirrors our Claude Code config almost exactly.
- Sources:
  - https://github.blog/ai-and-ml/github-copilot/give-github-copilot-cli-real-code-intelligence-with-language-servers/
  - https://github.com/github/copilot-cli
  - https://docs.github.com/en/copilot/concepts/context/mcp

### Cursor / Windsurf / VS Code forks — run VS Code extensions, BUT via Open VSX

- These forks run standard VS Code extensions, so **our `.vsix` covers them** functionally. **Critical caveat:** they cannot legally use the Microsoft Marketplace; they default to **Open VSX**. To be one-click installable in Cursor/Windsurf/VSCodium, we must **publish to Open VSX**, not only the MS Marketplace. (Users can side-load a `.vsix` manually, but that's a worse UX and breaks auto-update.)
- Their agent modes (Cursor agent, Windsurf Cascade) read diagnostics from the running VS Code-host LSP — so once our extension is installed, the agent gets Hoverfly diagnostics for free.
- **Effort for us:** one publishing step — add Open VSX publish to the VS Code extension release. No new editor directory.
- Sources:
  - https://forum.cursor.com/t/extension-marketplace-changes-transition-to-openvsx/109138
  - https://thehackernews.com/2026/01/vs-code-forks-recommend-missing.html (Open VSX is the fork default)

### Zed agent panel — partial; manual `@diagnostics`, no programmatic pull (yet)

- Zed's editor already runs our LSP (we ship the Zed extension), so diagnostics render in the editor/Problems panel.
- **But** the Agent Panel / external ACP agents (Claude Code-in-Zed, Gemini, Codex via ACP) currently **cannot programmatically read project diagnostics between turns** — the user must manually inject them via the `@diagnostics` mention (open discussion #58546). So our Zed extension covers the _human_ loop and the manual `@diagnostics` path, but not fully-automated agent consumption. This is a Zed-side gap, not something we can fix.
- **Effort for us:** nothing beyond the Zed extension we already ship; optionally a README note that users `@diagnostics`-mention Hoverfly files into the agent.
- Sources:
  - https://github.com/zed-industries/zed/discussions/58546
  - https://zed.dev/docs/ai/agent-panel

### Aider — no LSP; uses its own linters

- Aider deliberately does **not** integrate LSP; it builds its own repo map and runs built-in/external linters on edit. There is no LSP hook to target. The only way Aider would surface Hoverfly errors is via its `--lint-cmd` pointing at a Hoverfly CLI validator (out of scope for an LSP).
- **Effort for us:** none. Document as "not supported (Aider has no LSP)".
- Sources:
  - https://aider.chat/docs/usage/lint-test.html
  - https://github.com/aider-ai/aider

### Qwen Code — native LSP (bonus data point)

- Qwen Code added native LSP support in early 2026 (same config-pointing-at-a-binary pattern). Reinforces the convergence thesis; covered by the same recipe approach.
- Source: https://qwenlm.github.io/qwen-code-docs/en/users/features/lsp/

---

## 2. The MCP bridge pattern — survey & verdict

Generic LSP-over-MCP bridges are **mature and plentiful** in 2026. They proxy any stdio LSP and expose semantic tools (`diagnostics`, `definition`, `references`, `hover`, `rename`, sometimes `edit`) to any MCP client.

| Bridge                                                             | Lang    | Notes                                                                                                                                     |
| :----------------------------------------------------------------- | :------ | :---------------------------------------------------------------------------------------------------------------------------------------- |
| **isaacphi/mcp-language-server**                                   | Go      | Most-referenced. Proxies any stdio LSP; tools: definition, references, rename, diagnostics, hover, edit. Widely listed in MCP registries. |
| **agent-lsp** (blackwell-systems)                                  | —       | Stateful warm-LSP runtime, 50+ tools / 22 skills, 30+ languages; routes by extension. Heaviest/most featureful.                           |
| **rockerBOO/mcp-lsp-bridge**                                       | —       | `lsp_config.json`, 20+ languages, `--config` flag.                                                                                        |
| **bug-ops/mcpls**                                                  | Rust    | Universal, LSP 3.17-compliant, TOML `language_id`/`command`/`args`/`file_patterns`.                                                       |
| **Tritlo/lsp-mcp**, **mickeyinfoshan/lsp-mcp**, **@mseep/lsp-mcp** | various | Smaller/per-language variants.                                                                                                            |

**Verdict:** One generic bridge **+ our documented config is enough** for any agent that speaks MCP but not LSP (Gemini CLI today; any future MCP-only agent). We do **not** need to ship a `hoverfly-lsp-mcp` wrapper:

- These bridges already accept "run this stdio binary on these extensions" — our binary drops in unchanged.
- Building/maintaining our own bridge would duplicate actively-maintained OSS to close a **shrinking** gap (Copilot CLI, OpenCode, Codex-via-plugin, Qwen already do native LSP; the MCP-only set is mostly Gemini CLI).
- Our server-side Hoverfly fingerprinting (decline non-Hoverfly `.json`) works through a bridge exactly as through a native client, so the broad `.json` extension is safe.

**If** we ever want a turn-key MCP story, the cheapest version is a README recipe naming `isaacphi/mcp-language-server` with our binary path — not a shipped artifact.

Sources: https://github.com/isaacphi/mcp-language-server · https://glama.ai/mcp/servers/blackwell-systems/agent-lsp · https://github.com/rockerBOO/mcp-lsp-bridge · https://github.com/bug-ops/mcpls · https://mcpservers.org/servers/Tritlo/lsp-mcp

---

## 3. Ecosystem direction

- **Native LSP-in-CLI is the winning standard, not MCP-wrapping.** Through 2026 the agent CLIs added _native_ LSP config (Copilot CLI, OpenCode, Qwen, Codex via plugin) rather than mandating MCP. The configs are **cosmetically different but structurally identical**: a server id → `command`/`args` → extension→language map. This is essentially the Claude Code `.lsp.json` schema, re-implemented per agent.
- **Diagnostics is the killer feature.** Every source ranks diagnostics first (post-edit error feedback into context); definition/references/hover second; completion is explicitly _not_ prioritized by agents. hoverfly-lsp's diagnostics-heavy design is exactly aligned.
- **"Agent skills that ship LSP config" is the newest distribution vector.** GitHub's "LSP Setup skill" (June 2026) and Claude's plugin/skill model point at a future where a tool ships a _skill_ that installs its language server. Worth watching, premature to build.
- **MCP governance solidifying:** MCP was donated to the Agentic AI Foundation (Linux Foundation) in Dec 2025 — so MCP bridges are a stable long-term fallback, just not the primary path.
- **Comparable LSP projects do little agent-specific work.** Biome only has _community/RFC_ MCP servers (biomejs/biome #6017, #8705; unofficial RyuzakiShinji/biome-mcp-server); no first-party agent integration. ruff/taplo/typescript-language-server ship a stdio binary and let agents/bridges point at it. **Industry norm = ship a good stdio LSP + document it; let agents/bridges adapt.** That validates our minimal-surface bias.

---

## 4. Recommendation matrix (compact)

| Agent                               | Recommended integration                                      | What we already have      | Effort               | Ship as file vs README       |
| :---------------------------------- | :----------------------------------------------------------- | :------------------------ | :------------------- | :--------------------------- |
| **Claude Code**                     | Native `.lsp.json` plugin (marketplace)                      | `editors/claude-code/` ✅ | done                 | **Keep shipped dir**         |
| **GitHub Copilot CLI**              | Native `lsp.json` (`lspServers`) recipe                      | reuse binary              | 5-line recipe        | **README**                   |
| **OpenCode**                        | Native `opencode.json` `lsp` recipe                          | reuse binary              | 5-line recipe        | **README**                   |
| **Codex CLI**                       | `code-yeongyu/codex-lsp` plugin + `lsp-client.json` recipe   | reuse binary              | recipe + link        | **README**                   |
| **Qwen Code**                       | Native LSP config recipe                                     | reuse binary              | 5-line recipe        | **README**                   |
| **Gemini CLI / any MCP-only agent** | Generic LSP→MCP bridge (isaacphi/mcp-language-server) recipe | reuse binary              | recipe + link        | **README**                   |
| **Cursor / Windsurf / VSCodium**    | Existing `.vsix`, **published to Open VSX**                  | `editors/vscode/` ✅      | add Open VSX publish | **publish step, no new dir** |
| **Zed agent panel**                 | Existing Zed ext; user `@diagnostics`-mentions               | `editors/zed/` ✅         | optional note        | **README note**              |
| **Aider**                           | Not supported (no LSP)                                       | —                         | none                 | **Document as N/A**          |

**Decision on shipped artifacts:** Keep exactly the four editor dirs we have. Add **zero** new agent-specific directories. Everything else is a README recipe. **No MCP wrapper now or at v0.1.0** — revisit only if an MCP-only agent becomes a top-requested target _and_ the existing bridges prove insufficient (unlikely).

**Docs should say:** one "Use with AI coding agents" README section containing (a) the four native-LSP recipes, (b) the one generic MCP-bridge recipe, (c) the Open VSX install note for VS Code forks, and (d) a one-liner that Aider/pure-grep agents aren't supported. Emphasize the shared mental model: _"hoverfly-lsp is a standard stdio LSP — point your agent's LSP/MCP config at `hoverfly-lsp --stdio` on `.json` files."_

---

## 5. Single highest-leverage action

**Add one "AI coding agents" section to the root README** with copy-paste config recipes for Claude Code (link to plugin), Copilot CLI, OpenCode, Codex (via codex-lsp), and one generic MCP-bridge recipe — plus the Open VSX publishing note for Cursor/Windsurf. This covers the entire 2026 agent landscape at ~one doc change and near-zero ongoing maintenance, and it captures the convergence reality: every agent just needs to be pointed at our existing stdio binary.

---

## Appendix: representative config snippets (recipe seeds)

**Copilot CLI** — `.github/lsp.json` or `~/.copilot/lsp-config.json`:

```json
{
  "lspServers": {
    "hoverfly": {
      "command": "hoverfly-lsp",
      "args": ["--stdio"],
      "fileExtensions": { ".json": "json" }
    }
  }
}
```

**OpenCode** — `opencode.json`:

```json
{ "lsp": { "hoverfly": { "command": ["hoverfly-lsp", "--stdio"], "extensions": [".json"] } } }
```

**Codex** (with `code-yeongyu/codex-lsp`) — `.codex/lsp-client.json`:

```json
{ "lsp": { "hoverfly": { "command": ["hoverfly-lsp", "--stdio"], "extensions": [".json"] } } }
```

**Generic MCP bridge** (isaacphi/mcp-language-server) for Gemini CLI / any MCP client — register an MCP server whose command launches the bridge with `--lsp "hoverfly-lsp --stdio"` against the workspace. (All bridges follow this shape; flags vary.)

> In every case the broad `.json` extension is safe because the server fingerprints content (`data` + `meta.schemaVersion` starts with `v`) and declines non-Hoverfly JSON — see research/09.
