// outside: hand-rolled (D8; report 08 §5.2 forbids a handlebars dependency) to keep exact offsets
// into the decoded source and the raymond fork's quirks (the `equal` and `first` blocks, `@data`
// variables, the Request.Body method call, single or double quotes); an unclosed mustache or block,
// a mismatched close or a bad token is recorded and skipped to the next `{{`, so the rest of the
// template is still analysed.

import type {
    BlockNode,
    ContentNode,
    MustacheNode,
    PathExpression,
    Program,
    Span,
    Statement,
} from './ast.js';
import { parseCallParts } from './expressions.js';
import type { Scope } from './expressions.js';
import { findClose, skipWhitespace } from './scan.js';

/** A recoverable parse error with an offset range into the decoded source. */
type TemplateParseError = Span & {
    readonly message: string;
};

/** The result of {@link parse}: a (possibly partial) AST plus any recovered-from errors. */
type ParseResult = {
    readonly ast: Program;
    readonly errors: readonly TemplateParseError[];
};

class Parser {
    private readonly source: string;
    private pos = 0;
    private readonly errors: TemplateParseError[] = [];
    private readonly scope: Scope;

    constructor(source: string) {
        this.source = source;
        this.scope = { errors: this.errors, source };
    }

    parse(): ParseResult {
        const body = this.parseStatements();
        const ast: Program = {
            start: 0,
            end: this.source.length,
            body,
        };
        return { ast, errors: this.errors };
    }

    // invariant: inside a block body, a `{{/...}}` or `{{else}}` ends the statements, left unconsumed
    // for the block to read.
    private parseStatements(insideBlock = false): Statement[] {
        const out: Statement[] = [];
        let open = this.source.indexOf('{{', this.pos);
        while (open !== -1) {
            this.pushContent(out, this.pos, open);
            if (insideBlock && this.isTerminator(open)) {
                this.pos = open;
                return out;
            }
            const statement = this.parseMustacheOrBlock(open);
            if (statement) {
                out.push(statement);
            }
            open = this.source.indexOf('{{', this.pos);
        }
        this.pushContent(out, this.pos, this.source.length);
        this.pos = this.source.length;
        return out;
    }

    private isTerminator(open: number): boolean {
        const after = skipWhitespace(this.source, open + 2);
        return this.source[after] === '/' || this.isElseAt(after);
    }

    // value: `else` is the keyword only when a space, a `}` or the end of the text follows it.
    private isElseAt(index: number): boolean {
        if (!this.source.startsWith('else', index)) {
            return false;
        }
        const boundary = this.source[index + 4];
        return boundary === undefined || /[\s}]/u.test(boundary);
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

        const close = findClose(this.source, open + openLen, closeMarker);
        if (close === -1) {
            this.errors.push({
                message: 'Unclosed mustache: missing closing braces',
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
                message: `Unexpected closing block {{/${name}}}: no matching open block`,
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
        return this.parseMustacheBody(
            { end: tagEnd, start: open },
            { end: innerEnd, start: innerStart },
            !triple,
        );
    }

    private parseMustacheBody(
        { end, start }: Span,
        inner: Span,
        escaped: boolean,
    ): MustacheNode | undefined {
        const parsed = parseCallParts(this.scope, inner.start, inner.end);
        if (!parsed) {
            this.errors.push({
                message: 'Empty mustache: expected a path or helper',
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
        const headerStart = skipWhitespace(this.source, innerStart) + 1;
        const parsed = parseCallParts(this.scope, headerStart, innerEnd);
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
                message: 'Block open {{#...}} is missing a helper name',
                start: open,
                end: openTagEnd,
            });
        }
        const blockName = path.original;

        this.pos = openTagEnd;
        const program = this.parseStatements(true);

        let inverse: Statement[] | undefined;

        if (this.atElse()) {
            this.consumeElse();
            inverse = this.parseStatements(true);
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

    // invariant: a block body ends at a `{{` or at the end of the text, so the else is read past it.
    private atElse(): boolean {
        return this.isElseAt(skipWhitespace(this.source, this.pos + 2));
    }

    private consumeElse(): void {
        const close = findClose(this.source, this.pos + 2, '}}');
        this.pos = close === -1 ? this.source.length : close + 2;
    }

    private consumeBlockClose(
        blockName: string,
        openStart: number,
        openEnd: number,
    ): Span | undefined {
        // invariant: the body ended at a `{{` or at the end of the text, where no close is found.
        const open = this.pos;
        const close = findClose(this.source, open + 2, '}}');
        if (close === -1) {
            this.errors.push({
                message: `Unclosed block {{#${blockName}}}: missing {{/${blockName}}}`,
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
}

/** Parses a decoded template into its AST, recording every syntax error and recovering; never throws. */
function parse(source: string): ParseResult {
    return new Parser(source).parse();
}

export { parse, type ParseResult, type TemplateParseError };
