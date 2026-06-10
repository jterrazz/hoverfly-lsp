/**
 * The semantic engine: runs registered {@link SemanticRule}s over a {@link RuleContext} and
 * owns the HF102 layer.
 *
 * HF102 layer (the amazon-states lesson, report 05 / catalog notes):
 *   1. Re-tag every schema diagnostic from `vscode-json-languageservice` with code `HF102`
 *      and `source: "hoverfly"`, preserving its message/range/severity.
 *   2. SUPPRESS a schema diagnostic when a more specific HF2xx semantic diagnostic fires on
 *      the same node (overlapping range) — the semantic message is clearer than the noisy
 *      oneOf/enum schema failure (decision D5).
 */

import type { JSONDocument } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { type Diagnostic, type Range } from "vscode-languageserver-types";

import { DIAGNOSTIC_CATALOG, DIAGNOSTIC_SOURCE } from "./catalog.js";
import { buildSimulationModel } from "./model.js";
import type {
  HoverflyServiceSettings,
  RuleContext,
  SemanticRule,
  SimulationModel,
} from "./types.js";

const HF102_HREF = DIAGNOSTIC_CATALOG.HF102.href;

function isBefore(
  a: { line: number; character: number },
  b: { line: number; character: number },
): boolean {
  return a.line < b.line || (a.line === b.line && a.character < b.character);
}

/** Two ranges overlap when neither ends strictly before the other starts. */
function rangesOverlap(a: Range, b: Range): boolean {
  return !(isBefore(a.end, b.start) || isBefore(b.end, a.start));
}

/** HF2xx codes are the "more specific matcher diagnostic" that suppresses schema noise. */
function isMatcherCode(code: Diagnostic["code"]): boolean {
  return typeof code === "string" && /^HF2\d\d$/.test(code);
}

/** Re-tag one raw schema diagnostic as HF102, preserving its message/range/severity. */
function retagAsHF102(schema: Diagnostic): Diagnostic {
  return {
    code: "HF102",
    source: DIAGNOSTIC_SOURCE,
    severity: schema.severity,
    range: schema.range,
    message: schema.message,
    codeDescription: { href: HF102_HREF },
  };
}

/** Build a {@link RuleContext} with a lazily-built, memoised {@link SimulationModel}. */
export function createRuleContext(
  textDocument: TextDocument,
  jsonDocument: JSONDocument,
  settings: HoverflyServiceSettings = {},
): RuleContext {
  let cached: SimulationModel | undefined;
  return {
    textDocument,
    jsonDocument,
    settings,
    get model(): SimulationModel {
      cached ??= buildSimulationModel(jsonDocument);
      return cached;
    },
  };
}

/** Run every rule, swallowing per-rule failures so one buggy rule cannot blank the pass. */
export function runRules(rules: readonly SemanticRule[], context: RuleContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const rule of rules) {
    try {
      out.push(...rule.run(context));
    } catch {
      // A rule must never throw; if one does, drop its output rather than fail validation.
    }
  }
  return out;
}

/**
 * Re-tag raw schema diagnostics as HF102 and suppress those overlapping an HF2xx diagnostic.
 *
 * @param schemaDiagnostics diagnostics straight from `service.doValidation`.
 * @param semanticDiagnostics the HFxxx diagnostics from {@link runRules}.
 */
export function applyHF102Layer(
  schemaDiagnostics: readonly Diagnostic[],
  semanticDiagnostics: readonly Diagnostic[],
): Diagnostic[] {
  const matcherRanges = semanticDiagnostics
    .filter((d) => isMatcherCode(d.code))
    .map((d) => d.range);

  return schemaDiagnostics
    .filter((schema) => !matcherRanges.some((range) => rangesOverlap(range, schema.range)))
    .map(retagAsHF102);
}

/** Sort diagnostics by range (start line, then character, then end) for stable output. */
export function sortByRange(diagnostics: Diagnostic[]): Diagnostic[] {
  return [...diagnostics].sort((a, b) => {
    if (a.range.start.line !== b.range.start.line) {
      return a.range.start.line - b.range.start.line;
    }
    if (a.range.start.character !== b.range.start.character) {
      return a.range.start.character - b.range.start.character;
    }
    if (a.range.end.line !== b.range.end.line) {
      return a.range.end.line - b.range.end.line;
    }
    return a.range.end.character - b.range.end.character;
  });
}
