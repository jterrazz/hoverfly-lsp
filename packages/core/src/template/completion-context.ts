/**
 * Cursor-context classifier for IntelliSense INSIDE a Hoverfly template string.
 *
 * Given a DECODED template string and a decoded-offset cursor, this decides *what kind of
 * template completion* belongs at that point. The document is almost always MID-TYPING — e.g.
 * `{{fa`, `{{#each x}}{{`, `{{Request.`, `( ` — so the classifier is deliberately error-tolerant
 * and does NOT depend on a well-formed AST. It works in two layers:
 *
 *   1. A focused backward/forward scan around the cursor finds the innermost OPEN mustache (the
 *      nearest `{{`/`{{{` at or before the cursor that the cursor still sits inside, i.e. with no
 *      intervening `}}`), then inspects the text from that opener up to the cursor to classify the
 *      token being typed (helper/path start, path continuation, a string argument, a block close,
 *      etc.). This is what makes `{{fa` and `{{Request.` classify correctly even though the parser
 *      records them as unclosed.
 *   2. The full {@link parse} AST is consulted only to compute the enclosing BLOCK-HELPER stack at
 *      the cursor (the chain of `#each`/`#with`/… we are nested in), which drives `@index`/`this`
 *      availability and the matching `{{/name}}` close completion.
 *
 * Pure, registry-agnostic, zero LSP knowledge: it returns a {@link TemplateCompletionContext}
 * describing the position; `template-completion.ts` turns that into concrete completion items.
 */

import type { BlockNode, Statement } from "./ast.js";
import { parse } from "./parser.js";

/** Where, structurally, the cursor sits inside a template. */
type TemplateContextKind =
  /** Typing a block close `{{/<cursor>` — offer the matching open block name(s). */
  | "blockClose"
  /** Inside a `faker '<cursor>'` string argument (the faker type name is typed). */
  | "fakerArg"
  /** Inside some other helper's argument list (after the helper name + at least one token). */
  | "helperArg"
  /**
   * The head of a mustache/subexpression: `{{<cursor>`, `{{#<cursor>`, `{{ fa<cursor>`,
   * `(<cursor>`, `( fa<cursor>`. A helper name or a path root may be typed here.
   */
  | "helperOrPathStart"
  /** Not inside any open mustache (plain literal text) — no template completions. */
  | "none"
  /** Inside a `now` offset or format string argument. */
  | "nowArg"
  /**
   * A dotted path continuation: `{{Request.<cursor>`, `{{State.<cursor>`, `{{Vars.<cursor>`,
   * `{{Literals.<cursor>`, `{{this.<cursor>`, `{{@<cursor>`. The `root`/`parts` fields say which.
   */
  | "pathContinuation";

/** Which `now` argument the cursor is in (offset is positional arg 0, format is arg 1). */
type NowArgSlot = "format" | "offset";

/** The classified context plus the data needed to drive completions. */
interface TemplateCompletionContext {
  readonly kind: TemplateContextKind;
  /**
   * The partial word already typed at the cursor (e.g. `fa` for `{{fa`, `Req` for `{{Req`, the
   * last path segment for a path continuation). Empty when nothing is typed yet.
   */
  readonly word: string;
  /**
   * For `pathContinuation`: the path root token (`Request`/`State`/`Vars`/`Literals`/`this`/`@`)
   * and the already-typed segments BEFORE the one being completed.
   */
  readonly path?: { readonly root: string; readonly parts: readonly string[] };
  /** For `nowArg`: which positional argument the cursor occupies. */
  readonly nowSlot?: NowArgSlot;
  /**
   * The enclosing block-helper names from outermost to innermost (`["each"]`, `["each","with"]`).
   * Drives `@index`/`@key`/`@first`/`@last`/`this` availability and the `blockClose` target.
   */
  readonly blockStack: readonly string[];
  /** Whether the cursor is inside at least one `#each`/`#first` block (enables `@index`/`this`). */
  readonly inEachScope: boolean;
}

/** The `now`/`faker` helper names get special argument handling. */
const FAKER_HELPER = "faker";
const NOW_HELPER = "now";

/** Path roots that begin a dotted lookup (so `Request.` is a continuation, not a helper name). */
const PATH_ROOTS: ReadonlySet<string> = new Set([
  "Request",
  "State",
  "Vars",
  "Literals",
  "Kvs",
  "InternalVars",
]);

