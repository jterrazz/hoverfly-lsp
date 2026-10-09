import { createHoverflyLanguageService, getSemanticTokens } from '@hoverfly-lsp/analysis';
import type { HoverflyLanguageService, HoverflyServiceSettings } from '@hoverfly-lsp/analysis';
import { TextDocument } from 'vscode-languageserver-textdocument';
import {
    createConnection,
    DidChangeConfigurationNotification,
    ErrorCodes,
    ProposedFeatures,
    ResponseError,
    SemanticTokensBuilder,
    TextDocuments,
} from 'vscode-languageserver/node';
import type {
    ClientCapabilities,
    Connection,
    DiagnosticServerCancellationData,
    InitializeError,
    InitializeParams,
    InitializeResult,
    SemanticTokens,
} from 'vscode-languageserver/node';

import {
    buildServerCapabilities,
    clientSupportsConfiguration,
    clientSupportsDidChangeConfiguration,
    clientSupportsPullDiagnostics,
    clientSupportsSemanticTokens,
} from './capabilities.js';

const PUSH_DEBOUNCE_MS = 200;

const CONFIGURATION_SECTION = 'hoverfly';

// invariant: only known, well-typed keys are read, so a malformed client configuration cannot crash
// the server.
function pickSettings(raw: unknown): HoverflyServiceSettings {
    if (typeof raw !== 'object' || raw === null) {
        return {};
    }
    const candidate = raw as { registeredActions?: unknown };
    const actions = candidate.registeredActions;
    if (Array.isArray(actions)) {
        const registeredActions = actions.filter((a): a is string => typeof a === 'string');
        return { registeredActions };
    }
    return {};
}

// outside: LSP 3.17 Lifecycle — a request before initialize succeeds fails with
// ServerNotInitialized (-32002), a second initialize with InvalidRequest (-32600).
function notInitialized<E>(): ResponseError<E> {
    return new ResponseError<E>(
        ErrorCodes.ServerNotInitialized,
        'Server received a request before `initialize`.',
    );
}

