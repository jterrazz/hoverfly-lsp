import type { ASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import {
    ARRAY_CONFIG_KEYS,
    MATCHER_SPECS,
    TRANSFORMING_MATCHER_NAMES,
} from '../../registry/matchers.js';
import type { MatcherSpec, MatcherValueType } from '../../registry/matchers.js';
import { makeDiagnostic } from '../diagnostics.js';
import type { MatcherModel, RuleContext, SemanticRule } from '../rule.js';
import { walkMatchers } from './matcher-walk.js';
import type { WalkedMatcher } from './matcher-walk.js';

// invariant: form is dispatched before this lookup, so its entry here is never read.
const SPEC_BY_LOWER_NAME: ReadonlyMap<string, MatcherSpec> = new Map(
    MATCHER_SPECS.map((spec) => [spec.name.toLowerCase(), spec]),
);

const DEFAULT_SPEC: MatcherSpec | undefined = SPEC_BY_LOWER_NAME.get('');

const FORM_SPEC: MatcherSpec | undefined = MATCHER_SPECS.find((spec) => spec.bodyOnly === true);

const TRANSFORMING = new Set(TRANSFORMING_MATCHER_NAMES.map((name) => name.toLowerCase()));

const EMPTY_VALUE_NEVER_MATCHES = new Set(['jwtjsonpath', 'regex', 'glob']);

const ARRAY_CONFIG_KEY_SET: ReadonlySet<string> = new Set(ARRAY_CONFIG_KEYS);

// invariant: a boolean is the one valid config value, so it is never named; null reads as itself.
const ARTICLED_TYPE: Readonly<Record<string, string>> = {
    array: 'an array',
    number: 'a number',
    object: 'an object',
    string: 'a string',
};

function jsonTypeName(node: ASTNode): string {
    return ARTICLED_TYPE[node.type] ?? node.type;
}

const EXPECTED_VALUE_PHRASE: Readonly<Record<MatcherValueType, string>> = {
    array: 'a JSON array',
    object: 'an object',
    string: 'a string',
};

function isValidFormPlacement(matcher: MatcherModel, depth: number): boolean {
    return (
        matcher.parent.container === 'request' && matcher.parent.fieldName === 'body' && depth === 0
    );
}

// value: an unknown name or a misplaced form answers no spec, so no value check adds noise atop the
// hard error.
function checkNameAndPlacement(
    context: RuleContext,
    walked: WalkedMatcher,
    diagnostics: Diagnostic[],
): MatcherSpec | undefined {
    const { matcher, depth } = walked;
    const { matcherNode } = matcher;

    // value: a missing or non-string matcher name is the default matcher, as Hoverfly reads it.
    if (matcherNode?.type !== 'string') {
        return DEFAULT_SPEC;
    }
    const matcherName = matcherNode.value;

    const lower = matcherName.toLowerCase();

    // outside: Hoverfly dispatches the form family outside the registry, case-sensitively.
    if (lower === 'form') {
        if (matcherName !== 'form') {
            diagnostics.push(
                makeDiagnostic(context.textDocument, 'HF209', matcherNode, { name: matcherName }),
            );
            return undefined;
        }
        if (!isValidFormPlacement(matcher, depth)) {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF208', matcherNode));
            return undefined;
        }
        return FORM_SPEC;
    }

    const spec = SPEC_BY_LOWER_NAME.get(lower);
    if (!spec) {
        diagnostics.push(
            makeDiagnostic(context.textDocument, 'HF201', matcherNode, { name: matcherName }),
        );
        return undefined;
    }

    if (matcherName !== spec.name) {
        diagnostics.push(
            makeDiagnostic(context.textDocument, 'HF202', matcherNode, { canonical: spec.name }),
        );
    }
    return spec;
}

function checkValue(
    context: RuleContext,
    matcher: MatcherModel,
    spec: MatcherSpec,
    diagnostics: Diagnostic[],
): void {
    const { valueNode } = matcher;
    if (!valueNode) {
        return;
    }

    const lower = spec.name.toLowerCase();

    // value: HF207 takes precedence over HF203 for negate — a vacuous match is the accurate
    // warning, not a match that never happens.
    if (lower === 'negate') {
        if (valueNode.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF207', valueNode));
        }
        return;
    }

    if (valueNode.type !== spec.valueType) {
        diagnostics.push(
            makeDiagnostic(context.textDocument, 'HF203', valueNode, {
                name: spec.name,
                expected: EXPECTED_VALUE_PHRASE[spec.valueType],
            }),
        );
        return;
    }

    if (
        // Stryker disable next-line ConditionalExpression: equivalent — the three never-matching matchers accept a string alone, so any other value returned at HF203
        valueNode.type === 'string' &&
        valueNode.value === '' &&
        EMPTY_VALUE_NEVER_MATCHES.has(lower)
    ) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF211', valueNode, { name: lower }));
    }
}

function checkConfig(
    context: RuleContext,
    matcher: MatcherModel,
    spec: MatcherSpec,
    diagnostics: Diagnostic[],
): void {
    const { configNode } = matcher;
    if (!configNode) {
        return;
    }

    if (!spec.supportsConfig) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF204', configNode));
        return;
    }

    if (configNode.type !== 'object') {
        return;
    }

    for (const property of configNode.properties) {
        const key = property.keyNode.value;
        if (!ARRAY_CONFIG_KEY_SET.has(key)) {
            diagnostics.push(
                makeDiagnostic(context.textDocument, 'HF205', property.keyNode, { key }),
            );
            continue;
        }
        const value = property.valueNode;
        if (value && value.type !== 'boolean') {
            diagnostics.push(
                makeDiagnostic(context.textDocument, 'HF206', value, { type: jsonTypeName(value) }),
            );
        }
    }
}

function checkDoMatch(
    context: RuleContext,
    walked: WalkedMatcher,
    spec: MatcherSpec | undefined,
    diagnostics: Diagnostic[],
): void {
    const { matcher, doMatchKeyNode } = walked;
    if (!matcher.doMatchNode || !doMatchKeyNode || !spec) {
        return;
    }
    if (!TRANSFORMING.has(spec.name.toLowerCase())) {
        diagnostics.push(
            makeDiagnostic(context.textDocument, 'HF210', doMatchKeyNode, { name: spec.name }),
        );
    }
}

/** The HF2xx rule: one pass over every matcher, doMatch chains included, emitting the eleven matcher codes. */
export const hf2xxMatcherRule: SemanticRule = {
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];

        for (const pair of context.model.pairs) {
            for (const field of pair.request.fields) {
                for (const walked of walkMatchers(field.matchers)) {
                    const spec = checkNameAndPlacement(context, walked, diagnostics);
                    if (spec) {
                        checkValue(context, walked.matcher, spec, diagnostics);
                        checkConfig(context, walked.matcher, spec, diagnostics);
                    }
                    checkDoMatch(context, walked, spec, diagnostics);
                }
            }
        }

        return diagnostics;
    },
};

/** All HF2xx matcher rules. The integrator spreads this into `ALL_RULES`. */
export const HF2XX_RULES: readonly SemanticRule[] = [hf2xxMatcherRule];
