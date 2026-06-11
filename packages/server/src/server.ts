import {
  createHoverflyLanguageService,
  getSemanticTokens,
  type HoverflyLanguageService,
  type HoverflyServiceSettings,
} from "@hoverfly-lsp/core";
import { TextDocument } from "vscode-languageserver-textdocument";
import {
  type ClientCapabilities,
  type Connection,
  createConnection,
  type DiagnosticServerCancellationData,
  DidChangeConfigurationNotification,
  ErrorCodes,
  type InitializeError,
  type InitializeParams,
  type InitializeResult,
  ProposedFeatures,
  ResponseError,
  type SemanticTokens,
  SemanticTokensBuilder,
  TextDocuments,
} from "vscode-languageserver/node";

import {
  buildServerCapabilities,
  clientSupportsConfiguration,
  clientSupportsDidChangeConfiguration,
  clientSupportsPullDiagnostics,
  clientSupportsSemanticTokens,
} from "./capabilities.js";

/** Debounce window for the push-diagnostics path, in milliseconds. */
const PUSH_DEBOUNCE_MS = 200;

/** The configuration section the client is asked to resolve / that carries our settings. */
const CONFIGURATION_SECTION = "hoverfly";

/**
 * Read the `hoverfly.*` settings out of an arbitrary configuration object (from either
 * `initializationOptions` or a `workspace/configuration` response). Only known, well-typed
 * keys are lifted; everything else is ignored so a malformed client config cannot crash us.
 */
function pickSettings(raw: unknown): HoverflyServiceSettings {
  if (typeof raw !== "object" || raw === null) {
    return {};
  }
  const candidate = raw as { registeredActions?: unknown };
  const actions = candidate.registeredActions;
  if (Array.isArray(actions)) {
    const registeredActions = actions.filter((a): a is string => typeof a === "string");
    return { registeredActions };
  }
  return {};
}

/**
 * Build (but do not start) the Hoverfly language server over a given connection.
 *
 * Diagnostics flow through both LSP channels (decision D1):
 *   - PULL: `textDocument/diagnostic` returns a full report on demand.
 *   - PUSH: `connection.sendDiagnostics` on didOpen/didChange, debounced ~200ms with stale
 *     cancellation.
 * To avoid doing the work twice, push is SKIPPED whenever the client advertised pull support
 * (it will call `textDocument/diagnostic` itself). Clients without pull still get push.
 *
 * The fingerprint/HF101 gate (decision D3) lives entirely in `core.doValidation`, so the
 * server does NOT pre-gate with `isSimulation` — a non-simulation file simply validates to
 * `[]` (or HF101 for a hoverfly-named file), with no double fingerprinting.
 */
/**
 * Spec: any request other than `initialize` (and `$/...`) received before `initialize` has
 * succeeded must fail with ServerNotInitialized (-32002). Feature request handlers return this
 * when the lifecycle guard is not yet set.
 */
function notInitialized<E>(): ResponseError<E> {
  return new ResponseError<E>(
    ErrorCodes.ServerNotInitialized,
    "Server received a request before `initialize`.",
  );
}

