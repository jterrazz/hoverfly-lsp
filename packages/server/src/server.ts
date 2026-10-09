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

function field(raw: unknown, key: string): unknown {
    return typeof raw === 'object' && raw !== null ? Reflect.get(raw, key) : undefined;
}

// invariant: only known, well-typed keys are read, so a malformed client configuration cannot crash
// the server.
function pickSettings(raw: unknown): HoverflyServiceSettings {
    const actions = field(raw, 'registeredActions');
    return Array.isArray(actions)
        ? { registeredActions: actions.filter((a): a is string => typeof a === 'string') }
        : {};
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
    private service: HoverflyLanguageService = createHoverflyLanguageService();
    private clientCapabilities: ClientCapabilities = {};
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
        // outside: initializationOptions carry the settings of a client without
        // workspace/configuration; one with it overrides them once initialized.
        this.configure(pickSettings(params.initializationOptions));
        this.hasInitialized = true;
        return {
            capabilities: buildServerCapabilities(params.capabilities),
            serverInfo: { name: 'hoverfly-lsp' },
        };
    }

    private get usePull(): boolean {
        return clientSupportsPullDiagnostics(this.clientCapabilities);
    }

    private get hasConfigurationCapability(): boolean {
        return clientSupportsConfiguration(this.clientCapabilities);
    }

    private async initialized(): Promise<void> {
        if (clientSupportsDidChangeConfiguration(this.clientCapabilities)) {
            void this.registerForConfigurationChanges();
        }
        await this.refreshConfiguration();
        this.revalidateOpenDocuments();
    }

    // outside: a client may refuse a dynamic registration; the configuration it can still be asked
    // for neither waits on that answer nor fails with it.
    private async registerForConfigurationChanges(): Promise<void> {
        try {
            await this.connection.client.register(DidChangeConfigurationNotification.type, {
                section: CONFIGURATION_SECTION,
            });
        } catch (error: unknown) {
            this.connection.console.error(
                `hoverfly-lsp: failed to register for configuration changes: ${String(error)}`,
            );
        }
    }

    private async configurationChanged(pushed: unknown): Promise<void> {
        if (this.hasConfigurationCapability) {
            await this.refreshConfiguration();
        } else {
            this.configure(pickSettings(field(pushed, CONFIGURATION_SECTION)));
        }
        this.revalidateOpenDocuments();
    }

    private configure(settings: HoverflyServiceSettings): void {
        this.service = createHoverflyLanguageService([], settings);
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
        if (clientSupportsSemanticTokens(this.clientCapabilities) && document !== undefined) {
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
        clearTimeout(this.pushTimers.get(uri));
        // Stryker disable next-line CallExpression: equivalent — it only frees the handle, and clearing a fired or cleared timer does nothing
        this.pushTimers.delete(uri);
    }

    // invariant: a client advertising pull asks for its diagnostics, any other gets them pushed —
    // never both (decision D1). A newer version cancels the push still waiting, and TextDocuments
    // updates a document in place, so a push always validates the version it publishes.
    private schedulePush(document: TextDocument): void {
        if (this.usePull) {
            return;
        }
        this.cancelPush(document.uri);
        const timer = setTimeout(() => {
            void this.push(document);
        }, PUSH_DEBOUNCE_MS);
        this.pushTimers.set(document.uri, timer);
    }

    private async push(document: TextDocument): Promise<void> {
        const { uri, version } = document;
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
