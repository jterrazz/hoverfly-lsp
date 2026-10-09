// invariant: HF510 and HF511 never fire together — a raymond built-in is HF510, any other unknown
// function HF511 — so one rule decides both.

import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import {
    HOVERFLY_HELPERS,
    RAYMOND_BUILTINS,
    VARIABLE_FUNCTION_NAMES,
} from '../../registry/templating.js';
import type { HelperSpec } from '../../registry/templating.js';
import { makeDiagnostic } from '../diagnostics.js';
import type { MatcherModel, RuleContext, SemanticRule } from '../rule.js';

const VALID_VARIABLE_FUNCTIONS: ReadonlySet<string> = new Set(VARIABLE_FUNCTION_NAMES);

const RAYMOND_BUILTIN_NAMES: ReadonlySet<string> = new Set(RAYMOND_BUILTINS.map((h) => h.name));

const HELPER_SPEC_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
    HOVERFLY_HELPERS.map((helper) => [helper.name, helper]),
);

const NON_WORD_CHAR = /[^A-Za-z0-9_]/u;

function propValue(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function dataArrayItems(dataNode: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
    const array = propValue(dataNode, key);
    return array?.type === 'array' ? array.items : [];
}

function checkVariableFunction(
    context: RuleContext,
    fnNode: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    if (fnNode?.type !== 'string') {
        return;
    }
    const name = fnNode.value;
    if (VALID_VARIABLE_FUNCTIONS.has(name)) {
        return;
    }
    if (RAYMOND_BUILTIN_NAMES.has(name)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF510', fnNode));
        return;
    }
    diagnostics.push(makeDiagnostic(context.textDocument, 'HF511', fnNode, { name }));
}

function describeArity(spec: HelperSpec): string {
    const required = spec.args.filter((arg) => !arg.optional).length;
    if (spec.variadic) {
        return `at least ${String(required)}`;
    }
    const max = spec.args.length;
    return required === max ? String(required) : `${String(required)} to ${String(max)}`;
}

function checkVariableArity(
    context: RuleContext,
    item: ObjectASTNode,
    diagnostics: Diagnostic[],
): void {
    const fnNode = propValue(item, 'function');
    if (fnNode?.type !== 'string') {
        return;
    }
    const spec = HELPER_SPEC_BY_NAME.get(fnNode.value);
    if (!spec) {
        return;
    }

    const argsNode = propValue(item, 'arguments');
    const got = argsNode?.type === 'array' ? argsNode.items.length : 0;
    const required = spec.args.filter((arg) => !arg.optional).length;
    const max = spec.variadic ? Number.POSITIVE_INFINITY : spec.args.length;

    if (got < required || got > max) {
        const target = argsNode ?? item;
        diagnostics.push(
            makeDiagnostic(context.textDocument, 'HF512', target, {
                fn: spec.name,
                sig: describeArity(spec),
                n: String(got),
            }),
        );
    }
}

function checkName(context: RuleContext, item: ObjectASTNode, diagnostics: Diagnostic[]): void {
    const nameNode = propValue(item, 'name');
    if (nameNode?.type !== 'string') {
        return;
    }
    const name = nameNode.value;
    if (name.length > 0 && NON_WORD_CHAR.test(name)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF214', nameNode, { n: name }));
    }
}

// invariant: only an exact or default matcher compares literally, so only there is a `://`
// certainly a mistake; a glob or regex destination may hold slashes.
function isLiteralMatcher(matcher: MatcherModel): boolean {
    const name = matcher.matcherName;
    return name === undefined || name === '' || name.toLowerCase() === 'exact';
}

function checkDestination(
    context: RuleContext,
    matcher: MatcherModel,
    diagnostics: Diagnostic[],
): void {
    if (matcher.parent.container !== 'request' || matcher.parent.fieldName !== 'destination') {
        return;
    }
    if (!isLiteralMatcher(matcher)) {
        return;
    }
    const { valueNode } = matcher;
    if (valueNode?.type !== 'string' || !valueNode.value.includes('://')) {
        return;
    }
    diagnostics.push(
        makeDiagnostic(context.textDocument, 'HF213', valueNode, { v: valueNode.value }),
    );
}

const HF5XX_VARIABLES_CODES = ['HF213', 'HF214', 'HF510', 'HF511', 'HF512'] as const;

const hf5xxVariablesRule: SemanticRule = {
    codes: HF5XX_VARIABLES_CODES,
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        const { dataNode } = context.model;

        for (const item of dataArrayItems(dataNode, 'variables')) {
            if (item.type !== 'object') {
                continue;
            }
            checkVariableFunction(context, propValue(item, 'function'), diagnostics);
            checkVariableArity(context, item, diagnostics);
            checkName(context, item, diagnostics);
        }

        for (const item of dataArrayItems(dataNode, 'literals')) {
            if (item.type !== 'object') {
                continue;
            }
            checkName(context, item, diagnostics);
        }

        for (const pair of context.model.pairs) {
            for (const requestField of pair.request.fields) {
                for (const matcher of requestField.matchers) {
                    checkDestination(context, matcher, diagnostics);
                }
            }
        }

        return diagnostics;
    },
};

/** All HF5xx variable/structural rules. The integrator spreads this into `ALL_RULES`. */
const HF5XX_VARIABLES_RULES: readonly SemanticRule[] = [hf5xxVariablesRule];

export { HF5XX_VARIABLES_RULES, hf5xxVariablesRule };