function createServer(connection: Connection): void {
  const documents = new TextDocuments(TextDocument);

  /*
   * Live, recreatable service: setting changes rebuild it so every rule context (HF602's
   * registeredActions allowlist, etc.) picks up new values. Cheap to recreate (no I/O — the
   * schema is bundled and resolved offline).
   */
  let settings: HoverflyServiceSettings = {};
  let service: HoverflyLanguageService = createHoverflyLanguageService([], settings);

  let clientCapabilities: ClientCapabilities = {};
  let usePull = false;
  let hasConfigurationCapability = false;
  let useSemanticTokens = false;
  /*
   * LSP $/lifecycle ordering guard. Set once `initialize` succeeds. Feature requests received
   * before this is set must fail with ServerNotInitialized (-32002); a second `initialize`
   * while set must fail with InvalidRequest (-32600). See the LSP 3.17 Lifecycle section.
   */
  let hasInitialized = false;

  const rebuildService = (): void => {
    service = createHoverflyLanguageService([], settings);
  };

  // ----- Diagnostics -------------------------------------------------------------------------

  const pushTimers = new Map<string, ReturnType<typeof setTimeout>>();

  const cancelPush = (uri: string): void => {
    const pending = pushTimers.get(uri);
    if (pending !== undefined) {
      clearTimeout(pending);
      pushTimers.delete(uri);
    }
  };

  const schedulePush = (document: TextDocument): void => {
    // Pull-capable clients fetch diagnostics themselves; never push to them (avoid double work).
    if (usePull) {
      return;
    }
    const { uri } = document;
    const { version } = document;
    cancelPush(uri);
    const timer = setTimeout(() => {
      pushTimers.delete(uri);
      // Stale-edit guard: a newer version may have arrived (and rescheduled) while we waited.
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
          connection.console.error(`hoverfly-lsp: validation failed for ${uri}: ${String(error)}`);
        });
    }, PUSH_DEBOUNCE_MS);
    pushTimers.set(uri, timer);
  };

  // ----- Settings ----------------------------------------------------------------------------

  const refreshConfiguration = async (): Promise<void> => {
    if (!hasConfigurationCapability) {
      return;
    }
    try {
      const result: unknown = await connection.workspace.getConfiguration(CONFIGURATION_SECTION);
      settings = pickSettings(result);
      rebuildService();
    } catch (error: unknown) {
      connection.console.error(`hoverfly-lsp: failed to read configuration: ${String(error)}`);
    }
  };

  const revalidateOpenDocuments = (): void => {
    for (const document of documents.all()) {
      schedulePush(document);
    }
  };

  // ----- Lifecycle ---------------------------------------------------------------------------

  connection.onInitialize(
    (params: InitializeParams): InitializeResult | ResponseError<InitializeError> => {
      // Spec: a second `initialize` is an InvalidRequest; the first result still stands.
      if (hasInitialized) {
        return new ResponseError<InitializeError>(
          ErrorCodes.InvalidRequest,
          "Server already initialized; a second initialize request is not allowed.",
        );
      }
      clientCapabilities = params.capabilities;
      usePull = clientSupportsPullDiagnostics(clientCapabilities);
      hasConfigurationCapability = clientSupportsConfiguration(clientCapabilities);
      useSemanticTokens = clientSupportsSemanticTokens(clientCapabilities);

      /*
       * The initializationOptions object is the fallback settings source for clients that lack
       * workspace/configuration support; workspace/configuration (if supported) overrides it
       * once the connection is initialized.
       */
      settings = pickSettings(params.initializationOptions);
      rebuildService();

      hasInitialized = true;
      return {
        capabilities: buildServerCapabilities(clientCapabilities),
        serverInfo: { name: "hoverfly-lsp" },
      };
    },
  );

  connection.onInitialized(() => {
    if (clientSupportsDidChangeConfiguration(clientCapabilities)) {
      void connection.client.register(DidChangeConfigurationNotification.type, {
        section: CONFIGURATION_SECTION,
      });
    }
    // Pull the authoritative config now that the client can answer workspace/configuration.
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
    // Push-config clients send the settings inline.
    settings = pickSettings((change.settings as null | { hoverfly?: unknown })?.hoverfly);
    rebuildService();
    revalidateOpenDocuments();
  });

  // ----- PULL diagnostics --------------------------------------------------------------------

  connection.languages.diagnostics.on(async (params) => {
    if (!hasInitialized) {
      return notInitialized<DiagnosticServerCancellationData>();
    }
    const document = documents.get(params.textDocument.uri);
    return {
      kind: "full",
      items: document === undefined ? [] : await service.doValidation(document),
    };
  });

  // ----- Completion & hover ------------------------------------------------------------------

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

  // ----- Semantic tokens ---------------------------------------------------------------------

  /*
   * Full-document semantic tokens. Core's `getSemanticTokens` returns absolute, single-line,
   * (line, startChar)-sorted tokens whose `tokenType` is already an INDEX into the frozen legend
   * (core owns the name→index mapping via `SEMANTIC_TOKEN_TYPE_INDEX`; the emitted tokens carry
   * the integer). `SemanticTokensBuilder.push` delta-encodes them into the 5-int wire array
   * (deltaLine, deltaStartChar, length, tokenType, tokenModifiers).
   *
   * The D3 fingerprint gate lives in `getSemanticTokens`: a non-simulation (and non-Hoverfly-named)
   * document yields `[]`, so the builder produces an empty `data` array.
   *
   * The handler is registered unconditionally at setup (the request handler must exist before any
   * `initialize`), but it stays gated by `useSemanticTokens` — the provider capability is only
   * advertised to clients that support semantic tokens, and a client that did not advertise support
   * gets an empty token set rather than an answer it never asked for.
   */
  connection.languages.semanticTokens.on((params): ResponseError<void> | SemanticTokens => {
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
    // Reuse the service's BOM-normalised, error-recovering parse (offsets stay aligned).
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

  // ----- Document sync -> push diagnostics ---------------------------------------------------

  documents.onDidChangeContent(({ document }) => {
    schedulePush(document);
  });

  documents.onDidClose(({ document }) => {
    cancelPush(document.uri);
    // Clear diagnostics for the closed document (push clients only; pull clients re-query).
    if (!usePull) {
      connection.sendDiagnostics({ uri: document.uri, diagnostics: [] });
    }
  });

  documents.listen(connection);
}

/**
 * Start the server. The transport (`--stdio` / `--node-ipc` / `--socket=PORT`) is detected by
 * `vscode-languageserver/node` from `process.argv`; the CLI validates the flags up front.
 */
export function startServer(): void {
  const connection = createConnection(ProposedFeatures.all);
  createServer(connection);
  connection.listen();
}
