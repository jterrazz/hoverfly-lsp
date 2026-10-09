// outside: Hoverfly compiles a delay's urlPattern as a Go RE2 regex (core/models/delay.go,
// delay_log_normal.go), checked with the shared re2js engine HF230 uses; post-serve actions are
// registered at runtime, so HF602 reads the allowlist the settings give and stays silent without
// one.

import type { ASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import { isValidRe2 } from '../re2.js';
import type { RuleContext, SemanticRule } from '../rule.js';

function stringPropValue(node: ASTNode | undefined, key: string): ASTNode | undefined {
    if (node?.type !== 'object') {
        return undefined;
    }
    return node.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function hf601(context: RuleContext): Diagnostic[] {
    const { delays, delaysLogNormal } = context.model.globalActions;
    const out: Diagnostic[] = [];
    for (const delay of [...delays, ...delaysLogNormal]) {
        const { urlPatternNode, urlPattern } = delay;
        if (!urlPatternNode || urlPattern === undefined) {
            continue;
        }
        if (!isValidRe2(urlPattern)) {
            out.push(makeDiagnostic(context.textDocument, 'HF601', urlPatternNode));
        }
    }
    return out;
}

function hf602(context: RuleContext): Diagnostic[] {
    const allow = context.settings.registeredActions;
    if (!allow || allow.length === 0) {
        return [];
    }
    const allowed = new Set(allow);

    const out: Diagnostic[] = [];
    for (const pair of context.model.pairs) {
        const valueNode = stringPropValue(pair.response.node, 'postServeAction');
        if (valueNode?.type !== 'string') {
            continue;
        }
        const action = valueNode.value;
        if (action.length === 0 || allowed.has(action)) {
            continue;
        }
        out.push(makeDiagnostic(context.textDocument, 'HF602', valueNode, { a: action }));
    }
    return out;
}

/** HF601 — invalid globalActions delay urlPattern. */
export const hf601DelayPatternRule: SemanticRule = {
    codes: ['HF601'],
    run: hf601,
};

/** HF602 — postServeAction not in the configured allowlist. */
export const hf602PostServeActionRule: SemanticRule = {
    codes: ['HF602'],
    run: hf602,
};

/** All HF6xx rules. The integrator spreads this into `rules/families.ts#ALL_RULES`. */
export const HF6XX_RULES: readonly SemanticRule[] = [
    hf601DelayPatternRule,
    hf602PostServeActionRule,
];
