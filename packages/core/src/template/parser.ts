/**
 * Hand-rolled, error-tolerant recursive-descent parser for the Hoverfly templating dialect
 * (SpectoLabs/raymond — a Handlebars fork). Architect decision D8 mandates a real, nested,
 * block-aware parser rather than a regex tokenizer, and report 08 §5.2 forbids pulling in a
 * handlebars npm dependency (we need exact offset fidelity into the DECODED source plus the
 * raymond fork's quirks — `equal`/`first` block helpers, `@data` vars, the `Request.Body`
 * method-call form, single OR double quoted strings).
 *
 * Constructs handled (report 08 §4–5):
 *   - `{{path arg...}}` mustaches (escaped) and `{{{path arg...}}}` (unescaped/triple).
 *   - `{{path.to.x}}` dotted/indexed path lookups; `@index`/`@first`/`@last`/`@key`; `this`.
 *   - block helpers `{{#if x}}…{{else}}…{{/if}}`, `{{#each xs}}…{{/each}}`, nested blocks.
 *   - subexpressions `(helper (inner 'a') 'b')`, arbitrarily nested.
 *   - string (single/double quote), number, boolean literals; whitespace tolerance.
 *
 * Error tolerance: an unclosed mustache, unclosed block, mismatched `{{/x}}`, or bad token is
 * recorded as a {@link TemplateParseError} and the parser recovers (skipping to the next `{{`)
 * so the rest of the template is still analysed. All offsets are into the decoded source.
 *
 * Pure, zero-dependency, zero knowledge of diagnostic codes.
 */

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
} from "./ast.js";

/** A recoverable parse error with an offset range into the decoded source. */
interface TemplateParseError extends Span {
  readonly message: string;
}

/** The result of {@link parse}: a (possibly partial) AST plus any recovered-from errors. */
interface ParseResult {
  readonly ast: Program;
  readonly errors: readonly TemplateParseError[];
}

/** Block-open mustache keywords (`#name`) recognised as opening a block. */
const NUMBER_RE = /^-?(?:\d+\.?\d*|\.\d+)$/;

/** Recursive-descent parser over the decoded template source. */
class Parser {
  private readonly source: string;
  private pos = 0;
  private readonly errors: TemplateParseError[] = [];

  public constructor(source: string) {
    this.source = source;
  }

  public parse(): ParseResult {
    const body = this.parseStatements(undefined);
    const ast: Program = {
      type: "Program",
      start: 0,
      end: this.source.length,
      body,
    };
    return { ast, errors: this.errors };
  }

  /* --------------------------------- statement stream --------------------------------- */

