// outside: Go's encoding/json matches a struct field case-insensitively and silently drops an
// unknown key, so a typo loses the user's data (HF603) and a case variant binds but is not
// canonical (HF604).

import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { DID_YOU_MEAN_MAX_DISTANCE, STRUCTURE_ALLOWED_KEYS } from '../../registry/structure.js';
import type { StructureObjectKind } from '../../registry/structure.js';
import { makeDiagnostic } from '../diagnostics.js';
import { levenshtein } from '../levenshtein.js';
import type { RuleContext, SemanticRule } from '../rule.js';

const CANONICAL_BY_LOWER: Readonly<Record<StructureObjectKind, ReadonlyMap<string, string>>> =
    Object.fromEntries(
        (Object.keys(STRUCTURE_ALLOWED_KEYS) as StructureObjectKind[]).map((kind) => [
            kind,
            new Map(STRUCTURE_ALLOWED_KEYS[kind].map((key) => [key.toLowerCase(), key])),
        ]),
    ) as unknown as Record<StructureObjectKind, ReadonlyMap<string, string>>;

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
    return node?.type === 'object' ? node : undefined;
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
    const value = propValue(node, key);
    return value?.type === 'array' ? value.items : [];
}

function didYouMean(key: string, allowed: readonly string[]): string {
    let best: string | undefined;
    let bestDistance = DID_YOU_MEAN_MAX_DISTANCE + 1;
    for (const candidate of allowed) {
        const distance = levenshtein(key, candidate);
        if (distance < bestDistance || (distance === bestDistance && candidate < (best ?? ''))) {
            best = candidate;
            bestDistance = distance;
        }
    }
    return best !== undefined && bestDistance <= DID_YOU_MEAN_MAX_DISTANCE
        ? ` (did you mean "${best}"?)`
        : '';
}

function checkUnknownKeys(
    context: RuleContext,
    object: ObjectASTNode,
    kind: StructureObjectKind,
    diagnostics: Diagnostic[],
): void {
    const canonicalByLower = CANONICAL_BY_LOWER[kind];
    const allowed = STRUCTURE_ALLOWED_KEYS[kind];
    for (const property of object.properties) {
        const key = property.keyNode.value;
        const canonical = canonicalByLower.get(key.toLowerCase());
        if (canonical === undefined) {
            diagnostics.push(
                makeDiagnostic(context.textDocument, 'HF603', property.keyNode, {
                    key,
                    didYouMean: didYouMean(key, allowed),
                }),
            );
        } else if (canonical !== key) {
            diagnostics.push(
                makeDiagnostic(context.textDocument, 'HF604', property.keyNode, { key, canonical }),
            );
        }
    }
}

// value: a negate without a value is HF207's, a form HF208's.
const HF212_EXEMPT = new Set(['negate', 'form']);

// outside: a matcher with no value compares against nil and can never match; a bare `{ value }` is
// the default exact matcher.
function checkMatcherValuePresence(
    context: RuleContext,
    object: ObjectASTNode,
    diagnostics: Diagnostic[],
): void {
    const hasValue = object.properties.some((p) => p.keyNode.value === 'value');
    if (hasValue) {
        return;
    }
    const matcherNode = propValue(object, 'matcher');
    if (matcherNode?.type === 'string' && HF212_EXEMPT.has(matcherNode.value.toLowerCase())) {
        return;
    }
    diagnostics.push(makeDiagnostic(context.textDocument, 'HF212', object));
}

function walkFieldMatcher(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'fieldMatcher', diagnostics);
    checkMatcherValuePresence(context, object, diagnostics);

    const doMatch = propValue(object, 'doMatch');
    if (doMatch?.type === 'object') {
        walkFieldMatcher(context, doMatch, diagnostics);
    } else if (doMatch?.type === 'array') {
        // invariant: a legacy array-shaped doMatch is a schema error, still walked so the matchers
        // it nests are checked.
        for (const item of doMatch.items) {
            walkFieldMatcher(context, item, diagnostics);
        }
    }
}