function createServer(connection: Connection): void {
    const documents = new TextDocuments(TextDocument);

    // value: the service is rebuilt on every settings change, so each rule context reads the new
    // values; it reads no file, the schema being bundled.
    let settings: HoverflyServiceSettings = {};
    let service: HoverflyLanguageService = createHoverflyLanguageService([], settings);

    let clientCapabilities: ClientCapabilities = {};
    let usePull = false;
    let hasConfigurationCapability = false;
    let useSemanticTokens = false;
    let hasInitialized = false;

    const rebuildService = (): void => {
        service = createHoverflyLanguageService([], settings);
    };

    const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

    const cancelPush = (uri: string): void => {
        const pending = pushTimers.get(uri);
        if (pending !== undefined) {
            clearTimeout(pending);
            pushTimers.delete(uri);
        }
    };

    const schedulePush = (document: TextDocument): void => {
        // invariant: a client advertising pull asks for its diagnostics, any other gets them pushed
        // — never both (decision D1).
        if (usePull) {
            return;
        }
        const { uri } = document;
        const { version } = document;
        cancelPush(uri);
        const timer = setTimeout(() => {
            pushTimers.delete(uri);
            // invariant: a newer version may have arrived while the timer waited; its own push
            // supersedes this one.
            const current = documents.get(uri);
            if (current !== undefined && current.version !== version) {
                return;
            }
            void service
                .doValidation(document)
                .then((diagnostics) => {
                    connection.sendDiagnostics({ uri, version, diagnostics });
                })
                .catch((error: unknown) => {
                    connection.console.error(
                        `hoverfly-lsp: validation failed for ${uri}: ${String(error)}`,
                    );
                });
        }, PUSH_DEBOUNCE_MS);
        pushTimers.set(uri, timer);
    };

    const refreshConfiguration = async (): Promise<void> => {
        if (!hasConfigurationCapability) {
            return;
        }
        try {
            const result: unknown =
                await connection.workspace.getConfiguration(CONFIGURATION_SECTION);
            settings = pickSettings(result);
            rebuildService();
        } catch (error: unknown) {
            connection.console.error(
                `hoverfly-lsp: failed to read configuration: ${String(error)}`,
            );
        }
    };

    const revalidateOpenDocuments = (): void => {
        for (const document of documents.all()) {
            schedulePush(document);
        }
    };

    connection.onInitialize(
        (params: InitializeParams): InitializeResult | ResponseError<InitializeError> => {
            if (hasInitialized) {
                return new ResponseError<InitializeError>(
                    ErrorCodes.InvalidRequest,
                    'Server already initialized; a second initialize request is not allowed.',
                );
            }
            clientCapabilities = params.capabilities;
            usePull = clientSupportsPullDiagnostics(clientCapabilities);
            hasConfigurationCapability = clientSupportsConfiguration(clientCapabilities);
            useSemanticTokens = clientSupportsSemanticTokens(clientCapabilities);

            // outside: initializationOptions carry the settings of a client without
            // workspace/configuration; one with it overrides them once initialized.
            settings = pickSettings(params.initializationOptions);
            rebuildService();

            hasInitialized = true;
            return {
                capabilities: buildServerCapabilities(clientCapabilities),
                serverInfo: { name: 'hoverfly-lsp' },
            };
        },
    );

    connection.onInitialized(() => {
        if (clientSupportsDidChangeConfiguration(clientCapabilities)) {
            void connection.client.register(DidChangeConfigurationNotification.type, {
                section: CONFIGURATION_SECTION,
            });
        }
        void refreshConfiguration().then(() => {
            revalidateOpenDocuments();
        });
    });

    connection.onDidChangeConfiguration((change) => {
        if (hasConfigurationCapability) {
            void refreshConfiguration().then(() => {
                revalidateOpenDocuments();
            });
            return;
        }
        settings = pickSettings((change.settings as null | { hoverfly?: unknown })?.hoverfly);
        rebuildService();
        revalidateOpenDocuments();
    });

    connection.languages.diagnostics.on(async (params) => {
        if (!hasInitialized) {
            return notInitialized<DiagnosticServerCancellationData>();
        }
        const document = documents.get(params.textDocument.uri);
        return {
            kind: 'full',
            items: document === undefined ? [] : await service.doValidation(document),
        };
    });

    connection.onCompletion((params) => {
        if (!hasInitialized) {
            return notInitialized<void>();
        }
        const document = documents.get(params.textDocument.uri);
        if (document === undefined) {
            return null;
        }
        return service.doComplete(document, params.position);
    });

    connection.onHover((params) => {
        if (!hasInitialized) {
            return notInitialized<void>();
        }
        const document = documents.get(params.textDocument.uri);
        if (document === undefined) {
            return null;
        }
        return service.doHover(document, params.position);
    });

    // invariant: the handler exists before initialize, as every handler must, yet answers no token
    // to a client that did not advertise semantic tokens; the tokens already carry legend indices,
    // and the D3 gate is getSemanticTokens'.
    connection.languages.semanticTokens.on((params): ResponseError | SemanticTokens => {
        if (!hasInitialized) {
            return notInitialized<void>();
        }
        const builder = new SemanticTokensBuilder();
        if (!useSemanticTokens) {
            return builder.build();
        }
        const document = documents.get(params.textDocument.uri);
        if (document === undefined) {
            return builder.build();
        }
        const jsonDocument = service.parse(document);
        for (const token of getSemanticTokens(document, jsonDocument)) {
            builder.push(
                token.line,
                token.startChar,
                token.length,
                token.tokenType,
                token.tokenModifiers,
            );
        }
        return builder.build();
    });

    documents.onDidChangeContent(({ document }) => {
        schedulePush(document);
    });

    documents.onDidClose(({ document }) => {
        cancelPush(document.uri);
        if (!usePull) {
            connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
        }
    });

    documents.listen(connection);
}

/** Starts the server; vscode-languageserver/node picks the transport from process.argv, which the command validated. */
export function startServer(): void {
    const connection = createConnection(ProposedFeatures.all);
    createServer(connection);
    connection.listen();
}
