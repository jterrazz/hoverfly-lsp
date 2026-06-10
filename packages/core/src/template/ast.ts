/**
 * Handlebars AST for the Hoverfly response-templating layer (architect decision D8: a real
 * nested, block-aware parser, not a flat tokenizer).
 *
 * The engine is the SpectoLabs/raymond fork (a Handlebars implementation), so the grammar is
 * Handlebars: `{{...}}` escaped mustaches, `{{{...}}}` triple/unescaped mustaches, block
 * helpers `{{#each xs}}…{{else}}…{{/each}}`, subexpressions `(helper 'a' 'b')`, path
 * expressions (`Request.QueryParam.foo`, `this.price`, `@index`), and string/number/boolean
 * literals. See `research/08-templating-spec.md` §5 for the constructs Hoverfly exercises.
 *
 * Pure types — this module has ZERO knowledge of diagnostic codes or rules. Every node carries
 * `{ start, end }` byte offsets relative to the DECODED template source string the parser was
 * given (the HF5xx source-map layer maps those offsets back to document positions).
 */

/** A half-open `[start, end)` offset span into the decoded template source string. */
export interface Span {
  /** Inclusive start offset (0-based, into the decoded source). */
  readonly start: number;
  /** Exclusive end offset. */
  readonly end: number;
}

/* -------------------------------------- expressions -------------------------------------- */

/**
 * A path expression: a dotted/indexed chain of parts (`Request.QueryParam.foo`, `this.price`,
 * `@index`, `Vars.x`). `parts` are the segment strings in order (with the `@`/`this` markers
 * stripped: `@index` => `{ data: true, parts: ["index"] }`, `this.price` =>
 * `{ thisRef: true, parts: ["price"] }`). Bracketed segments (`Path.[2]`) contribute the inner
 * token as a part (`"2"`).
 */
export interface PathExpression extends Span {
  readonly type: "PathExpression";
  /** Segment names in order, markers stripped (e.g. `["Request", "QueryParam", "foo"]`). */
  readonly parts: readonly string[];
  /** True for `@`-prefixed data variables (`@index`, `@first`, `@last`, `@key`). */
  readonly data: boolean;
  /** True when the path is rooted at `this` (`this`, `this.field`). */
  readonly thisRef: boolean;
  /** The original source text of the whole path (markers included). */
  readonly original: string;
}

/** A single- or double-quoted string literal. `value` is the unquoted, unescaped content. */
export interface StringLiteral extends Span {
  readonly type: "StringLiteral";
  readonly value: string;
  /** The quote character used (`'` or `"`). */
  readonly quote: "'" | '"';
}

/** A numeric literal (`2`, `-1.5`). `value` is the parsed number; `raw` the source text. */
export interface NumberLiteral extends Span {
  readonly type: "NumberLiteral";
  readonly value: number;
  readonly raw: string;
}

/** A boolean literal (`true` / `false`). */
export interface BooleanLiteral extends Span {
  readonly type: "BooleanLiteral";
  readonly value: boolean;
}

/**
 * A parenthesised subexpression — a helper call used as an argument:
 * `(multiply (this.price) (this.qty) '')`. Structurally a helper call, but never standalone.
 */
export interface SubExpression extends Span {
  readonly type: "SubExpression";
  /** The path naming the helper (e.g. `multiply`, or `Request.Body`). */
  readonly path: PathExpression;
  /** Positional arguments (literals, paths, or nested subexpressions). */
  readonly params: readonly Expression[];
}

/** Any value-producing expression that can appear as a mustache body or call argument. */
export type Expression =
  | BooleanLiteral
  | NumberLiteral
  | PathExpression
  | StringLiteral
  | SubExpression;

/* ----------------------------------------- nodes ----------------------------------------- */

/** Literal template text between mustaches. */
export interface ContentNode extends Span {
  readonly type: "ContentNode";
  readonly value: string;
}

/**
 * A mustache statement: `{{path arg...}}`. `escaped` is `false` for the triple-stache
 * unescaped form `{{{...}}}` (raymond/Handlebars HTML-escape the double-stache form).
 */
export interface MustacheNode extends Span {
  readonly type: "MustacheNode";
  /** The leading path (helper name or path lookup). */
  readonly path: PathExpression;
  /** Positional arguments after the path. */
  readonly params: readonly Expression[];
  /** `true` for `{{...}}`, `false` for the unescaped `{{{...}}}` form. */
  readonly escaped: boolean;
}

/**
 * A block statement: `{{#helper params}} program {{else}} inverse {{/helper}}`. `program` is
 * the body, `inverse` the optional `{{else}}` branch. The open/close tag spans cover the
 * literal `{{#…}}` / `{{/…}}` mustaches (for bracket-matching & "unclosed block" diagnostics).
 */
export interface BlockNode extends Span {
  readonly type: "BlockNode";
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
}

/** A top-level / block-body statement. */
export type Statement = BlockNode | ContentNode | MustacheNode;

/** The root program: the ordered statements of a whole template. */
export interface Program extends Span {
  readonly type: "Program";
  readonly body: readonly Statement[];
}

/** Any AST node (root, statement, or expression). */
export type TemplateNode = Expression | Program | Statement;
