/**
 * Pure semantic-tokens producer (research/16 §4).
 *
 * Emits LSP semantic tokens for the Hoverfly-specific constructs a stock JSON grammar cannot color:
 *
 *   1. the Handlebars-subset TEMPLATE syntax inside every templatable string (templated response
 *      body/header values, plus any body that merely contains `{{` — the HF501 scope), and
 *   2. matcher-NAME enum values (`exact`, `regex`, `jwt`, …) wherever a matcher object appears.
 *
 * Template tokens are produced by parsing the DECODED template (`../template/parser`) and mapping
 * every node's decoded offset back to a DOCUMENT offset through the SAME escape-aware source map the
 * HF5xx diagnostics use (`createStringSourceMap`) — so a `\n`/`\uXXXX`/surrogate escape before a
 * `{{…}}` still lands the token on the exact right document characters. Document offsets become
 * `{line, char}` via `TextDocument.positionAt`.
 *
 * Transport-free by design: returns an absolute, (line, startChar)-sorted, single-line-per-token
 * list; the SERVER delta-encodes it into the 5-int wire array. Never throws — malformed templates
 * yield partial tokens (the parser is error-tolerant) and unexpected shapes are skipped.
 */

import type { ASTNode, JSONDocument } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";

import { hasHoverflyFilename, isHoverflySimulationAst } from "../fingerprint.js";
import { ALL_HELPERS, FAKER_NAMES, MATCHER_SPECS } from "../registry/index.js";
import { buildSimulationModel } from "../semantic/model.js";
import type { MatcherModel, SimulationModel } from "../semantic/types.js";
import {
  type BlockNode,
  createStringSourceMap,
  type Expression,
  hasTemplateSyntax,
  type MustacheNode,
  parse,
  type PathExpression,
  type Statement,
  type StringSourceMap,
  type SubExpression,
} from "../template/index.js";
import { SEMANTIC_TOKEN_TYPE_INDEX, type SemanticTokenTypeName } from "./legend.js";

/**
 * One absolute semantic token (research/16 §4). Single line; `tokenType` is an index into
 * `SEMANTIC_TOKEN_TYPES`; `tokenModifiers` is a bitset (always `0` in v1).
 */
interface SemanticToken {
  /** 0-based line. */
  readonly line: number;
  /** 0-based start character (UTF-16 code units). */
  readonly startChar: number;
  /** Token length in UTF-16 code units (never spans a line). */
  readonly length: number;
  /** Index into `SEMANTIC_TOKEN_TYPES`. */
  readonly tokenType: number;
  /** Modifier bitset; `0` in v1. */
  readonly tokenModifiers: number;
}

/* ---------------------------------------- name sets -------------------------------------- */

/** Block-helper names (`if`, `each`, `with`, `unless`, `equal`, `first`) → `keyword`. */
const BLOCK_HELPER_NAMES: ReadonlySet<string> = new Set(
  ALL_HELPERS.filter((helper) => helper.block).map((helper) => helper.name),
);

/** Every recognised helper name (inline + block) — heads that are real helper CALLS. */
const ALL_HELPER_NAMES: ReadonlySet<string> = new Set(ALL_HELPERS.map((helper) => helper.name));

/** Known zero-arg faker type names — only these become `enumMember` as a `faker` argument. */
const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);

/** Every matcher name (incl. the `form` pseudo-matcher) recognised as an enum value. */
const MATCHER_NAME_SET: ReadonlySet<string> = new Set(MATCHER_SPECS.map((spec) => spec.name));

/* ----------------------------------- low-level emission ---------------------------------- */

/**
 * A sink that turns a DECODED-offset span into one or more single-line document tokens, mapping
 * through the active source map and splitting at line boundaries.
 */
class TokenEmitter {
  private readonly tokens: SemanticToken[] = [];
  private readonly document: TextDocument;

  public constructor(document: TextDocument) {
    this.document = document;
  }

