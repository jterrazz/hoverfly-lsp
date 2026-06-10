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
import { TextDocument } from "vscode-languageserver-textdocument";

import { createHoverflyContribution } from "./contributions/index.js";
import { getTemplateCompletions } from "./contributions/template-completion.js";
import { getTemplateHover } from "./contributions/template-hover.js";
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

/** UTF-8/UTF-16 byte-order mark. Many editors prepend it when saving JSON. */
const BOM = "﻿";

/**
 * The JSON parser treats a leading BOM (U+FEFF) as an unexpected token and produces no root at
 * all, which makes a perfectly valid simulation fail the D3 fingerprint and surface a spurious
 * HF101. Replacing the BOM with a single space (rather than deleting it) lets the parser skip it
 * as leading whitespace while keeping every byte/UTF-16 offset identical to the original
 * document — so diagnostic ranges, hover, and completion positions stay aligned. Documents
 * without a leading BOM are returned unchanged (no allocation).
 */
function stripLeadingBom(document: TextDocument): TextDocument {
  const text = document.getText();
  if (!text.startsWith(BOM)) {
    return document;
  }
  return TextDocument.create(
    document.uri,
    document.languageId,
    document.version,
    ` ${text.slice(BOM.length)}`,
  );
}

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
  /*
   * The Hoverfly JSON-level IntelliSense contribution needs to resolve a document URI back to
   * its text — for cross-reference state-key completion and matcher-name hover, which need a
   * SimulationModel of the whole file, not just the cursor's node. The vscode-json-languageservice
   * contribution API hands us only a URI + JSON location path, so we track the documents seen by
   * the most recent completion/hover/parse call here and resolve against that view.
   */
  const seenDocuments = new Map<string, TextDocument>();
  const hoverflyContribution = createHoverflyContribution(settings, (uri) =>
    seenDocuments.get(uri),
  );

  const service: LanguageService = getLanguageService({
    // The Hoverfly contribution runs first; caller-supplied contributions follow.
    contributions: [hoverflyContribution, ...contributions],
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
    seenDocuments.set(document.uri, document);
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
    parse(document: TextDocument): JSONDocument {
      return parse(stripLeadingBom(document));
    },
    isSimulation(document: TextDocument): boolean {
      return isHoverflySimulation(stripLeadingBom(document).getText());
    },
    doValidation(document: TextDocument, jsonDocument?: JSONDocument): Promise<Diagnostic[]> {
      /*
       * Normalise a leading BOM (offset-preserving) so a BOM-prefixed valid simulation is not
       * misclassified as HF101; the normalised view is threaded through the whole pipeline.
       */
      return validate(stripLeadingBom(document), jsonDocument);
    },
    async doComplete(
      document: TextDocument,
      position: Position,
      jsonDocument?: JSONDocument,
    ): Promise<CompletionList | null> {
      const normalized = stripLeadingBom(document);
      // Register the document so the contribution can resolve it for cross-reference completions.
      seenDocuments.set(normalized.uri, normalized);
      const parsed = jsonDocument ?? parse(normalized);

      /*
       * Templated-string IntelliSense: when the cursor sits inside a templatable body/header
       * string, the schema/JSON completions are irrelevant (we are inside a JSON string value),
       * so the template completions REPLACE them. The contribution API has no cursor offset, so
       * this is driven here, where the Position is available. Outside a template, fall through.
       */
      const templateItems = getTemplateCompletions(normalized, parsed, position);
      if (templateItems) {
        return { isIncomplete: false, items: templateItems };
      }
      return service.doComplete(normalized, position, parsed);
    },
    async doHover(
      document: TextDocument,
      position: Position,
      jsonDocument?: JSONDocument,
    ): Promise<Hover | null> {
      const normalized = stripLeadingBom(document);
      seenDocuments.set(normalized.uri, normalized);
      const parsed = jsonDocument ?? parse(normalized);
      // Template-token hover takes precedence inside templatable strings; else schema hover.
      const templateHover = getTemplateHover(normalized, parsed, position);
      if (templateHover) {
        return templateHover;
      }
      return service.doHover(normalized, position, parsed);
    },
  };
}
