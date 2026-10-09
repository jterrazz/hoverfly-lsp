// outside: Hoverfly compares method and scheme verbatim and never validates them at import
// (research/13 §3.1, §3.2; a live v1.12.8 run stores `GT` and `htttp` as written), so a custom
// value stays silent and only a near-miss of a standard value is a Hint.

import type { Diagnostic } from 'vscode-languageserver-types';

import { HTTP_METHODS, URI_SCHEMES, VALUE_DID_YOU_MEAN_MAX_DISTANCE } from '../../registry/http.js';
import type { DiagnosticCode } from '../catalog.data.js';
import { makeDiagnostic } from '../diagnostics.js';
import { nearestWithin } from '../levenshtein.js';
import type { MatcherModel, RuleContext, SemanticRule } from '../rule.js';

type ValueDomain = {
    readonly code: DiagnosticCode;
    readonly standard: readonly string[];
};

const VALUE_DOMAINS: Readonly<Record<string, ValueDomain>> = {
    method: { code: 'HF215', standard: HTTP_METHODS },
    scheme: { code: 'HF216', standard: URI_SCHEMES },
};

function isExactOrDefault(matcher: MatcherModel): boolean {
    const name = matcher.matcherName;
    return name === undefined || name === '' || name.toLowerCase() === 'exact';
}

function checkValue(
    context: RuleContext,
    matcher: MatcherModel,
    domain: ValueDomain,
    diagnostics: Diagnostic[],
): void {
    if (!isExactOrDefault(matcher)) {
        return;
    }
    const { valueNode } = matcher;
    if (valueNode?.type !== 'string') {
        return;
    }
    const { value } = valueNode;
    // value: case is folded — a case variant of a standard verb is not the typo HF215 targets,
    // though Hoverfly compares methods case-sensitively.
    const lower = value.toLowerCase();
    if (domain.standard.some((candidate) => candidate.toLowerCase() === lower)) {
        return;
    }
    const suggestion = nearestWithin(value, domain.standard, VALUE_DID_YOU_MEAN_MAX_DISTANCE);
    if (suggestion === undefined) {
        return;
    }
    diagnostics.push(
        makeDiagnostic(context.textDocument, domain.code, valueNode, { value, suggestion }),
    );
}

/** The HF215/HF216 rule: a Hint on a near-miss of a standard method or scheme, never on a custom value. */
export const methodSchemeValueRule: SemanticRule = {
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const pair of context.model.pairs) {
            for (const field of pair.request.fields) {
                if (field.container !== 'request') {
                    continue;
                }
                const domain = VALUE_DOMAINS[field.fieldName];
                if (!domain) {
                    continue;
                }
                for (const matcher of field.matchers) {
                    checkValue(context, matcher, domain, diagnostics);
                }
            }
        }
        return diagnostics;
    },
};

/** All HF2xx value-domain rules. The integrator spreads this into `ALL_RULES`. */
export const HF2XX_VALUE_RULES: readonly SemanticRule[] = [methodSchemeValueRule];