  /** Emit a token for an absolute DOCUMENT `[startOffset, endOffset)` span, split per line. */
  public emitDocSpan(startOffset: number, endOffset: number, type: SemanticTokenTypeName): void {
    if (endOffset <= startOffset) {
      return;
    }
    const tokenType = SEMANTIC_TOKEN_TYPE_INDEX[type];
    let cursor = startOffset;
    while (cursor < endOffset) {
      const start = this.document.positionAt(cursor);
      // The document offset of the start of the NEXT line, to clamp a multi-line span.
      const lineEndOffset = this.document.offsetAt({ line: start.line + 1, character: 0 });
      const segmentEnd = Math.min(endOffset, lineEndOffset);
      const end = this.document.positionAt(segmentEnd);
      // `end` may sit at the start of the next line (trailing newline); use the start line length.
      const length =
        end.line === start.line
          ? end.character - start.character
          : this.document.offsetAt({ line: start.line + 1, character: 0 }) - cursor;
      if (length > 0) {
        this.tokens.push({
          line: start.line,
          startChar: start.character,
          length,
          tokenType,
          tokenModifiers: 0,
        });
      }
      cursor = segmentEnd;
    }
  }

  /** Emit a token for a DECODED `[start, end)` span via the given source map. */
  public emitDecoded(
    sourceMap: StringSourceMap,
    start: number,
    end: number,
    type: SemanticTokenTypeName,
  ): void {
    this.emitDocSpan(sourceMap.toDocOffset(start), sourceMap.toDocOffset(end), type);
  }

  /** The collected tokens, sorted by (line, startChar). */
  public result(): SemanticToken[] {
    return this.tokens.sort((a, b) => a.line - b.line || a.startChar - b.startChar);
  }
}

/* -------------------------------------- template walk ------------------------------------ */

