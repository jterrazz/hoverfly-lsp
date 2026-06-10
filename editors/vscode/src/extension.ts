/*
 * VS Code extension entry point for Hoverfly simulation files.
 *
 * Responsibilities:
 *   - Resolve which `hoverfly-lsp` server to launch (see `server-resolution.ts`).
 *   - Start a `vscode-languageclient` (LSP 3.18 / v10) over stdio, launched as `node <module>
 *     --stdio` so the resolved path can be a plain `.js` entry without an executable bit.
 *   - Scope the client to Hoverfly documents (custom language id + a `*.hoverfly.json` fallback).
 *   - Surface the `hoverfly` config section to the server via workspace/configuration so settings
 *     like `hoverfly.registeredActions` reach the analyzer.
 *
 * Activation is automatic: `contributes.languages.filenamePatterns` assigns the
 * `hoverfly-simulation` language id to matching files, which activates the extension (VS Code
 * 1.74+), so `activationEvents` is left empty in package.json.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { type ExtensionContext, workspace } from "vscode";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

import { resolveServer } from "./server-resolution.js";

let client: LanguageClient | undefined;

/** Bundled server entry, relative to the extension root (populated by the build's copy step). */
const BUNDLED_SERVER_MODULE = join("server", "bin", "hoverfly-lsp.js");

export async function activate(context: ExtensionContext): Promise<void> {
  const config = workspace.getConfiguration("hoverfly");
  const resolved = resolveServer({
    configuredPath: config.get<string>("server.path"),
    workspaceRoot: workspace.workspaceFolders?.[0]?.uri.fsPath,
    bundledModule: context.asAbsolutePath(BUNDLED_SERVER_MODULE),
    exists: existsSync,
    join,
  });

  // Launch the server as a Node module over stdio. Using TransportKind.stdio keeps parity with the
  // `--stdio` default the bin advertises; `module` is run with the editor's Node runtime.
  const serverOptions: ServerOptions = {
    run: {
      module: resolved.module,
      transport: TransportKind.stdio,
    },
    debug: {
      module: resolved.module,
      transport: TransportKind.stdio,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      // Primary selector: files VS Code tagged with our custom language id (via filenamePatterns).
      { language: "hoverfly-simulation" },
      // Fallback selector: catches a *.hoverfly.json left on the built-in json language id.
      // Content-fingerprinting in the server keeps this safe — it never steals plain .json files.
      { language: "json", pattern: "**/*.hoverfly.json" },
    ],
    synchronize: {
      // Re-validate when simulation files change on disk outside the open editor.
      fileEvents: workspace.createFileSystemWatcher("**/*.hoverfly.json"),
    },
    // Passed for clients that read config at startup; the server also pulls "hoverfly" live.
    initializationOptions: {
      registeredActions: config.get<string[]>("registeredActions") ?? [],
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
  if (client === undefined) {
    return;
  }
  await client.stop();
  client = undefined;
}
