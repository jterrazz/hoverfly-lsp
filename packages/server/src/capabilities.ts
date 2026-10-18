import { SEMANTIC_TOKEN_MODIFIERS, SEMANTIC_TOKEN_TYPES } from '@hoverfly-lsp/analysis';
import { TextDocumentSyncKind } from 'vscode-languageserver/node';
import type {
    ClientCapabilities,
    SemanticTokensLegend,
    ServerCapabilities,
} from 'vscode-languageserver/node';

// value: `"` and `{` open a JSON value or object; `{`, `.`, `#`, `@`, `'` and `(` continue a
// Handlebars mustache, path, block, each-variable or argument.
const COMPLETION_TRIGGER_CHARACTERS = ['"', '{', '.', '#', '@', "'", '('] as const;

// invariant: the legend is the analysis package's own arrays, verbatim and in order: the producer
// emits indices into them, so a retyped copy would shift every color.
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

/** Whether the client reads semantic tokens; the provider is advertised only to one that does. */
export function clientSupportsSemanticTokens(capabilities: ClientCapabilities): boolean {
    return capabilities.textDocument?.semanticTokens !== undefined;
}

// invariant: a simulation is one self-contained file (no diagnostic depends on another document)
// and a full token pass is cheap, so no range or delta provider is advertised.
/** The capabilities answered at initialize; semantic tokens only for a client that reads them. */
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
            identifier: 'hoverfly',
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