/* --------------------------------------- entry point ------------------------------------- */

/**
 * Classify the template-completion context for `cursor` (a decoded-string offset) within
 * `decoded`. Never throws; returns `{ kind: "none" }` when the cursor is not inside an open
 * mustache.
 */
function classifyCompletionContext(decoded: string, cursor: number): TemplateCompletionContext {
  const offset = clamp(cursor, 0, decoded.length);
  const blockStack = enclosingBlockStack(decoded, offset);
  const inEachScope = blockStack.some((name) => name === "each" || name === "first");
  const empty: TemplateCompletionContext = { kind: "none", word: "", blockStack, inEachScope };

  const open = findOpenMustache(decoded, offset);
  if (open === undefined) {
    return empty;
  }

  // The text of the current mustache from just-after `{{`/`{{{` up to the cursor.
  const inner = decoded.slice(open.contentStart, offset);

  // Block close: `{{/` then optional name.
  const closeMatch = /^\s*\/(?<name>[A-Za-z0-9_]*)$/u.exec(inner);
  if (closeMatch) {
    return {
      kind: "blockClose",
      word: closeMatch.groups?.name ?? "",
      blockStack,
      inEachScope,
    };
  }

  // Narrow to the innermost OPEN subexpression (if the cursor is inside un-closed parens).
  const sub = innermostOpenSubexpression(inner);
  const segment = sub.text;
  const blockOpen = sub.atMustacheHead && /^\s*#/u.test(inner);

  return classifySegment(segment, blockOpen, blockStack, inEachScope);
}

/* ----------------------------- innermost-segment classification -------------------------- */

/**
 * Classify the call segment the cursor terminates (already narrowed to the innermost open
 * subexpression, with any leading `#` reflected in `blockOpen`).
 */