/** Emit tokens for a path expression's root + segments + bracket indices. */
function emitPath(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  path: PathExpression,
  isHelperHead: boolean,
): void {
  if (isHelperHead) {
    const type: SemanticTokenTypeName = BLOCK_HELPER_NAMES.has(path.original.replace(/^#/, ""))
      ? "keyword"
      : "function";
    emitter.emitDecoded(sourceMap, path.start, path.end, type);
    return;
  }

  // `@index`/`this` and their `.field` tails → parameter (context-injected vars).
  if (path.data || path.thisRef) {
    emitter.emitDecoded(sourceMap, path.start, path.end, "parameter");
    return;
  }

  // Walk the original text segment by segment so each lands on its real document characters.
  // `original` looks like `Request.Path.[1]`; split on dots, keep offsets via running cursor.
  const segments = splitPathSegments(path.original);
  let cursor = path.start;
  for (let i = 0; i < segments.length; i += 1) {
    const segment = segments[i];
    if (segment === undefined) {
      continue;
    }
    const segStart = cursor;
    const segEnd = cursor + segment.length;
    const inner = segment.replace(/^\[(?<index>.*)\]$/, "$<index>");
    const isBracketIndex = inner !== segment;
    const isNumeric = /^-?\d+$/.test(inner);

    let type: SemanticTokenTypeName;
    if (i === 0) {
      type = "variable"; // Path root (Request, State, Vars, …)
    } else if (isBracketIndex && isNumeric) {
      type = "number"; // [1] index selector
    } else if (isNumeric) {
      type = "number";
    } else {
      type = "property"; // .Path, .Method, field name
    }
    emitter.emitDecoded(sourceMap, segStart, segEnd, type);
    cursor = segEnd + 1; // Skip the dot separator
  }
}

/** Split a path's original text into dot-separated segments (preserving bracket groups). */
function splitPathSegments(original: string): string[] {
  return original.split(".");
}

/** Emit tokens for a single argument expression. `fakerArg` colors a known faker name as enum. */
function emitExpression(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  expr: Expression,
  fakerArg: boolean,
): void {
  switch (expr.type) {
    case "StringLiteral": {
      const isFaker = fakerArg && FAKER_NAME_SET.has(expr.value);
      emitter.emitDecoded(sourceMap, expr.start, expr.end, isFaker ? "enumMember" : "string");
      return;
    }
    case "NumberLiteral": {
      emitter.emitDecoded(sourceMap, expr.start, expr.end, "number");
      return;
    }
    case "BooleanLiteral": {
      emitter.emitDecoded(sourceMap, expr.start, expr.end, "keyword");
      return;
    }
    case "PathExpression": {
      emitPath(emitter, sourceMap, expr, false);
      return;
    }
    case "SubExpression": {
      emitSubExpression(emitter, sourceMap, expr);
      return;
    }
    default: {
      return;
    }
  }
}

/** The helper name of a call path (`now`, `faker`, `Request.Body` → `now`/`faker`/`Request`). */
function helperHeadName(path: PathExpression): string {
  return path.parts[0] ?? path.original.replace(/^#/, "");
}

/** Whether the call head names a known helper (so its head colors as function/keyword). */
function isKnownHelper(path: PathExpression): boolean {
  return ALL_HELPER_NAMES.has(helperHeadName(path));
}

/** Emit a mustache's head (helper or path) plus its arguments. */
function emitCall(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  path: PathExpression,
  params: readonly Expression[],
): void {
  const helper = isKnownHelper(path);
  emitPath(emitter, sourceMap, path, helper);
  const fakerCall = helperHeadName(path) === "faker";
  params.forEach((param, index) => {
    emitExpression(emitter, sourceMap, param, fakerCall && index === 0);
  });
}

/** Emit a subexpression `(helper args…)`. */
function emitSubExpression(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  expr: SubExpression,
): void {
  emitCall(emitter, sourceMap, expr.path, expr.params);
}

/** Emit the `{{`/`}}` (or `{{{`/`}}}`) delimiters around a mustache as operator tokens. */
function emitMustacheDelimiters(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  node: MustacheNode,
): void {
  const openLen = node.escaped ? 2 : 3;
  emitter.emitDecoded(sourceMap, node.start, node.start + openLen, "operator");
  emitter.emitDecoded(sourceMap, node.end - openLen, node.end, "operator");
}

/** Emit a block's opening/closing tag delimiters (`{{#`, `}}`, `{{/`, `}}`) as operators. */
function emitBlockDelimiters(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  node: BlockNode,
): void {
  // `{{#` open marker (3 chars).
  emitter.emitDecoded(sourceMap, node.openTag.start, node.openTag.start + 3, "operator");
  emitter.emitDecoded(sourceMap, node.openTag.end - 2, node.openTag.end, "operator");
  if (node.closeTag) {
    // `{{/` close marker (3 chars) and `}}`.
    emitter.emitDecoded(sourceMap, node.closeTag.start, node.closeTag.start + 3, "operator");
    emitter.emitDecoded(sourceMap, node.closeTag.end - 2, node.closeTag.end, "operator");
  }
}

/** Walk one statement, emitting its tokens. */
function emitStatement(
  emitter: TokenEmitter,
  sourceMap: StringSourceMap,
  statement: Statement,
): void {
  switch (statement.type) {
    case "MustacheNode": {
      emitMustacheDelimiters(emitter, sourceMap, statement);
      emitCall(emitter, sourceMap, statement.path, statement.params);
      return;
    }
    case "BlockNode": {
      emitBlockDelimiters(emitter, sourceMap, statement);
      // The block-helper name colors as a keyword (block) or function.
      emitPath(emitter, sourceMap, statement.path, isKnownHelper(statement.path));
      for (const param of statement.params) {
        emitExpression(emitter, sourceMap, param, false);
      }
      for (const child of statement.program) {
        emitStatement(emitter, sourceMap, child);
      }
      for (const child of statement.inverse ?? []) {
        emitStatement(emitter, sourceMap, child);
      }
      return;
    }
    case "ContentNode": {
      return;
    }
    default: {
      return;
    }
  }
}

/**
 * Parse the decoded template of one templatable string NODE and emit all its tokens, mapping
 * decoded offsets to document offsets through the escape-aware source map.
 */
function emitTemplateString(emitter: TokenEmitter, document: TextDocument, node: ASTNode): void {
  if (node.type !== "string" || !hasTemplateSyntax(node.value)) {
    return;
  }
  const rawToken = document.getText().slice(node.offset, node.offset + node.length);
  const sourceMap = createStringSourceMap(rawToken, node.offset);
  const { ast } = parse(sourceMap.decoded);
  for (const statement of ast.body) {
    emitStatement(emitter, sourceMap, statement);
  }
}

/* ------------------------------------- model traversal ----------------------------------- */

/** Whether a `templated` field node is the JSON boolean `true`. */
function isTemplated(node: ASTNode | undefined): boolean {
  return node?.type === "boolean" && node.value === true;
}

/** Emit a templatable string node and array-of-strings (header value shapes). */
function emitTemplatableValue(
  emitter: TokenEmitter,
  document: TextDocument,
  node: ASTNode | undefined,
): void {
  if (!node) {
    return;
  }
  if (node.type === "string") {
    emitTemplateString(emitter, document, node);
    return;
  }
  if (node.type === "array") {
    for (const item of node.items) {
      emitTemplateString(emitter, document, item);
    }
  }
}

/** Emit the matcher-NAME enum token over a matcher's `matcher` string value. */
function emitMatcherName(emitter: TokenEmitter, matcher: MatcherModel): void {
  const node = matcher.matcherNode;
  if (node?.type !== "string" || matcher.matcherName === undefined) {
    return;
  }
  if (!MATCHER_NAME_SET.has(matcher.matcherName)) {
    return;
  }
  // Color the value WITHOUT the surrounding quotes: node.offset spans the quoted token.
  emitter.emitDocSpan(node.offset + 1, node.offset + node.length - 1, "enumMember");
}

/** Walk the model emitting template + matcher-name tokens. */
function emitModel(emitter: TokenEmitter, document: TextDocument, model: SimulationModel): void {
  for (const pair of model.pairs) {
    // Matcher names on every request field (path/method/body/headers/query).
    for (const fieldEntry of pair.request.fields) {
      for (const matcher of fieldEntry.matchers) {
        emitMatcherName(emitter, matcher);
      }
    }

    const { response } = pair;
    const templated = isTemplated(response.templated.valueNode);
    const bodyNode = response.body.valueNode;

    // Body: templated bodies always; non-templated bodies still color if they contain `{{`
    // (the HF501 scope — the user is clearly writing a template).
    if (bodyNode) {
      emitTemplatableValue(emitter, document, bodyNode);
    }

    // Header values are templated only when templated === true.
    if (templated) {
      for (const header of response.headers) {
        emitTemplatableValue(emitter, document, header.valueNode);
      }
    }
  }
}

/* ------------------------------------------ entry ---------------------------------------- */

/**
 * Produce the absolute, sorted semantic tokens for a document. Returns `[]` when the document is
 * not a Hoverfly simulation (D3 fingerprint) and is not a Hoverfly-named file. Never throws.
 *
 * @param model optional prebuilt {@link SimulationModel}; built from `jsonDocument` when omitted.
 */
function getSemanticTokens(
  document: TextDocument,
  jsonDocument: JSONDocument,
  model?: SimulationModel,
): SemanticToken[] {
  // Gate (research/16 §4.1): only simulations or Hoverfly-named files get tokens.
  if (!isHoverflySimulationAst(jsonDocument.root) && !hasHoverflyFilename(document.uri)) {
    return [];
  }

  const emitter = new TokenEmitter(document);
  const resolved = model ?? buildSimulationModel(jsonDocument);
  emitModel(emitter, document, resolved);
  return emitter.result();
}

export { getSemanticTokens, type SemanticToken };
