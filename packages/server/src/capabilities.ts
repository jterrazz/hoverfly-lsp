import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from "@hoverfly-lsp/core";
import {
  type ClientCapabilities,
  type SemanticTokensLegend,
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

/**
 * The semantic-tokens legend advertised during `initialize`, sourced VERBATIM and in order from
 * core's frozen {@link SEMANTIC_TOKEN_TYPES} / {@link SEMANTIC_TOKEN_MODIFIERS}. The wire protocol
 * carries integer INDICES into these arrays, so the server must advertise the exact arrays the
 * producer emits indices against — never a hand-retyped copy. Modifiers are empty in v1.
 */
const SEMANTIC_TOKENS_LEGEND: SemanticTokensLegend = {
  tokenTypes: [...SEMANTIC_TOKEN_TYPES],
  tokenModifiers: [...SEMANTIC_TOKEN_MODIFIERS],
};

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
 * Whether the client advertised support for semantic tokens (`textDocument/semanticTokens`).
 * The server only advertises (and only registers a handler for) the semantic-tokens provider when
 * the client can consume it — a client that never asks for tokens should not see the capability.
 */
export function clientSupportsSemanticTokens(capabilities: ClientCapabilities): boolean {
  return capabilities.textDocument?.semanticTokens !== undefined;
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
 *
 * `semanticTokensProvider` is advertised ONLY when the client supports semantic tokens (a client
 * that cannot consume them should not see the capability). We advertise `full: true` (a whole-
 * document token pass) and deliberately NOT `range`: a Hoverfly simulation is one self-contained
 * file whose full-document tokenization already reuses the parsed AST/model and is cheap, so a
 * separate range provider would add code paths for no measurable win. Delta is likewise omitted —
 * full re-tokenization on each request is inexpensive at simulation-file sizes.
 */
export function buildServerCapabilities(
  clientCapabilities: ClientCapabilities,
): ServerCapabilities {
  const capabilities: ServerCapabilities = {
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
  if (clientSupportsSemanticTokens(clientCapabilities)) {
    capabilities.semanticTokensProvider = {
      legend: SEMANTIC_TOKENS_LEGEND,
      full: true,
      range: false,
    };
  }
  return capabilities;
}