function classifySegment(
  segment: string,
  blockOpen: boolean,
  blockStack: readonly string[],
  inEachScope: boolean,
): TemplateCompletionContext {
  // Strip a leading `#` (block open marker) — the head token follows it.
  const body = segment.replace(/^\s*#/u, "");

  // Are we inside an OPEN string literal? (an odd number of unescaped quotes precede the cursor)
  const openQuote = openStringQuote(body);
  if (openQuote) {
    return stringArgContext(openQuote.before, openQuote.typed, blockStack, inEachScope);
  }

  // Tokenise the (quote-free-at-cursor) call body into the head name + trailing partial token.
  const tokens = splitTopLevelTokens(body);
  const head = tokens[0] ?? "";
  const lastIsPartial = !/\s$/u.test(body) || body.length === 0;
  const current = lastIsPartial ? (tokens[tokens.length - 1] ?? "") : "";

  // Head still being typed (cursor is on the first token): helper/path start OR path continuation.
  if (tokens.length <= 1 && (lastIsPartial || body.trim().length === 0)) {
    return headContext(current, blockStack, inEachScope, blockOpen);
  }

  // Past the head, on a later token: this is an argument to `head`.
  if (head === FAKER_HELPER) {
    // `faker <bareword>` — still effectively the faker type slot (though normally quoted).
    return { kind: "fakerArg", word: current, blockStack, inEachScope };
  }
  if (head === NOW_HELPER) {
    return {
      kind: "nowArg",
      word: current,
      nowSlot: argSlot(tokens, lastIsPartial) === 0 ? "offset" : "format",
      blockStack,
      inEachScope,
    };
  }

  // A path continuation can also appear as an argument (`{{multiply Request.<cursor>}}`).
  if (isPathContinuation(current)) {
    return pathContext(current, blockStack, inEachScope);
  }
  return { kind: "helperArg", word: current, blockStack, inEachScope };
}

/** Classify the FIRST token of a call (the head): a path continuation or a helper/path start. */
function headContext(
  current: string,
  blockStack: readonly string[],
  inEachScope: boolean,
  blockOpen: boolean,
): TemplateCompletionContext {
  if (!blockOpen && isPathContinuation(current)) {
    return pathContext(current, blockStack, inEachScope);
  }
  // `{{<cursor>`, `{{fa<cursor>`, `{{#<cursor>`, `(<cursor>` — a helper name / path root start.
  // A bare `@` or `this` head with no dot is still a "start" (offer @-vars / this there).
  return { kind: "helperOrPathStart", word: current, blockStack, inEachScope };
}

/** Build a `pathContinuation` context from a partially-typed dotted path token. */
function pathContext(
  token: string,
  blockStack: readonly string[],
  inEachScope: boolean,
): TemplateCompletionContext {
  if (token.startsWith("@")) {
    return {
      kind: "pathContinuation",
      word: token.slice(1),
      path: { root: "@", parts: [] },
      blockStack,
      inEachScope,
    };
  }
  const segments = token.split(".");
  const root = segments[0] ?? "";
  const word = segments[segments.length - 1] ?? "";
  const parts = segments.slice(1, -1);
  return {
    kind: "pathContinuation",
    word,
    path: { root, parts },
    blockStack,
    inEachScope,
  };
}

/** Classify a cursor sitting inside an OPEN string argument (faker / now / generic helper arg). */
function stringArgContext(
  before: string,
  typed: string,
  blockStack: readonly string[],
  inEachScope: boolean,
): TemplateCompletionContext {
  const tokens = splitTopLevelTokens(before.replace(/^\s*#/u, ""));
  const head = tokens[0] ?? "";
  if (head === FAKER_HELPER) {
    return { kind: "fakerArg", word: typed, blockStack, inEachScope };
  }
  if (head === NOW_HELPER) {
    // Count the args already present before this string to pick offset (0) vs format (1).
    const priorArgs = tokens.length - 1;
    return {
      kind: "nowArg",
      word: typed,
      nowSlot: priorArgs <= 0 ? "offset" : "format",
      blockStack,
      inEachScope,
    };
  }
  return { kind: "helperArg", word: typed, blockStack, inEachScope };
}

/* ----------------------------------- low-level scanning ---------------------------------- */

/** A located open-mustache: the offset just after its `{{`/`{{{` opener. */
interface OpenMustache {
  readonly contentStart: number;
}

/**
 * Find the innermost OPEN mustache the cursor sits inside: scan back from the cursor for the
 * last `{{` that has no intervening `}}` between it and the cursor. Returns `undefined` when the
 * cursor is in plain literal text (a `}}` lies between the nearest `{{` and the cursor, or there
 * is no `{{` at all). Quote-aware so a `}}` inside a string literal does not falsely close.
 */
function findOpenMustache(decoded: string, cursor: number): OpenMustache | undefined {
  // Find the last `{{` at or before the cursor.
  const head = decoded.lastIndexOf("{{", Math.max(0, cursor - 1));
  if (head === -1) {
    return undefined;
  }
  // If a `}}` appears between the opener and the cursor (outside strings), we are not inside it.
  if (hasCloseBetween(decoded, head + 2, cursor)) {
    return undefined;
  }
  // Skip the third brace for `{{{` triple-staches.
  const contentStart = decoded.startsWith("{{{", head) ? head + 3 : head + 2;
  return { contentStart: Math.min(contentStart, cursor) };
}

/** Whether an (out-of-string) `}}` occurs in `[from, to)`. */
function hasCloseBetween(decoded: string, from: number, to: number): boolean {
  let quote: string | undefined;
  for (let i = from; i < to - 1; i += 1) {
    const ch = decoded[i];
    if (quote) {
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
    } else if (ch === "}" && decoded[i + 1] === "}") {
      return true;
    }
  }
  return false;
}

/** The innermost open subexpression within a mustache body, and whether it is the mustache head. */
interface InnerSegment {
  /** Text of the innermost open call (from after the last unmatched `(`, or the whole body). */
  readonly text: string;
  /** True when no unmatched `(` precedes the cursor (the cursor is at the mustache head level). */
  readonly atMustacheHead: boolean;
}

/**
 * Given the text of a mustache from just-after `{{` up to the cursor, return the text of the
 * innermost OPEN subexpression (the part after the last unmatched `(`), so `multiply (add `
 * narrows to `add `. Quote-aware.
 */
function innermostOpenSubexpression(inner: string): InnerSegment {
  let depth = 0;
  let lastOpen = -1;
  let quote: string | undefined;
  for (let i = 0; i < inner.length; i += 1) {
    const ch = inner[i];
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
      lastOpen = i;
    } else if (ch === ")") {
      depth -= 1;
      lastOpen = lastOpenBefore(inner, i);
    }
  }
  if (depth <= 0 || lastOpen === -1) {
    return { text: inner, atMustacheHead: true };
  }
  return { text: inner.slice(lastOpen + 1), atMustacheHead: false };
}

/** The offset of the last unmatched `(` strictly before `pos` (used after closing a `)`). */
function lastOpenBefore(inner: string, pos: number): number {
  let depth = 0;
  let quote: string | undefined;
  let last = -1;
  for (let i = 0; i < pos; i += 1) {
    const ch = inner[i];
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
      if (depth === 1) {
        last = i;
      }
    } else if (ch === ")") {
      depth -= 1;
    }
  }
  return depth > 0 ? last : -1;
}

/** An open (unterminated) string literal at the end of `body`, with the quote and typed prefix. */
function openStringQuote(
  body: string,
): undefined | { before: string; quote: string; typed: string } {
  let quote: string | undefined;
  let quoteStart = -1;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      if (ch === "\\") {
        i += 1;
        continue;
      }
      if (ch === quote) {
        quote = undefined;
        quoteStart = -1;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      quoteStart = i;
    }
  }
  if (quote === undefined || quoteStart === -1) {
    return undefined;
  }
  return {
    before: body.slice(0, quoteStart),
    quote,
    typed: body.slice(quoteStart + 1),
  };
}

