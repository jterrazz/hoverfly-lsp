// outside: the engine is SpectoLabs/raymond, a Handlebars fork, so the grammar is Handlebars
// (research/08 §5); every node's offsets are into the decoded template string.

/** A half-open `[start, end)` offset span into the decoded template source string. */
export type Span = {
    /** Inclusive start offset (0-based, into the decoded source). */
    readonly start: number;
    /** Exclusive end offset. */
    readonly end: number;
};

/** A dotted or indexed path; `parts` drops the `@` and `this` markers and keeps a bracketed segment's inner token. */
export type PathExpression = Span & {
    readonly type: 'PathExpression';
    /** Segment names in order, markers stripped (e.g. `["Request", "QueryParam", "foo"]`). */
    readonly parts: readonly string[];
    /** True for `@`-prefixed data variables (`@index`, `@first`, `@last`, `@key`). */
    readonly data: boolean;
    /** True when the path is rooted at `this` (`this`, `this.field`). */
    readonly thisRef: boolean;
    /** The original source text of the whole path (markers included). */
    readonly original: string;
};

/** A single- or double-quoted string literal. `value` is the unquoted, unescaped content. */
export type StringLiteral = Span & {
    readonly type: 'StringLiteral';
    readonly value: string;
    /** The quote character used (`'` or `"`). */
    readonly quote: "'" | '"';
};

/** A numeric literal (`2`, `-1.5`). `value` is the parsed number; `raw` the source text. */
export type NumberLiteral = Span & {
    readonly type: 'NumberLiteral';
    readonly value: number;
    readonly raw: string;
};

/** A boolean literal (`true` / `false`). */
export type BooleanLiteral = Span & {
    readonly type: 'BooleanLiteral';
    readonly value: boolean;
};

/** A parenthesised helper call used as an argument, never standalone. */
export type SubExpression = Span & {
    readonly type: 'SubExpression';
    /** The path naming the helper (e.g. `multiply`, or `Request.Body`). */
    readonly path: PathExpression;
    /** Positional arguments (literals, paths, or nested subexpressions). */
    readonly params: readonly Expression[];
};

/** Any value-producing expression that can appear as a mustache body or call argument. */
export type Expression =
    | BooleanLiteral
    | NumberLiteral
    | PathExpression
    | StringLiteral
    | SubExpression;

/** Literal template text between mustaches. */
export type ContentNode = Span & {
    readonly type: 'ContentNode';
    readonly value: string;
};

/** A mustache `{{path arg…}}`; `escaped` is false for the triple-stache `{{{…}}}` raymond leaves unescaped. */
export type MustacheNode = Span & {
    readonly type: 'MustacheNode';
    /** The leading path (helper name or path lookup). */
    readonly path: PathExpression;
    /** Positional arguments after the path. */
    readonly params: readonly Expression[];
    /** `true` for `{{...}}`, `false` for the unescaped `{{{...}}}` form. */
    readonly escaped: boolean;
};

/** A block `{{#helper params}} program {{else}} inverse {{/helper}}`; its tag spans cover the literal open and close mustaches. */
export type BlockNode = {
    readonly type: 'BlockNode';
    /** The block-helper path (`each`, `if`, `equal`, …). */
    readonly path: PathExpression;
    /** Positional arguments to the block helper. */
    readonly params: readonly Expression[];
    /** The block body (statements before `{{else}}`, or the whole body when there is none). */
    readonly program: readonly Statement[];
    /** The `{{else}}` branch statements, or `undefined` when there is no `{{else}}`. */
    readonly inverse: readonly Statement[] | undefined;
    /** Span of the opening `{{#…}}` mustache. */
    readonly openTag: Span;
    /** Span of the closing `{{/…}}` mustache (`undefined` when the block was never closed). */
    readonly closeTag: Span | undefined;
} & Span;

/** A top-level / block-body statement. */
export type Statement = BlockNode | ContentNode | MustacheNode;

/** The root program: the ordered statements of a whole template. */
export type Program = Span & {
    readonly type: 'Program';
    readonly body: readonly Statement[];
};

/** Any AST node (root, statement, or expression). */
export type TemplateNode = Expression | Program | Statement;
