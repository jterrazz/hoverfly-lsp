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
    Diagnostic,
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

class HoverflyServer {
    private readonly connection: Connection;
    private readonly documents = new TextDocuments(TextDocument);
    private readonly pushTimers = new Map<string, ReturnType<typeof setTimeout>>();
    // value: the service is rebuilt on every settings change, so each rule context reads the new
    // values; it reads no file, the schema being bundled.
    private settings: HoverflyServiceSettings = {};
    private service: HoverflyLanguageService = createHoverflyLanguageService([], {});
    private clientCapabilities: ClientCapabilities = {};
    private usePull = false;
    private hasConfigurationCapability = false;
    private useSemanticTokens = false;
    private hasInitialized = false;

    constructor(connection: Connection) {
        this.connection = connection;
    }

    listen(): void {
        const { connection, documents } = this;
        connection.onInitialize((params) => this.initialize(params));
        connection.onInitialized(() => {
            void this.initialized();
        });
        connection.onDidChangeConfiguration((change) => {
            void this.configurationChanged(change.settings);
        });
        connection.languages.diagnostics.on(
            async (params) => await this.pulled(params.textDocument.uri),
        );
        connection.onCompletion(
            async (params) =>
                await this.answer(
                    params.textDocument.uri,
                    async (document) => await this.service.doComplete(document, params.position),
                ),
        );
        connection.onHover(
            async (params) =>
                await this.answer(
                    params.textDocument.uri,
                    async (document) => await this.service.doHover(document, params.position),
                ),
        );
        connection.languages.semanticTokens.on((params) => this.tokens(params.textDocument.uri));
        documents.onDidChangeContent(({ document }) => {
            this.schedulePush(document);
        });
        documents.onDidClose(({ document }) => {
            this.cancelPush(document.uri);
            if (!this.usePull) {
                void connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
            }
        });
        documents.listen(connection);
    }

    private initialize(
        params: InitializeParams,
    ): InitializeResult | ResponseError<InitializeError> {
        if (this.hasInitialized) {
            return new ResponseError<InitializeError>(
                ErrorCodes.InvalidRequest,
                'Server already initialized; a second initialize request is not allowed.',
            );
        }
        this.clientCapabilities = params.capabilities;
        this.usePull = clientSupportsPullDiagnostics(params.capabilities);
        this.hasConfigurationCapability = clientSupportsConfiguration(params.capabilities);
        this.useSemanticTokens = clientSupportsSemanticTokens(params.capabilities);
        // outside: initializationOptions carry the settings of a client without
        // workspace/configuration; one with it overrides them once initialized.
        this.configure(pickSettings(params.initializationOptions));
        this.hasInitialized = true;
        return {
            capabilities: buildServerCapabilities(params.capabilities),
            serverInfo: { name: 'hoverfly-lsp' },
        };
    }

    private async initialized(): Promise<void> {
        if (clientSupportsDidChangeConfiguration(this.clientCapabilities)) {
            await this.connection.client.register(DidChangeConfigurationNotification.type, {
                section: CONFIGURATION_SECTION,
            });
        }
        await this.refreshConfiguration();
        this.revalidateOpenDocuments();
    }

    private async configurationChanged(pushed: unknown): Promise<void> {
        if (this.hasConfigurationCapability) {
            await this.refreshConfiguration();
        } else {
            this.configure(
                pickSettings(
                    typeof pushed === 'object' && pushed !== null && 'hoverfly' in pushed
                        ? pushed.hoverfly
                        : undefined,
                ),
            );
        }
        this.revalidateOpenDocuments();
    }

    private configure(settings: HoverflyServiceSettings): void {
        this.settings = settings;
        this.service = createHoverflyLanguageService([], this.settings);
    }

    private async refreshConfiguration(): Promise<void> {
        if (!this.hasConfigurationCapability) {
            return;
        }
        try {
            const result: unknown =
                await this.connection.workspace.getConfiguration(CONFIGURATION_SECTION);
            this.configure(pickSettings(result));
        } catch (error: unknown) {
            this.connection.console.error(
                `hoverfly-lsp: failed to read configuration: ${String(error)}`,
            );
        }
    }

    private revalidateOpenDocuments(): void {
        for (const document of this.documents.all()) {
            this.schedulePush(document);
        }
    }

    private async answer<T>(
        uri: string,
        read: (document: TextDocument) => Promise<T>,
    ): Promise<null | ResponseError | T> {
        const document = this.opened(uri);
        if (document === undefined) {
            return null;
        }
        return document instanceof ResponseError ? document : await read(document);
    }

    private opened(uri: string): ResponseError | TextDocument | undefined {
        return this.hasInitialized ? this.documents.get(uri) : notInitialized<undefined>();
    }

    private async pulled(
        uri: string,
    ): Promise<
        ResponseError<DiagnosticServerCancellationData> | { items: Diagnostic[]; kind: 'full' }
    > {
        if (!this.hasInitialized) {
            return notInitialized<DiagnosticServerCancellationData>();
        }
        const document = this.documents.get(uri);
        return {
            items: document === undefined ? [] : await this.service.doValidation(document),
            kind: 'full',
        };
    }

    // invariant: the handler exists before initialize, as every handler must, yet answers no token
    // to a client that did not advertise semantic tokens; the tokens already carry legend indices,
    // and the D3 gate is getSemanticTokens'.
    private tokens(uri: string): ResponseError | SemanticTokens {
        const document = this.opened(uri);
        if (document instanceof ResponseError) {
            return document;
        }
        const builder = new SemanticTokensBuilder();
        if (this.useSemanticTokens && document !== undefined) {
            for (const token of getSemanticTokens(document, this.service.parse(document))) {
                builder.push(
                    token.line,
                    token.startChar,
                    token.length,
                    token.tokenType,
                    token.tokenModifiers,
                );
            }
        }
        return builder.build();
    }

    private cancelPush(uri: string): void {
        const pending = this.pushTimers.get(uri);
        if (pending !== undefined) {
            clearTimeout(pending);
            this.pushTimers.delete(uri);
        }
    }

    // invariant: a client advertising pull asks for its diagnostics, any other gets them pushed —
    // never both (decision D1).
    private schedulePush(document: TextDocument): void {
        if (this.usePull) {
            return;
        }
        this.cancelPush(document.uri);
        const timer = setTimeout(() => {
            this.pushTimers.delete(document.uri);
            void this.push(document);
        }, PUSH_DEBOUNCE_MS);
        this.pushTimers.set(document.uri, timer);
    }

    private async push(document: TextDocument): Promise<void> {
        const { uri, version } = document;
        // invariant: a newer version may have arrived while the timer waited; its own push
        // supersedes this one.
        const current = this.documents.get(uri);
        if (current !== undefined && current.version !== version) {
            return;
        }
        try {
            const diagnostics = await this.service.doValidation(document);
            await this.connection.sendDiagnostics({ uri, version, diagnostics });
        } catch (error: unknown) {
            this.connection.console.error(
                `hoverfly-lsp: validation failed for ${uri}: ${String(error)}`,
            );
        }
    }
}

/** Starts the server; vscode-languageserver/node picks the transport from process.argv, which the command validated. */
export function startServer(): void {
    const connection = createConnection(ProposedFeatures.all);
    new HoverflyServer(connection).listen();
    connection.listen();
}
