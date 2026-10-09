import type {
    BooleanLiteral,
    Expression,
    NumberLiteral,
    PathExpression,
    Span,
    StringLiteral,
    SubExpression,
} from './ast.js';
import { findMatchingParen, skipWhitespace, tokenEnd } from './scan.js';

/** The source a parse reads, and the errors it records as it recovers. */
export type Scope = {
    readonly errors: (Span & { readonly message: string })[];
    readonly source: string;
};

const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/u;

export function parseCallParts(
    scope: Scope,
    from: number,
    to: number,
): undefined | { path: PathExpression; params: Expression[] } {
    let cursor = skipWhitespace(scope.source, from, to);
    const path = parsePath(scope, cursor, to);
    if (!path) {
        return undefined;
    }
    cursor = path.end;

    const params: Expression[] = [];
    cursor = skipWhitespace(scope.source, cursor, to);
    while (cursor < to) {
        const arg = parseExpression(scope, cursor, to);
        if (!arg) {
            scope.errors.push({
                message: `Unexpected token in arguments: "${scope.source.slice(cursor, to).trim()}"`,
                start: cursor,
                end: to,
            });
            break;
        }
        params.push(arg);
        cursor = skipWhitespace(scope.source, arg.end, to);
    }

    return { path, params };
}
function parseExpression(scope: Scope, cursor: number, to: number): Expression | undefined {
    const ch = scope.source.charAt(cursor);
    if (ch === '(') {
        return parseSubExpression(scope, cursor, to);
    }
    if (ch === "'" || ch === '"') {
        return parseStringLiteral(scope, cursor, to);
    }
    const literal = parseScalar(scope, cursor, to);
    if (literal) {
        return literal;
    }
    return parsePath(scope, cursor, to);
}
function parseSubExpression(scope: Scope, open: number, to: number): SubExpression | undefined {
    const closeParen = findMatchingParen(scope.source, open, to);
    const innerEnd = closeParen === -1 ? to : closeParen;
    const parsed = parseCallParts(scope, open + 1, innerEnd);
    const end = closeParen === -1 ? to : closeParen + 1;

    if (closeParen === -1) {
        scope.errors.push({
            message: "Unclosed subexpression — missing ')'",
            start: open,
            end: to,
        });
    }

    if (!parsed) {
        scope.errors.push({
            message: 'Empty subexpression — expected a helper',
            start: open,
            end,
        });
        return undefined;
    }

    return {
        type: 'SubExpression',
        start: open,
        end,
        path: parsed.path,
        params: parsed.params,
    };
}
function parseStringLiteral(scope: Scope, open: number, to: number): StringLiteral {
    const quote = scope.source[open] === '"' ? '"' : "'";
    let i = open + 1;
    // Stryker disable next-line EqualityOperator: equivalent — a literal unclosed at `to` is unclosed whatever the scan reads past it, and its value is clamped to `to`
    while (i < to) {
        const ch = scope.source[i];
        if (ch === '\\') {
            i += 2;
            continue;
        }
        if (ch === quote) {
            break;
        }
        i += 1;
    }
    // invariant: the scan stops before `to` only on the closing quote.
    const closed = i < to;
    const valueEnd = closed ? i : Math.min(i, to);
    const value = unescapeStringBody(scope.source.slice(open + 1, valueEnd));
    const end = closed ? i + 1 : to;
    if (!closed) {
        scope.errors.push({
            message: 'Unclosed string literal',
            start: open,
            end,
        });
    }
    return { type: 'StringLiteral', start: open, end, value, quote };
}
// outside: raymond honours `\'`, `\"` and `\\` inside a quoted literal.
function unescapeStringBody(body: string): string {
    return body.replaceAll(/\\(?<escaped>.)/gu, (_match, escaped: string) => escaped);
}
function parseScalar(
    scope: Scope,
    cursor: number,
    to: number,
): BooleanLiteral | NumberLiteral | undefined {
    const end = tokenEnd(scope.source, cursor, to);
    const text = scope.source.slice(cursor, end);

    if (text === 'true' || text === 'false') {
        return { type: 'BooleanLiteral', start: cursor, end, value: text === 'true' };
    }
    if (NUMBER_RE.test(text)) {
        return { type: 'NumberLiteral', start: cursor, end, value: Number(text), raw: text };
    }
    return undefined;
}
function parsePath(scope: Scope, cursor: number, to: number): PathExpression | undefined {
    const end = tokenEnd(scope.source, cursor, to);
    if (end === cursor) {
        return undefined;
    }
    const original = scope.source.slice(cursor, end);

    let rest = original;
    const data = rest.startsWith('@');
    if (data) {
        rest = rest.slice(1);
    }

    let thisRef = false;
    if (rest === 'this') {
        thisRef = true;
        rest = '';
    } else if (rest.startsWith('this.')) {
        thisRef = true;
        rest = rest.slice('this.'.length);
    }

    const parts = rest
        .split('.')
        .map((segment) => segment.replace(/^\[(?<inner>.*)\]$/u, '$<inner>'))
        .filter((segment) => segment.length > 0);

    return { type: 'PathExpression', start: cursor, end, parts, data, thisRef, original };
}