  /**
   * Parse statements until EOF or — when `closers` is set — until a `{{/x}}`, `{{else}}`, or
   * `{{else ...}}` that this level should hand back to its caller. Returns the statements;
   * leaves `pos` at the start of the terminating mustache (the caller consumes it).
   */
  private parseStatements(closers: ReadonlySet<string> | undefined): Statement[] {
    const out: Statement[] = [];

    while (this.pos < this.source.length) {
      const open = this.source.indexOf("{{", this.pos);

      if (open === -1) {
        // Trailing literal content to EOF.
        this.pushContent(out, this.pos, this.source.length);
        this.pos = this.source.length;
        break;
      }

      // Literal content up to the next mustache.
      this.pushContent(out, this.pos, open);

      // When inside a block, a `{{/…}}` or `{{else…}}` terminates this statement stream.
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

  /** Whether the mustache at `open` is a `{{/…}}` or `{{else}}` terminator. */
  private isTerminator(open: number): boolean {
    const after = this.skipWhitespace(open + 2);
    const ch = this.source[after];
    if (ch === "/") {
      return true;
    }
    // `{{else}}` / `{{else ...}}` — match the keyword followed by a boundary.
    if (this.source.startsWith("else", after)) {
      const boundary = this.source[after + 4];
      return boundary === undefined || /[\s}]/.test(boundary);
    }
    return false;
  }

  private pushContent(out: Statement[], start: number, end: number): void {
    if (end > start) {
      const value = this.source.slice(start, end);
      const node: ContentNode = { type: "ContentNode", start, end, value };
      out.push(node);
    }
  }

  /* --------------------------------- mustache / block --------------------------------- */

  /**
   * Parse a single mustache beginning at `open` (the `{{`). Dispatches block-open (`{{#`),
   * block-close (`{{/` — unexpected here) and plain mustaches. On an unclosed mustache, records
   * an error and recovers. Always advances `pos`.
   */
  private parseMustacheOrBlock(open: number): Statement | undefined {
    const triple = this.source.startsWith("{{{", open);
    const openLen = triple ? 3 : 2;
    const closeMarker = triple ? "}}}" : "}}";

    const close = this.findClose(open + openLen, closeMarker);
    if (close === -1) {
      this.errors.push({
        message: "Unclosed mustache — missing closing braces",
        start: open,
        end: this.source.length,
      });
      // Recover: skip past the `{{` so we don't loop, and treat the remainder as scannable.
      this.pos = open + openLen;
      return undefined;
    }

    const innerStart = open + openLen;
    const innerEnd = close;
    const tagEnd = close + closeMarker.length;
    const inner = this.source.slice(innerStart, innerEnd).trim();

    // A stray closer at this position (no open block expecting it) — record and emit nothing.
    if (inner.startsWith("/")) {
      const name = inner.slice(1).trim();
      this.errors.push({
        message: `Unexpected closing block {{/${name}}} — no matching open block`,
        start: open,
        end: tagEnd,
      });
      this.pos = tagEnd;
      return undefined;
    }

    if (inner.startsWith("#")) {
      return this.parseBlock(open, innerStart, innerEnd, tagEnd);
    }

    // Plain mustache (path + params).
    this.pos = tagEnd;
    return this.parseMustacheBody(open, tagEnd, innerStart, innerEnd, !triple);
  }

  /** Find the matching close marker, respecting quoted strings so `}}` inside `'…'` is safe. */
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

  /** Build a {@link MustacheNode} from the already-located tag span and inner text. */
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
        message: "Empty mustache — expected a path or helper",
        start,
        end,
      });
      return undefined;
    }
    return {
      type: "MustacheNode",
      start,
      end,
      path: parsed.path,
      params: parsed.params,
      escaped,
    };
  }

  /**
   * Parse a `{{#helper params}}` block: its program, optional `{{else}}` inverse, and the
   * matching `{{/helper}}`. Records an error (but still returns the node) when the block is
   * never closed or the closer name mismatches.
   */
  private parseBlock(
    open: number,
    innerStart: number,
    innerEnd: number,
    openTagEnd: number,
  ): BlockNode {
    // Strip the leading `#` for the call parts.
    const headerStart = this.skipWhitespace(innerStart) + 1;
    const parsed = this.parseCallParts(headerStart, innerEnd);
    const openTag: Span = { start: open, end: openTagEnd };

    // A degenerate `{{#}}` with no name: synthesise an empty path so the node is well-formed.
    const path: PathExpression = parsed?.path ?? {
      type: "PathExpression",
      start: headerStart,
      end: headerStart,
      parts: [],
      data: false,
      thisRef: false,
      original: "",
    };
    if (!parsed) {
      this.errors.push({
        message: "Block open {{#…}} is missing a helper name",
        start: open,
        end: openTagEnd,
      });
    }
    const blockName = path.original;

    this.pos = openTagEnd;
    const program = this.parseStatements(BLOCK_BODY_CLOSERS);

    let inverse: Statement[] | undefined;

    // After the program we are positioned at a terminator (`{{else}}` or `{{/x}}`) or EOF.
    if (this.atElse()) {
      this.consumeElse();
      inverse = this.parseStatements(BLOCK_BODY_CLOSERS);
    }

    // Now expect the closing `{{/name}}`.
    const closeTag = this.consumeBlockClose(blockName, open, openTagEnd);

    const params = parsed?.params ?? [];
    const end = closeTag?.end ?? this.source.length;

    return {
      type: "BlockNode",
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

  /** Whether `pos` is sitting on an `{{else}}` mustache. */
  private atElse(): boolean {
    if (!this.source.startsWith("{{", this.pos)) {
      return false;
    }
    const after = this.skipWhitespace(this.pos + 2);
    if (!this.source.startsWith("else", after)) {
      return false;
    }
    const boundary = this.source[after + 4];
    return boundary === undefined || /[\s}]/.test(boundary);
  }

  /** Consume the `{{else}}` (or `{{else ...}}`) mustache, advancing `pos` past it. */
  private consumeElse(): void {
    const close = this.findClose(this.pos + 2, "}}");
    this.pos = close === -1 ? this.source.length : close + 2;
  }

  /**
   * Consume the closing `{{/name}}` for a block opened as `blockName`. Returns its span, or
   * `undefined` (recording an "unclosed block" error) when EOF is reached first. A name
   * mismatch is recorded but the closer is still consumed (best-effort recovery).
   */
  private consumeBlockClose(
    blockName: string,
    openStart: number,
    openEnd: number,
  ): Span | undefined {
    if (this.pos >= this.source.length || !this.source.startsWith("{{", this.pos)) {
      this.errors.push({
        message: `Unclosed block {{#${blockName}}} — missing {{/${blockName}}}`,
        start: openStart,
        end: openEnd,
      });
      return undefined;
    }

    const open = this.pos;
    const close = this.findClose(open + 2, "}}");
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
    const closeName = inner.startsWith("/") ? inner.slice(1).trim() : "";

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

  /* ------------------------------------ expressions ----------------------------------- */

  /**
   * Parse a call header `path arg1 arg2 …` from `[from, to)` (already-trimmed-content bounds).
   * Returns `undefined` when there is no leading path (empty inner). Errors inside the argument
   * list are recorded but parsing continues (best effort).
   */
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
        // Unparseable token; record once and stop consuming arguments for this call.
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

  /** Parse a single argument expression at `cursor` within `[, to)`. */
  private parseExpression(cursor: number, to: number): Expression | undefined {
    const ch = this.source[cursor];
    if (ch === undefined) {
      return undefined;
    }
    if (ch === "(") {
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

  /** Parse `(helper args…)` starting at the `(`. */
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
        message: "Empty subexpression — expected a helper",
        start: open,
        end,
      });
      return undefined;
    }

    return {
      type: "SubExpression",
      start: open,
      end,
      path: parsed.path,
      params: parsed.params,
    };
  }

  /** Find the `)` matching the `(` at `open`, respecting quotes and nested parens. */
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
      } else if (ch === "(") {
        depth += 1;
      } else if (ch === ")") {
        depth -= 1;
        if (depth === 0) {
          return i;
        }
      }
    }
    return -1;
  }

  /** Parse a single- or double-quoted string literal at `open`. */
  private parseStringLiteral(open: number, to: number): StringLiteral {
    const quote = this.source[open] as "'" | '"';
    let i = open + 1;
    while (i < to) {
      const ch = this.source[i];
      if (ch === "\\") {
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
        message: "Unclosed string literal",
        start: open,
        end,
      });
    }
    return { type: "StringLiteral", start: open, end, value, quote };
  }

  /** Resolve the in-template `\'`/`\"`/`\\` escapes raymond honours inside a quoted literal. */
  private unescapeStringBody(body: string): string {
    return body.replace(/\\(?<escaped>.)/g, (_match, escaped: string) => escaped);
  }

  /** Parse a number or boolean literal at `cursor`; returns `undefined` if it isn't one. */
  private parseScalar(cursor: number, to: number): BooleanLiteral | NumberLiteral | undefined {
    const end = this.tokenEnd(cursor, to);
    const text = this.source.slice(cursor, end);

    if (text === "true" || text === "false") {
      return { type: "BooleanLiteral", start: cursor, end, value: text === "true" };
    }
    if (NUMBER_RE.test(text)) {
      return { type: "NumberLiteral", start: cursor, end, value: Number(text), raw: text };
    }
    return undefined;
  }

  /** Parse a path expression (`a.b.c`, `this.x`, `@index`, `Path.[2]`) at `cursor`. */
  private parsePath(cursor: number, to: number): PathExpression | undefined {
    const end = this.tokenEnd(cursor, to);
    if (end === cursor) {
      return undefined;
    }
    const original = this.source.slice(cursor, end);

    let rest = original;
    const data = rest.startsWith("@");
    if (data) {
      rest = rest.slice(1);
    }

    let thisRef = false;
    if (rest === "this") {
      thisRef = true;
      rest = "";
    } else if (rest.startsWith("this.")) {
      thisRef = true;
      rest = rest.slice("this.".length);
    }

    const parts = rest
      .split(".")
      .map((segment) => segment.replace(/^\[(?<inner>.*)\]$/, "$<inner>"))
      .filter((segment) => segment.length > 0);

    return { type: "PathExpression", start: cursor, end, parts, data, thisRef, original };
  }

  /**
   * The end offset of the token starting at `cursor`: stops at whitespace, `)`, or a quote
   * (which begins a separate literal). Used for paths and scalars.
   */
  private tokenEnd(cursor: number, to: number): number {
    let i = cursor;
    while (i < to) {
      const ch = this.source[i];
      if (
        ch === undefined ||
        /\s/.test(ch) ||
        ch === ")" ||
        ch === "(" ||
        ch === "'" ||
        ch === '"'
      ) {
        break;
      }
      i += 1;
    }
    return i;
  }

  /** Advance past ASCII/Unicode whitespace, capped at `to` (defaults to source end). */
  private skipWhitespace(from: number, to: number = this.source.length): number {
    let i = from;
    while (i < to) {
      const ch = this.source[i];
      if (ch === undefined || !/\s/.test(ch)) {
        break;
      }
      i += 1;
    }
    return i;
  }
}

/** Closer keywords that end a block body: a `{{/x}}` or `{{else}}`. */
const BLOCK_BODY_CLOSERS: ReadonlySet<string> = new Set(["/", "else"]);

/**
 * Parse a decoded template source string into a {@link Program} AST, recovering from and
 * recording every syntax error. Never throws.
 */
function parse(source: string): ParseResult {
  return new Parser(source).parse();
}

export { parse, type ParseResult, type TemplateParseError };
