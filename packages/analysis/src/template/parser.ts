// outside: hand-rolled (D8; report 08 §5.2 forbids a handlebars dependency) to keep exact offsets
// into the decoded source and the raymond fork's quirks — the `equal` and `first` blocks, `@data`
// variables, the Request.Body method call, single or double quotes; an unclosed mustache or block,
// a mismatched close or a bad token is recorded and skipped to the next `{{`, so the rest of the
// template is still analysed.

import type {
    BlockNode,
    BooleanLiteral,
    ContentNode,
    Expression,
    MustacheNode,
    NumberLiteral,
    PathExpression,
    Program,
    Span,
    Statement,
    StringLiteral,
    SubExpression,
} from './ast.js';

/** A recoverable parse error with an offset range into the decoded source. */
type TemplateParseError = Span & {
    readonly message: string;
};

/** The result of {@link parse}: a (possibly partial) AST plus any recovered-from errors. */
type ParseResult = {
    readonly ast: Program;
    readonly errors: readonly TemplateParseError[];
};

const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/u;

class Parser {
    private readonly source: string;
    private pos = 0;
    private readonly errors: TemplateParseError[] = [];

    constructor(source: string) {
        this.source = source;
    }

    parse(): ParseResult {
        const body = this.parseStatements();
        const ast: Program = {
            type: 'Program',
            start: 0,
            end: this.source.length,
            body,
        };
        return { ast, errors: this.errors };
    }

    private parseStatements(closers?: ReadonlySet<string>): Statement[] {
        const out: Statement[] = [];

        while (this.pos < this.source.length) {
            const open = this.source.indexOf('{{', this.pos);

            if (open === -1) {
                this.pushContent(out, this.pos, this.source.length);
                this.pos = this.source.length;
                break;
            }

            this.pushContent(out, this.pos, open);

            if (closers && this.isTerminator(open)) {
                this.pos = open;
                return out;
            }

            const statement = this.parseMustacheOrBlock(open);
            if (statement) {
                out.push(statement);
            }
        }

        return out;
    }

