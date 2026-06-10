import { type InitializeResult, TextDocumentSyncKind } from "vscode-languageserver/node";

/**
 * The capabilities advertised during the LSP `initialize` handshake.
 *
 * Scaffold phase: we advertise incremental text sync and push diagnostics only.
 * Completion, hover, document symbols and pull diagnostics are added in later phases
 * (see PLAN.md). Diagnostics are pushed via `connection.sendDiagnostics`.
 */
export const initializeResult: InitializeResult = {
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
  },
  serverInfo: {
    name: "hoverfly-lsp",
  },
};
