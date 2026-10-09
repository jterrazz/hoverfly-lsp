// invariant: HF203 owns a value of the wrong type and HF211 an empty one, so these rules judge only
// a correctly typed, non-empty value; glob is never judged — ryanuber/go-glob has no invalid
// syntax, `*` alone being special (research/14 §3.2, §4, §7).

import { SyntaxValidator } from 'fast-xml-validator';
import type { ASTNode, StringASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import { isValidRe2 } from '../re2.js';
import type { MatcherModel, RuleContext, SemanticRule } from '../rule.js';
import { isBalanced } from './balance.js';
import { walkMatchers } from './matcher-walk.js';

// value: a token's braces and regex metacharacters would trip the XML validator (research/14 §3.7).
function neutralizeTemplateTokens(xml: string): string {
    return xml.replaceAll(/\{\{.*?\}\}/gsu, 'x');
}

// outside: mirrors Hoverfly's leaf regex `^\s*{{\s*regex:(.*)}}\s*$`, applied to each token.
const TEMPLATED_REGEX = /\{\{\s*regex:(?<pattern>.*?)\}\}/gsu;

type SyntaxCheck = (
    context: RuleContext,
    name: string,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
) => void;

function checkRegex(
    context: RuleContext,
    _name: string,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
): void {
    if (!isValidRe2(valueNode.value)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF230', valueNode));
    }
}

function checkJsonText(
    context: RuleContext,
    name: string,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
): void {
    if (!parsesAsJson(valueNode.value)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF231', valueNode, { name }));
    }
}

function checkJwt(
    context: RuleContext,
    _name: string,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
): void {
    let parsed: unknown;
    try {
        parsed = JSON.parse(valueNode.value);
    } catch {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF231', valueNode, { name: 'jwt' }));
        return;
    }
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) {
        for (const key of Object.keys(parsed)) {
            if (key !== 'header' && key !== 'payload') {
                diagnostics.push(
                    makeDiagnostic(context.textDocument, 'HF235', valueNode, { k: key }),
                );
            }
        }
    }
}

function balanceCheck(code: 'HF232' | 'HF233'): SyntaxCheck {
    return (context, _name, valueNode, diagnostics) => {
        if (!isBalanced(valueNode.value)) {
            diagnostics.push(makeDiagnostic(context.textDocument, code, valueNode));
        }
    };
}

function checkTemplatedRegexes(
    context: RuleContext,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
): void {
    for (const match of valueNode.value.matchAll(TEMPLATED_REGEX)) {
        // Stryker disable next-line OptionalChaining,StringLiteral: equivalent — the named group always participates, so it is always a string
        if (!isValidRe2(match.groups?.pattern ?? '')) {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF230', valueNode));
        }
    }
}

function checkXml(
    context: RuleContext,
    name: string,
    valueNode: StringASTNode,
    diagnostics: Diagnostic[],
): void {
    const templated = name === 'xmltemplated';
    if (templated) {
        checkTemplatedRegexes(context, valueNode, diagnostics);
    }
    const xml = templated ? neutralizeTemplateTokens(valueNode.value) : valueNode.value;
    if (xml.trim() === '') {
        return;
    }
    if (!isWellFormedXml(xml)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF234', valueNode, { name }));
    }
}

// outside: the validator answers true or throws the first fault it meets.
function isWellFormedXml(xml: string): boolean {
    try {
        SyntaxValidator.validate(xml);
    } catch {
        return false;
    }
    return true;
}

// outside: JSON.parse reads the same strict grammar as Go's encoding/json.
function parsesAsJson(text: string): boolean {
    try {
        JSON.parse(text);
    } catch {
        return false;
    }
    return true;
}

// outside: the matcher name is looked up case-insensitively (D8); exact, glob and an absent name
// have no syntax rule.
const STRING_CHECKS: ReadonlyMap<string, SyntaxCheck> = new Map([
    ['regex', checkRegex],
    ['json', checkJsonText],
    ['jsonpartial', checkJsonText],
    ['jwt', checkJwt],
    ['jsonpath', balanceCheck('HF232')],
    ['jwtjsonpath', balanceCheck('HF232')],
    ['xpath', balanceCheck('HF233')],
    ['xml', checkXml],
    ['xmltemplated', checkXml],
]);

function checkArrayItems(
    context: RuleContext,
    items: readonly ASTNode[],
    diagnostics: Diagnostic[],
): void {
    for (const [index, item] of items.entries()) {
        if (item.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF236', item, { i: index }));
        }
    }
}

function checkSyntax(context: RuleContext, matcher: MatcherModel, diagnostics: Diagnostic[]): void {
    const { matcherName, valueNode } = matcher;
    const name = String(matcherName).toLowerCase();
    if (name === 'array') {
        if (valueNode?.type === 'array') {
            checkArrayItems(context, valueNode.items, diagnostics);
        }
        return;
    }
    if (valueNode?.type === 'string') {
        STRING_CHECKS.get(name)?.(context, name, valueNode, diagnostics);
    }
}

/** The HF23x rule: one pass over every matcher, doMatch chains included, emitting the seven value-syntax codes. */
export const matcherSyntaxRule: SemanticRule = {
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const pair of context.model.pairs) {
            for (const field of pair.request.fields) {
                for (const { matcher } of walkMatchers(field.matchers)) {
                    checkSyntax(context, matcher, diagnostics);
                }
            }
        }
        return diagnostics;
    },
};

/** All matcher-value-syntax rules. The integrator spreads this into `ALL_RULES`. */
export const MATCHER_SYNTAX_RULES: readonly SemanticRule[] = [matcherSyntaxRule];
