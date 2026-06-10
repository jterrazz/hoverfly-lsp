import {
  type ClientCapabilities,
  type ServerCapabilities,
  TextDocumentSyncKind,
} from "vscode-languageserver/node";

/**
 * Trigger characters that should re-open the completion dropdown. These cover both the JSON
 * layer (`"` opens a string value, `{` opens an object) and the Handlebars template layer
 * (`{` for `{{`, `.` for path continuation, `#`/`/` for block scopes, `@` for each-vars, `'`
 * and `(` for helper arguments / sub-expressions).
 */
const COMPLETION_TRIGGER_CHARACTERS = ['"', "{", ".", "#", "@", "'", "("] as const;

/** Whether the client advertised support for PULL diagnostics (`textDocument/diagnostic`). */
export function clientSupportsPullDiagnostics(capabilities: ClientCapabilities): boolean {
  return capabilities.textDocument?.diagnostic !== undefined;
}

/** Whether the client can fetch settings via `workspace/configuration`. */
export function clientSupportsConfiguration(capabilities: ClientCapabilities): boolean {
  return capabilities.workspace?.configuration === true;
}

/** Whether the client can register for `workspace/didChangeConfiguration` dynamically. */
export function clientSupportsDidChangeConfiguration(capabilities: ClientCapabilities): boolean {
  return capabilities.workspace?.didChangeConfiguration?.dynamicRegistration === true;
}

/**
 * Build the server capabilities advertised during `initialize`.
 *
 * Diagnostics are advertised through BOTH channels per decision D1:
 *   - the `diagnosticProvider` (pull) capability for modern clients that call
 *     `textDocument/diagnostic`, and
 *   - `sendDiagnostics` push on didOpen/didChange for clients without pull support.
 * The server detects pull support from the client capabilities at runtime and skips the push
 * path when pull is available, so a pull-capable client never pays for both (see server.ts).
 *
 * `interFileDependencies: false` + `workspaceDiagnostics: false`: a Hoverfly simulation is a
 * single self-contained file — diagnostics never depend on other documents, and there is no
 * project-wide diagnostic pass to run.
 */
export function buildServerCapabilities(): ServerCapabilities {
  return {
    textDocumentSync: {
      openClose: true,
      change: TextDocumentSyncKind.Incremental,
    },
    completionProvider: {
      triggerCharacters: [...COMPLETION_TRIGGER_CHARACTERS],
      resolveProvider: false,
    },
    hoverProvider: true,
    diagnosticProvider: {
      identifier: "hoverfly",
      interFileDependencies: false,
      workspaceDiagnostics: false,
    },
  };
}
