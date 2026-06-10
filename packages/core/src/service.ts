import {
  type CompletionList,
  type Diagnostic,
  getLanguageService,
  type Hover,
  type JSONDocument,
  type JSONWorkerContribution,
  type LanguageService,
  type Position,
} from "vscode-json-languageservice";
import { type TextDocument } from "vscode-languageserver-textdocument";

import { isHoverflySimulation } from "./fingerprint.js";
import { hoverflySchema } from "./schema/hoverfly.schema.generated.js";

/** The `$id` of the bundled schema; also the URI it is registered under. */
const SCHEMA_URI =
  hoverflySchema.$id ?? "https://hoverfly-lsp.dev/schemas/hoverfly-simulation.json";

const SCHEMA_TEXT = JSON.stringify(hoverflySchema);

/**
 * The facade returned by {@link createHoverflyLanguageService}.
 *
 * Wraps `vscode-json-languageservice` configured with the bundled Hoverfly schema. Hoverfly
 * intelligence beyond the schema (semantic validators, template analysis, richer completion
 * and hover) layers on via the {@link JSONWorkerContribution} hook in later phases.
 */
export interface HoverflyLanguageService {
  /** Parse a document into an error-recovering JSON AST (reused across the other calls). */
  parse: (document: TextDocument) => JSONDocument;
  /** Whether this document looks like a Hoverfly simulation (D3 fingerprint). */
  isSimulation: (document: TextDocument) => boolean;
  /**
   * Schema-level diagnostics for a document. Semantic (HFxxx) validators are not wired yet,
   * so this currently surfaces only structural/schema problems from the bundled schema.
   */
  doValidation: (document: TextDocument, jsonDocument?: JSONDocument) => Promise<Diagnostic[]>;
  /**
   * Back-compat alias for {@link HoverflyLanguageService.doValidation}, kept so the existing
   * server validate pass keeps compiling. New code should call `doValidation`.
   */
  diagnostics: (document: TextDocument) => Promise<Diagnostic[]>;
  /** Schema-driven completion at a position. */
  doComplete: (
    document: TextDocument,
    position: Position,
    jsonDocument?: JSONDocument,
  ) => Promise<CompletionList | null>;
  /** Schema-driven hover at a position. */
  doHover: (
    document: TextDocument,
    position: Position,
    jsonDocument?: JSONDocument,
  ) => Promise<Hover | null>;
}

/**
 * Create a Hoverfly language service backed by `vscode-json-languageservice`.
 *
 * The bundled schema is resolved offline: `schemaRequestService` returns the embedded
 * schema text for {@link SCHEMA_URI} and rejects every other URI, so the service never
 * touches the network or the filesystem at runtime.
 *
 * @param contributions completion/hover participants ({@link JSONWorkerContribution}); the
 *   hook point for Hoverfly-specific intelligence. Defaults to `[]`.
 */
export function createHoverflyLanguageService(
  contributions: JSONWorkerContribution[] = [],
): HoverflyLanguageService {
  const service: LanguageService = getLanguageService({
    contributions,
    schemaRequestService: (uri: string): Promise<string> => {
      if (uri === SCHEMA_URI) {
        return Promise.resolve(SCHEMA_TEXT);
      }
      return Promise.reject(new Error(`Unknown schema URI: ${uri}`));
    },
  });

  service.configure({
    validate: true,
    allowComments: false,
    schemas: [{ uri: SCHEMA_URI, fileMatch: ["*.json"] }],
  });

  function parse(document: TextDocument): JSONDocument {
    return service.parseJSONDocument(document);
  }

  return {
    parse,
    isSimulation(document: TextDocument): boolean {
      return isHoverflySimulation(document.getText());
    },
    doValidation(document: TextDocument, jsonDocument?: JSONDocument): Promise<Diagnostic[]> {
      return Promise.resolve(service.doValidation(document, jsonDocument ?? parse(document)));
    },
    diagnostics(document: TextDocument): Promise<Diagnostic[]> {
      return Promise.resolve(service.doValidation(document, parse(document)));
    },
    doComplete(
      document: TextDocument,
      position: Position,
      jsonDocument?: JSONDocument,
    ): Promise<CompletionList | null> {
      return Promise.resolve(
        service.doComplete(document, position, jsonDocument ?? parse(document)),
      );
    },
    doHover(
      document: TextDocument,
      position: Position,
      jsonDocument?: JSONDocument,
    ): Promise<Hover | null> {
      return Promise.resolve(service.doHover(document, position, jsonDocument ?? parse(document)));
    },
  };
}