function walkMatcherArray(
    context: RuleContext,
    value: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    if (value?.type !== 'array') {
        return;
    }
    for (const item of value.items) {
        walkFieldMatcher(context, item, diagnostics);
    }
}

// invariant: headers and query are maps keyed by user data — their keys are never judged, their
// matcher arrays are.
function walkRequestMatcherMap(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    for (const property of object.properties) {
        walkMatcherArray(context, property.valueNode, diagnostics);
    }
}

function walkRequest(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'request', diagnostics);

    for (const field of ['path', 'method', 'destination', 'scheme', 'body']) {
        walkMatcherArray(context, propValue(object, field), diagnostics);
    }
    walkRequestMatcherMap(context, propValue(object, 'headers'), diagnostics);
    walkRequestMatcherMap(context, propValue(object, 'query'), diagnostics);
    checkStateValues(context, propValue(object, 'requiresState'), diagnostics);
}

function checkStateValues(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    for (const property of object.properties) {
        const value = property.valueNode;
        if (value && value.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF404', value));
        }
    }
}

function checkResponseHeaders(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    for (const property of object.properties) {
        const value = property.valueNode;
        if (!value) {
            continue;
        }
        if (value.type !== 'array' || value.items.some((item) => item.type !== 'string')) {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF308', value));
        }
    }
}

function checkRemovesState(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    if (node?.type !== 'array') {
        return;
    }
    for (const item of node.items) {
        if (item.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF405', item));
        }
    }
}

function walkResponse(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'response', diagnostics);
    checkResponseHeaders(context, propValue(object, 'headers'), diagnostics);
    checkStateValues(context, propValue(object, 'transitionsState'), diagnostics);
    checkRemovesState(context, propValue(object, 'removesState'), diagnostics);

    const logNormalDelay = asObject(propValue(object, 'logNormalDelay'));
    if (logNormalDelay) {
        checkUnknownKeys(context, logNormalDelay, 'logNormalDelay', diagnostics);
    }
}

function walkPair(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'pair', diagnostics);
    walkRequest(context, propValue(object, 'request'), diagnostics);
    walkResponse(context, propValue(object, 'response'), diagnostics);
}

function walkClosedItems(
    context: RuleContext,
    items: readonly ASTNode[],
    kind: StructureObjectKind,
    diagnostics: Diagnostic[],
): void {
    for (const item of items) {
        const object = asObject(item);
        if (object) {
            checkUnknownKeys(context, object, kind, diagnostics);
        }
    }
}

function walkGlobalActions(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'globalActions', diagnostics);
    walkClosedItems(context, arrayItems(object, 'delays'), 'delaysItem', diagnostics);
    walkClosedItems(
        context,
        arrayItems(object, 'delaysLogNormal'),
        'delaysLogNormalItem',
        diagnostics,
    );
}

function walkData(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    checkUnknownKeys(context, object, 'data', diagnostics);
    for (const pair of arrayItems(object, 'pairs')) {
        walkPair(context, pair, diagnostics);
    }
    walkClosedItems(context, arrayItems(object, 'literals'), 'literalsItem', diagnostics);
    walkClosedItems(context, arrayItems(object, 'variables'), 'variablesItem', diagnostics);
    walkGlobalActions(context, propValue(object, 'globalActions'), diagnostics);
}

const structureRule: SemanticRule = {
    codes: ['HF212', 'HF308', 'HF404', 'HF405', 'HF603', 'HF604'],
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const { root } = context.model;
        if (!root) {
            return diagnostics;
        }
        // value: the root is not judged for unknown keys — additionalProperties:false already
        // reports them as HF102 (report 13 §6).
        walkData(context, propValue(root, 'data'), diagnostics);

        const meta = asObject(propValue(root, 'meta'));
        if (meta) {
            checkUnknownKeys(context, meta, 'meta', diagnostics);
        }
        return diagnostics;
    },
};

/** All structure rules. The integrator spreads this into `rules/families.ts#ALL_RULES`. */
export const STRUCTURE_RULES: readonly SemanticRule[] = [structureRule];

export { structureRule };
