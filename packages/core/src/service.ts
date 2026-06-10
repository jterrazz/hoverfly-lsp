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

import {
  hasHoverflyFilename,
  isHoverflySimulation,
  isHoverflySimulationAst,
} from "./fingerprint.js";
import { hoverflySchema } from "./schema/hoverfly.schema.generated.js";
import {
  ALL_RULES,
  applyHF102Layer,
  createRuleContext,
  hf101NotASimulation,
  type HoverflyServiceSettings,
  runRules,
  sortByRange,
} from "./semantic/index.js";

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
 * @param settings service-level settings threaded into every rule context (e.g. HF602's
 *   `registeredActions` allowlist). Defaults to `{}` — settings-gated rules stay silent.
 */
export function createHoverflyLanguageService(
  contributions: JSONWorkerContribution[] = [],
  settings: HoverflyServiceSettings = {},
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

  /**
   * The full validation pipeline (decision D3 gate + HF102 schema layer + semantic rules):
   *
   *   1. Fingerprint gate: if the document is NOT a Hoverfly simulation, return `[]` —
   *      UNLESS it carries an explicit hoverfly filename, in which case emit HF101 and stop
   *      (a non-simulation file gets no schema/semantic noise).
   *   2. Schema diagnostics from vscode-json-languageservice, re-tagged HF102 and de-noised
   *      where a more specific HF2xx semantic diagnostic overlaps the same node.
   *   3. Semantic (HFxxx) rule results.
   *   4. Concatenate and sort by range.
   */
  async function validate(
    document: TextDocument,
    jsonDocument?: JSONDocument,
  ): Promise<Diagnostic[]> {
    const parsed = jsonDocument ?? parse(document);

    /*
     * D3 fingerprint runs over the error-recovering AST (not raw JSON.parse) so a
     * broken-yet-recognisable simulation still gets schema/semantic treatment, not HF101.
     */
    if (!isHoverflySimulationAst(parsed.root)) {
      return hasHoverflyFilename(document.uri) ? [hf101NotASimulation(document)] : [];
    }

    const schemaDiagnostics = await service.doValidation(document, parsed);
    const context = createRuleContext(document, parsed, settings);
    const semanticDiagnostics = runRules(ALL_RULES, context);

    return sortByRange([
      ...applyHF102Layer(schemaDiagnostics, semanticDiagnostics),
      ...semanticDiagnostics,
    ]);
  }

  return {
    parse,
    isSimulation(document: TextDocument): boolean {
      return isHoverflySimulation(document.getText());
    },
    doValidation(document: TextDocument, jsonDocument?: JSONDocument): Promise<Diagnostic[]> {
      return validate(document, jsonDocument);
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
