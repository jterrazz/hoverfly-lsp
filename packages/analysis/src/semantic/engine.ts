import type { JSONDocument } from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, Range } from 'vscode-languageserver-types';

import { DIAGNOSTIC_SOURCE } from './catalog.data.js';
import { diagnosticHref } from './diagnostics.js';
import { buildSimulationModel } from './model.js';
import type {
    HoverflyServiceSettings,
    RuleContext,
    SemanticRule,
    SimulationModel,
} from './rule.js';

const HF102_HREF = diagnosticHref('HF102');

function isBefore(
    a: { line: number; character: number },
    b: { line: number; character: number },
): boolean {
    return a.line < b.line || (a.line === b.line && a.character < b.character);
}

function rangesOverlap(a: Range, b: Range): boolean {
    return !(isBefore(a.end, b.start) || isBefore(b.end, a.start));
}

// invariant: a code here replaces the schema message on its node — every HF2xx code, and
// HF308/HF404/HF405, each a targeted restatement of an import-400 gojsonschema also reports
// (reports 13 §3.5, §3.13, §3.14) — so the overlapping schema diagnostic is dropped (decision D5).
const VALUE_SHAPE_SUPPRESSORS: ReadonlySet<string> = new Set(['HF308', 'HF404', 'HF405']);

function suppressesSchema(code: Diagnostic['code']): boolean {
    return (
        typeof code === 'string' && (/^HF2\d\d$/u.test(code) || VALUE_SHAPE_SUPPRESSORS.has(code))
    );
}

function retagAsHF102(schema: Diagnostic): Diagnostic {
    return {
        code: 'HF102',
        source: DIAGNOSTIC_SOURCE,
        // outside: under exactOptionalPropertyTypes an absent severity stays absent, never
        // `undefined`.
        ...(schema.severity === undefined ? {} : { severity: schema.severity }),
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
            // invariant: a rule never fails the validation — a rule that throws loses its own
            // output alone.
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
    const suppressorRanges = semanticDiagnostics
        .filter((d) => suppressesSchema(d.code))
        .map((d) => d.range);

    return schemaDiagnostics
        .filter((schema) => !suppressorRanges.some((range) => rangesOverlap(range, schema.range)))
        .map(retagAsHF102);
}

/** Sort diagnostics by range (start line, then character, then end) for stable output. */
export function sortByRange(diagnostics: Diagnostic[]): Diagnostic[] {
    return [...diagnostics].toSorted((a, b) => {
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