    private isTerminator(open: number): boolean {
        const after = this.skipWhitespace(open + 2);
        const ch = this.source[after];
        if (ch === '/') {
            return true;
        }
        if (this.source.startsWith('else', after)) {
            const boundary = this.source[after + 4];
            return boundary === undefined || /[\s}]/u.test(boundary);
        }
        return false;
    }

    private pushContent(out: Statement[], start: number, end: number): void {
        if (end > start) {
            const value = this.source.slice(start, end);
            const node: ContentNode = { type: 'ContentNode', start, end, value };
            out.push(node);
        }
    }

    private parseMustacheOrBlock(open: number): Statement | undefined {
        const triple = this.source.startsWith('{{{', open);
        const openLen = triple ? 3 : 2;
        const closeMarker = triple ? '}}}' : '}}';

        const close = this.findClose(open + openLen, closeMarker);
        if (close === -1) {
            this.errors.push({
                message: 'Unclosed mustache — missing closing braces',
                start: open,
                end: this.source.length,
            });
            // invariant: the parser always moves past the `{{`, so a malformed mustache cannot loop
            // it.
            this.pos = open + openLen;
            return undefined;
        }

        const innerStart = open + openLen;
        const innerEnd = close;
        const tagEnd = close + closeMarker.length;
        const inner = this.source.slice(innerStart, innerEnd).trim();

        if (inner.startsWith('/')) {
            const name = inner.slice(1).trim();
            this.errors.push({
                message: `Unexpected closing block {{/${name}}} — no matching open block`,
                start: open,
                end: tagEnd,
            });
            this.pos = tagEnd;
            return undefined;
        }

        if (inner.startsWith('#')) {
            return this.parseBlock(open, innerStart, innerEnd, tagEnd);
        }

        this.pos = tagEnd;
        return this.parseMustacheBody(open, tagEnd, innerStart, innerEnd, !triple);
    }

    // invariant: quote-aware — a `}}` inside a quoted string does not close the mustache.
    private findClose(from: number, marker: string): number {
        let i = from;
        let quote: string | undefined;
        while (i < this.source.length) {
            const ch = this.source[i];
            if (quote) {
                if (ch === quote) {
                    quote = undefined;
                }
                i += 1;
                continue;
            }
            if (ch === "'" || ch === '"') {
                quote = ch;
                i += 1;
                continue;
            }
            if (this.source.startsWith(marker, i)) {
                return i;
            }
            i += 1;
        }
        return -1;
    }

    private parseMustacheBody(
        start: number,
        end: number,
        innerStart: number,
        innerEnd: number,
        escaped: boolean,
    ): MustacheNode | undefined {
        const parsed = this.parseCallParts(innerStart, innerEnd);
        if (!parsed) {
            this.errors.push({
                message: 'Empty mustache — expected a path or helper',
                start,
                end,
            });
            return undefined;
        }
        return {
            type: 'MustacheNode',
            start,
            end,
            path: parsed.path,
            params: parsed.params,
            escaped,
        };
    }

    // invariant: an unclosed or mismatched block is recorded, and its node still returned.
    private parseBlock(
        open: number,
        innerStart: number,
        innerEnd: number,
        openTagEnd: number,
    ): BlockNode {
        const headerStart = this.skipWhitespace(innerStart) + 1;
        const parsed = this.parseCallParts(headerStart, innerEnd);
        const openTag: Span = { start: open, end: openTagEnd };

        const path: PathExpression = parsed?.path ?? {
            type: 'PathExpression',
            start: headerStart,
            end: headerStart,
            parts: [],
            data: false,
            thisRef: false,
            original: '',
        };
        if (!parsed) {
            this.errors.push({
                message: 'Block open {{#…}} is missing a helper name',
                start: open,
                end: openTagEnd,
            });
        }
        const blockName = path.original;

        this.pos = openTagEnd;
        const program = this.parseStatements(BLOCK_BODY_CLOSERS);

        let inverse: Statement[] | undefined;

        if (this.atElse()) {
            this.consumeElse();
            inverse = this.parseStatements(BLOCK_BODY_CLOSERS);
        }

        const closeTag = this.consumeBlockClose(blockName, open, openTagEnd);

        const params = parsed?.params ?? [];
        const end = closeTag?.end ?? this.source.length;

        return {
            type: 'BlockNode',
            start: open,
            end,
            path,
            params,
            program,
            inverse,
            openTag,
            closeTag,
        };
    }

    private atElse(): boolean {
        if (!this.source.startsWith('{{', this.pos)) {
            return false;
        }
        const after = this.skipWhitespace(this.pos + 2);
        if (!this.source.startsWith('else', after)) {
            return false;
        }
        const boundary = this.source[after + 4];
        return boundary === undefined || /[\s}]/u.test(boundary);
    }

    private consumeElse(): void {
        const close = this.findClose(this.pos + 2, '}}');
        this.pos = close === -1 ? this.source.length : close + 2;
    }

    private consumeBlockClose(
        blockName: string,
        openStart: number,
        openEnd: number,
    ): Span | undefined {
        if (this.pos >= this.source.length || !this.source.startsWith('{{', this.pos)) {
            this.errors.push({
                message: `Unclosed block {{#${blockName}}} — missing {{/${blockName}}}`,
                start: openStart,
                end: openEnd,
            });
            return undefined;
        }

        const open = this.pos;
        const close = this.findClose(open + 2, '}}');
        if (close === -1) {
            this.errors.push({
                message: `Unclosed block {{#${blockName}}} — missing {{/${blockName}}}`,
                start: openStart,
                end: openEnd,
            });
            this.pos = this.source.length;
            return undefined;
        }

        const tagEnd = close + 2;
        const inner = this.source.slice(open + 2, close).trim();
        const closeName = inner.startsWith('/') ? inner.slice(1).trim() : '';

        if (closeName !== blockName) {
            this.errors.push({
                message: `Mismatched closing block: expected {{/${blockName}}} but found {{/${closeName}}}`,
                start: open,
                end: tagEnd,
            });
        }
        this.pos = tagEnd;
        return { start: open, end: tagEnd };
    }

    private parseCallParts(
        from: number,
        to: number,
    ): undefined | { path: PathExpression; params: Expression[] } {
        let cursor = this.skipWhitespace(from, to);
        if (cursor >= to) {
            return undefined;
        }

        const path = this.parsePath(cursor, to);
        if (!path) {
            return undefined;
        }
        cursor = path.end;

        const params: Expression[] = [];
        cursor = this.skipWhitespace(cursor, to);
        while (cursor < to) {
            const arg = this.parseExpression(cursor, to);
            if (!arg) {
                this.errors.push({
                    message: `Unexpected token in arguments: "${this.source.slice(cursor, to).trim()}"`,
                    start: cursor,
                    end: to,
                });
                break;
            }
            params.push(arg);
            cursor = this.skipWhitespace(arg.end, to);
        }

        return { path, params };
    }

    private parseExpression(cursor: number, to: number): Expression | undefined {
        const ch = this.source[cursor];
        if (ch === undefined) {
            return undefined;
        }
        if (ch === '(') {
            return this.parseSubExpression(cursor, to);
        }
        if (ch === "'" || ch === '"') {
            return this.parseStringLiteral(cursor, to);
        }
        const literal = this.parseScalar(cursor, to);
        if (literal) {
            return literal;
        }
        return this.parsePath(cursor, to);
    }

    private parseSubExpression(open: number, to: number): SubExpression | undefined {
        const closeParen = this.findMatchingParen(open, to);
        const innerEnd = closeParen === -1 ? to : closeParen;
        const parsed = this.parseCallParts(open + 1, innerEnd);
        const end = closeParen === -1 ? to : closeParen + 1;

        if (closeParen === -1) {
            this.errors.push({
                message: "Unclosed subexpression — missing ')'",
                start: open,
                end: to,
            });
        }

        if (!parsed) {
            this.errors.push({
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

    private findMatchingParen(open: number, to: number): number {
        let depth = 0;
        let quote: string | undefined;
        for (let i = open; i < to; i += 1) {
            const ch = this.source[i];
            if (quote) {
                if (ch === quote) {
                    quote = undefined;
                }
                continue;
            }
            if (ch === "'" || ch === '"') {
                quote = ch;
            } else if (ch === '(') {
                depth += 1;
            } else if (ch === ')') {
                depth -= 1;
                if (depth === 0) {
                    return i;
                }
            }
        }
        return -1;
    }

    private parseStringLiteral(open: number, to: number): StringLiteral {
        const quote = this.source[open] as "'" | '"';
        let i = open + 1;
        while (i < to) {
            const ch = this.source[i];
            if (ch === '\\') {
                i += 2;
                continue;
            }
            if (ch === quote) {
                break;
            }
            i += 1;
        }
        const closed = i < to && this.source[i] === quote;
        const valueEnd = closed ? i : Math.min(i, to);
        const value = this.unescapeStringBody(this.source.slice(open + 1, valueEnd));
        const end = closed ? i + 1 : to;
        if (!closed) {
            this.errors.push({
                message: 'Unclosed string literal',
                start: open,
                end,
            });
        }
        return { type: 'StringLiteral', start: open, end, value, quote };
    }

    // outside: raymond honours `\'`, `\"` and `\\` inside a quoted literal.
    private unescapeStringBody(body: string): string {
        return body.replaceAll(/\\(?<escaped>.)/gu, (_match, escaped: string) => escaped);
    }

    private parseScalar(cursor: number, to: number): BooleanLiteral | NumberLiteral | undefined {
        const end = this.tokenEnd(cursor, to);
        const text = this.source.slice(cursor, end);

        if (text === 'true' || text === 'false') {
            return { type: 'BooleanLiteral', start: cursor, end, value: text === 'true' };
        }
        if (NUMBER_RE.test(text)) {
            return { type: 'NumberLiteral', start: cursor, end, value: Number(text), raw: text };
        }
        return undefined;
    }

    private parsePath(cursor: number, to: number): PathExpression | undefined {
        const end = this.tokenEnd(cursor, to);
        if (end === cursor) {
            return undefined;
        }
        const original = this.source.slice(cursor, end);

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

    private tokenEnd(cursor: number, to: number): number {
        let i = cursor;
        while (i < to) {
            const ch = this.source[i];
            if (
                ch === undefined ||
                /\s/u.test(ch) ||
                ch === ')' ||
                ch === '(' ||
                ch === "'" ||
                ch === '"'
            ) {
                break;
            }
            i += 1;
        }
        return i;
    }

    private skipWhitespace(from: number, to: number = this.source.length): number {
        let i = from;
        while (i < to) {
            const ch = this.source[i];
            if (ch === undefined || !/\s/u.test(ch)) {
                break;
            }
            i += 1;
        }
        return i;
    }
}

const BLOCK_BODY_CLOSERS: ReadonlySet<string> = new Set(['/', 'else']);

/** Parses a decoded template into its AST, recording every syntax error and recovering; never throws. */
function parse(source: string): ParseResult {
    return new Parser(source).parse();
}

export { parse, type ParseResult, type TemplateParseError };