/**
 * Split a (top-level, quote-free-at-cursor) call body into whitespace-separated tokens, keeping
 * parenthesised groups and quoted strings intact. Used to find the head and the current token.
 */
function splitTopLevelTokens(body: string): string[] {
  const tokens: string[] = [];
  let current = "";
  let depth = 0;
  let quote: string | undefined;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === "\\") {
        const next = body[i + 1];
        if (next !== undefined) {
          current += next;
          i += 1;
        }
        continue;
      }
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === "(") {
      depth += 1;
      current += ch;
      continue;
    }
    if (ch === ")") {
      depth -= 1;
      current += ch;
      continue;
    }
    if (depth === 0 && ch !== undefined && /\s/u.test(ch)) {
      if (current.length > 0) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += ch;
  }
  if (current.length > 0) {
    tokens.push(current);
  }
  return tokens;
}

/** The zero-based positional-argument index the cursor occupies, given the split call tokens. */
function argSlot(tokens: readonly string[], lastIsPartial: boolean): number {
  // Tokens[0] is the head; arguments are tokens[1..]. The partial last token is the active arg.
  const argCount = tokens.length - 1;
  return lastIsPartial ? Math.max(0, argCount - 1) : argCount;
}

/** Whether `token` is a dotted/`@`-rooted path being continued (`Request.`, `@`, `this.`). */
function isPathContinuation(token: string): boolean {
  if (token.startsWith("@")) {
    return true;
  }
  if (!token.includes(".")) {
    return false;
  }
  const root = token.split(".")[0] ?? "";
  return PATH_ROOTS.has(root) || root === "this";
}

/* ------------------------------------ block-stack walk ----------------------------------- */

/**
 * The enclosing block-helper names (outermost→innermost) at `offset`, computed from the parsed
 * AST. A block contributes its name to the stack when `offset` lies strictly inside the block's
 * open/close tags (so the cursor is in the body or inverse). Robust to unclosed blocks: the
 * parser extends an unclosed block's `end` to EOF, so a still-open `{{#each}}…{{<cursor>` counts.
 */
function enclosingBlockStack(decoded: string, offset: number): string[] {
  const { ast } = parse(decoded);
  const stack: string[] = [];
  collectEnclosing(ast.body, offset, stack);
  return stack;
}

function collectEnclosing(statements: readonly Statement[], offset: number, out: string[]): void {
  for (const statement of statements) {
    if (statement.type !== "BlockNode") {
      continue;
    }
    if (isInsideBlockBody(statement, offset)) {
      out.push(statement.path.original);
      collectEnclosing(statement.program, offset, out);
      if (statement.inverse) {
        collectEnclosing(statement.inverse, offset, out);
      }
    }
  }
}

/**
 * Whether `offset` is inside the BODY of `block` — after its open tag and before its close tag
 * (or before EOF when the block was never closed).
 */
function isInsideBlockBody(block: BlockNode, offset: number): boolean {
  const bodyStart = block.openTag.end;
  const bodyEnd = block.closeTag ? block.closeTag.start : block.end;
  return offset >= bodyStart && offset <= bodyEnd;
}

/* --------------------------------------- utilities --------------------------------------- */

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export { classifyCompletionContext, type TemplateCompletionContext };
