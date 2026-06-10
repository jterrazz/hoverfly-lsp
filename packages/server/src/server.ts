import { createHoverflyLanguageService } from "@hoverfly-lsp/core";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  type Connection,
  createConnection,
  ProposedFeatures,
  TextDocuments,
} from "vscode-languageserver/node";

import { initializeResult } from "./capabilities.js";

/**
 * Build (but do not start) the Hoverfly language server over a given connection.
 *
 * Scaffold phase: the `initialize` handshake is real, and didOpen/didChange are wired to
 * a validate pass that delegates to `@hoverfly-lsp/core`. Core currently returns `[]` for
 * every document (no-op validate), and the server skips non-Hoverfly files via the D3
 * fingerprint before even calling validate. Real diagnostics land in later phases.
 */
function createServer(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);
  const service = createHoverflyLanguageService();

  connection.onInitialize(() => initializeResult);

  const validate = async (document: TextDocument): Promise<void> => {
    // Skip JSON that does not look like a Hoverfly simulation (decision D3).
    if (!service.isSimulation(document)) {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
      return;
    }
    const diagnostics = await service.doValidation(document);
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
  };

  documents.onDidChangeContent(({ document }) => {
    void validate(document);
  });

  documents.listen(connection);
}

/**
 * Start the server over stdio (the default transport).
 */
export function startStdioServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  createServer(connection);
  connection.listen();
}
