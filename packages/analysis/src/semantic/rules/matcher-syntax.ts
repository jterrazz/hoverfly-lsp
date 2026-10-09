// invariant: HF203 owns a value of the wrong type and HF211 an empty one, so these rules judge only
// a correctly typed, non-empty value; glob is never judged — ryanuber/go-glob has no invalid
// syntax, `*` alone being special (research/14 §3.2, §4, §7).

import { XMLValidator } from 'fast-xml-parser';
import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import { isValidRe2 } from '../re2.js';
import type { FieldContainer, MatcherModel, RuleContext, SemanticRule } from '../rule.js';

function valueNodeOf(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function nestedMatcher(node: ASTNode, fieldName: string, container: FieldContainer): MatcherModel {
    const object = node.type === 'object' ? node : undefined;
    const matcherNode = valueNodeOf(object, 'matcher');
    return {
        node: object,
        matcherNode,
        matcherName: matcherNode?.type === 'string' ? matcherNode.value : undefined,
        valueNode: valueNodeOf(object, 'value'),
        configNode: valueNodeOf(object, 'config'),
        doMatchNode: valueNodeOf(object, 'doMatch'),
        parent: { fieldName, container },
    };
}

function walkMatchers(matchers: readonly MatcherModel[]): MatcherModel[] {
    const out: MatcherModel[] = [];
    const visit = (matcher: MatcherModel): void => {
        out.push(matcher);
        const { doMatchNode } = matcher;
        if (doMatchNode?.type === 'object') {
            visit(nestedMatcher(doMatchNode, matcher.parent.fieldName, matcher.parent.container));
        } else if (doMatchNode?.type === 'array') {
            for (const item of doMatchNode.items) {
                visit(nestedMatcher(item, matcher.parent.fieldName, matcher.parent.container));
            }
        }
    };
    for (const matcher of matchers) {
        visit(matcher);
    }
    return out;
}

function isBalanced(s: string): boolean {
    const stack: string[] = [];
    const close: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    let quote: "'" | '"' | undefined;
    for (const ch of s) {
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === '"' || ch === "'") {
            quote = ch;
            continue;
        }
        if (ch === '(' || ch === '[' || ch === '{') {
            stack.push(close[ch]!);
            continue;
        }
        if (ch === ')' || ch === ']' || ch === '}') {
            if (stack.pop() !== ch) {
                return false;
            }
        }
    }
    return stack.length === 0 && quote === undefined;
}

// value: a token's braces and regex metacharacters would trip the XML validator (research/14 §3.7).
function neutralizeTemplateTokens(xml: string): string {
    return xml.replaceAll(/\{\{.*?\}\}/gsu, 'x');
}

function extractTemplatedRegexes(xml: string): string[] {
    const out: string[] = [];
    // outside: mirrors Hoverfly's leaf regex `^\s*{{\s*regex:(.*)}}\s*$`, applied to each token.
    const tokenRe = /\{\{\s*regex:(?<pattern>.*?)\}\}/gsu;
    for (const match of xml.matchAll(tokenRe)) {
        out.push((match.groups?.pattern ?? '').trim());
    }
    return out;
}

function checkSyntax(context: RuleContext, matcher: MatcherModel, diagnostics: Diagnostic[]): void {
    const { matcherName, valueNode } = matcher;
    if (!valueNode) {
        return;
    }

    // outside: the matcher name is looked up case-insensitively (D8); an absent name is exact,
    // which has no syntax rule.
    const name = (matcherName ?? '').toLowerCase();

    switch (name) {
        case 'regex': {
            checkRegex(context, valueNode, diagnostics);
            return;
        }
        case 'json':
        case 'jsonpartial': {
            checkJsonText(context, name, valueNode, diagnostics);
            return;
        }
        case 'jwt': {
            checkJwt(context, valueNode, diagnostics);
            return;
        }
        case 'jsonpath':
        case 'jwtjsonpath': {
            checkBalance(context, 'HF232', valueNode, diagnostics);
            return;
        }
        case 'xpath': {
            checkBalance(context, 'HF233', valueNode, diagnostics);
            return;
        }
        case 'xml':
        case 'xmltemplated': {
            checkXml(context, name, valueNode, diagnostics);
            return;
        }
        case 'array': {
            checkArray(context, valueNode, diagnostics);
            return;
        }
        default: {
            return;
        }
    }
}

function checkRegex(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
    if (valueNode.type !== 'string') {
        return;
    }
    if (valueNode.value === '') {
        return;
    }
    if (!isValidRe2(valueNode.value)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF230', valueNode));
    }
}

function checkJsonText(
    context: RuleContext,
    name: string,
    valueNode: ASTNode,
    diagnostics: Diagnostic[],
): void {
    if (valueNode.type !== 'string') {
        return;
    }
    if (!parsesAsJson(valueNode.value)) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF231', valueNode, { name }));
    }
}

function checkJwt(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
    if (valueNode.type !== 'string') {
        return;
    }
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

function checkBalance(
    context: RuleContext,
    code: 'HF232' | 'HF233',
    valueNode: ASTNode,
    diagnostics: Diagnostic[],
): void {
    if (valueNode.type !== 'string') {
        return;
    }
    if (!isBalanced(valueNode.value)) {
        diagnostics.push(makeDiagnostic(context.textDocument, code, valueNode));
    }
}

function checkXml(
    context: RuleContext,
    name: string,
    valueNode: ASTNode,
    diagnostics: Diagnostic[],
): void {
    if (valueNode.type !== 'string') {
        return;
    }
    const raw = valueNode.value;

    if (name === 'xmltemplated') {
        for (const pattern of extractTemplatedRegexes(raw)) {
            if (pattern !== '' && !isValidRe2(pattern)) {
                diagnostics.push(makeDiagnostic(context.textDocument, 'HF230', valueNode));
            }
        }
    }

    const xml = name === 'xmltemplated' ? neutralizeTemplateTokens(raw) : raw;
    if (xml.trim() === '') {
        return;
    }
    if (XMLValidator.validate(xml) !== true) {
        diagnostics.push(makeDiagnostic(context.textDocument, 'HF234', valueNode, { name }));
    }
}

function checkArray(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
    if (valueNode.type !== 'array') {
        return;
    }
    valueNode.items.forEach((item, index) => {
        if (item.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF236', item, { i: index }));
        }
    });
}

// outside: JSON.parse reads the same strict grammar as Go's encoding/json.
function parsesAsJson(text: string): boolean {
    try {
        JSON.parse(text);
        return true;
    } catch {
        return false;
    }
}

/** The HF23x rule: one pass over every matcher, doMatch chains included, emitting the seven value-syntax codes. */
export const matcherSyntaxRule: SemanticRule = {
    codes: ['HF230', 'HF231', 'HF232', 'HF233', 'HF234', 'HF235', 'HF236'],
    run(context: RuleContext): Diagnostic[] {
        const diagnostics: Diagnostic[] = [];
        for (const pair of context.model.pairs) {
            for (const field of pair.request.fields) {
                for (const matcher of walkMatchers(field.matchers)) {
                    checkSyntax(context, matcher, diagnostics);
                }
            }
        }
        return diagnostics;
    },
};

/** All matcher-value-syntax rules. The integrator spreads this into `ALL_RULES`. */
export const MATCHER_SYNTAX_RULES: readonly SemanticRule[] = [matcherSyntaxRule];
