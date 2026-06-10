/**
 * Semantic analysis of a Hoverfly template (the impure-data layer atop the pure parser).
 *
 * `analyze` walks the {@link Program} AST produced by {@link parse} and emits
 * {@link TemplateFinding}s whose `kind` maps 1:1 to the HF5xx catalog codes HF502–HF509. The
 * caller (the HF5xx semantic rule) maps the template-relative offsets back to document
 * positions via the source-map and turns each finding into a catalog diagnostic. HF501 (syntax
 * present while not templated) and HF510 (`variables[].function` built-in misuse) live in the
 * rule, not here, because they need document-level model context, not the template AST.
 *
 * Facts come exclusively from the registries (`../registry/*`) — no helper/faker/now data is
 * hardcoded.
 *
 * ## HF503 ambiguity heuristic (report 08 §4 — raymond resolution order: helpers shadow paths)
 *
 * In raymond a leading token like `Foo` could be a helper call OR a context path lookup; helpers
 * win when one is registered. The parser cannot tell `{{State.foo}}` (a path) from
 * `{{randomString}}` (a zero-arg helper) structurally. To avoid false positives on the very
 * common path forms (`{{Request.Path}}`, `{{State.foo}}`, `{{Vars.x}}`, `{{this.id}}`,
 * `{{@index}}`) we only flag a leading path as an UNKNOWN helper (HF503) when it is
 * unambiguously a *call*:
 *
 *   - it carries arguments (`{{foo 'a'}}` — only helpers take positional args), OR
 *   - it is a block open (`{{#foo}}` — only block helpers open blocks), OR
 *   - it is a subexpression head (`(foo ...)` — subexpressions are always helper calls).
 *
 * A bare, arg-less, single-segment mustache (`{{foo}}`) is treated as a path lookup UNLESS its
 * name matches a known helper (so `{{randomString}}` validates as a helper and a known zero-arg
 * helper used bare is fine). Consequently `{{somethingUnknown}}` with no args is NOT flagged —
 * it is indistinguishable from a context variable and raymond renders it as an empty path
 * lookup rather than panicking. Dotted/`@`/`this` paths are never helper candidates (helpers are
 * single-segment identifiers), with the one exception of the `Request.Body` method-call form,
 * which is recognised and validated like the `requestBody` helper (report 08 §6).
 */

import {
  ALL_HELPERS,
  FAKER_NAMES,
  FAKER_PARAMETERIZED_PANICS,
  GOFAKEIT_VERSION,
  type HelperSpec,
  NOW_OFFSET_UNITS,
} from "../registry/index.js";
import type {
  BlockNode,
  Expression,
  MustacheNode,
  PathExpression,
  Statement,
  StringLiteral,
  SubExpression,
} from "./ast.js";
import { parse, type TemplateParseError } from "./parser.js";

/** The HF5xx codes the analyzer emits (HF501/HF510 are emitted by the rule, not here). */
type TemplateFindingKind =
  | "HF502"
  | "HF503"
  | "HF504"
  | "HF505"
  | "HF506"
  | "HF507"
  | "HF508"
  | "HF509";

/**
 * A single template finding. Offsets are relative to the DECODED template string that was
 * analysed; the caller maps them to document positions. `args` carries the catalog message
 * placeholders (e.g. `{ name }` for HF503), so the rule never re-derives wording.
 */
interface TemplateFinding {
  readonly kind: TemplateFindingKind;
  /** Inclusive start offset into the decoded template. */
  readonly start: number;
  /** Exclusive end offset into the decoded template. */
  readonly end: number;
  /** Catalog message placeholder args for this finding's code. */
  readonly args: Readonly<Record<string, string>>;
}

/** Document-level context the analyzer needs to resolve `Vars.X` / `Literals.X` references. */
interface AnalyzerContext {
  /** `data.variables[].name` values in scope (for HF505). */
  readonly variableNames: ReadonlySet<string>;
  /** `data.literals[].name` values in scope (for HF506). */
  readonly literalNames: ReadonlySet<string>;
}

/* ------------------------------------ registry indexes ----------------------------------- */

/** Helper specs keyed by exact (case-sensitive) name; helper names are case-sensitive. */
const HELPER_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
  ALL_HELPERS.map((spec) => [spec.name, spec]),
);

const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);
const FAKER_PANIC_SET: ReadonlySet<string> = new Set(FAKER_PARAMETERIZED_PANICS);

/** A valid `now` offset: optional sign, then one or more number+unit segments (report 08 §2). */
const NOW_OFFSET_RE = new RegExp(
  `^[-+]?(?:\\d+(?:\\.\\d+)?(?:${NOW_OFFSET_UNITS.map(escapeRegExp).join("|")}))+$`,
  "u",
);

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`);
}

/* ---------------------------------------- analyze ---------------------------------------- */

/**
 * Analyse a decoded template string and return every HF502–HF509 finding (template-relative
 * offsets). Never throws.
 */
function analyze(
  decoded: string,
  context: AnalyzerContext = { variableNames: new Set(), literalNames: new Set() },
): TemplateFinding[] {
  const findings: TemplateFinding[] = [];
  const { ast, errors } = parse(decoded);

  // HF502 — every recovered parse error.
  for (const error of errors) {
    findings.push(parseErrorFinding(error));
  }

  walkStatements(ast.body, findings, context);
  return findings;
}

function parseErrorFinding(error: TemplateParseError): TemplateFinding {
  return {
    kind: "HF502",
    start: error.start,
    end: error.end,
    args: { message: error.message },
  };
}

/* --------------------------------------- AST walk ---------------------------------------- */

function walkStatements(
  statements: readonly Statement[],
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  for (const statement of statements) {
    switch (statement.type) {
      case "ContentNode": {
        break;
      }
      case "MustacheNode": {
        checkMustache(statement, findings, context);
        break;
      }
      case "BlockNode": {
        checkBlock(statement, findings, context);
        break;
      }
      // No default — the union is exhaustive.
    }
  }
}

function checkMustache(
  node: MustacheNode,
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  /*
   * A mustache is a call (helper candidate) when it carries arguments; otherwise it may be a
   * bare path lookup that only counts as a call when its name is a known helper.
   */
  checkCall(node.path, node.params, node.params.length > 0, false, findings, context);
  for (const param of node.params) {
    checkExpression(param, findings, context);
  }
}

function checkBlock(node: BlockNode, findings: TemplateFinding[], context: AnalyzerContext): void {
  // A block open (`{{#foo}}`) is unambiguously a (block) helper call.
  checkCall(node.path, node.params, true, true, findings, context);
  for (const param of node.params) {
    checkExpression(param, findings, context);
  }
  walkStatements(node.program, findings, context);
  if (node.inverse) {
    walkStatements(node.inverse, findings, context);
  }
}

function checkExpression(
  expression: Expression,
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  switch (expression.type) {
    case "SubExpression": {
      checkSubExpression(expression, findings, context);
      break;
    }
    case "PathExpression": {
      // A path used as an ARGUMENT is a value lookup, never a helper call — only resolve
      // Vars/Literals references here (no HF503/HF504).
      checkPathReferences(expression, findings, context);
      break;
    }
    default: {
      // Literals carry nothing to validate at the expression level.
      break;
    }
  }
}

function checkSubExpression(
  node: SubExpression,
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  // A subexpression head is always a helper call.
  checkCall(node.path, node.params, true, false, findings, context);
  for (const param of node.params) {
    checkExpression(param, findings, context);
  }
}

/* ----------------------------------- helper-call checks ---------------------------------- */

/**
 * Validate a call header (`path params...`). `isCall` is the disambiguation flag (see the
 * module HF503 heuristic): when false the path is treated as a value lookup and only
 * Vars/Literals references are resolved. `isBlock` selects block-vs-inline arity messaging.
 */
function checkCall(
  path: PathExpression,
  params: readonly Expression[],
  isCall: boolean,
  isBlock: boolean,
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  // The `Request.Body 'jsonpath' '$.x'` method-call form: a dotted path that behaves like the
  // `requestBody` helper (report 08 §6). Recognised so it is neither a false HF503 nor skipped.
  if (isRequestBodyMethodCall(path)) {
    return;
  }

  // Dotted / @data / this paths are value lookups, never helper calls — resolve references.
  if (path.parts.length !== 1 || path.data || path.thisRef) {
    checkPathReferences(path, findings, context);
    return;
  }

  const name = path.parts[0];
  if (name === undefined) {
    return;
  }
  const spec = HELPER_BY_NAME.get(name);

  /*
   * Bare arg-less mustache whose name is NOT a known helper → treat as a context path lookup,
   * not an unknown helper (raymond renders it as an empty lookup, no panic). No HF503.
   */
  if (!isCall && !spec) {
    checkPathReferences(path, findings, context);
    return;
  }

  if (!spec) {
    // HF503 — a call (args / block / subexpression head) to an unregistered helper name.
    findings.push({ kind: "HF503", start: path.start, end: path.end, args: { name } });
    return;
  }

  checkArity(spec, path, params, isBlock, findings);
  checkSpecialHelperArgs(spec, params, findings);
}

/**
 * HF504 — arity / block-vs-inline misuse. raymond does not hard-enforce arity, so this is the
 * intended-contract check (the catalog still rates it an error per D4). The required range is
 * `[min, max]` where max is unbounded for variadic helpers.
 */
function checkArity(
  spec: HelperSpec,
  path: PathExpression,
  params: readonly Expression[],
  isBlock: boolean,
  findings: TemplateFinding[],
): void {
  // Block-vs-inline misuse: a block helper used inline, or an inline helper opened as a block.
  if (spec.block !== isBlock) {
    const wanted = spec.block ? "a block helper" : "an inline helper";
    findings.push({
      kind: "HF504",
      start: path.start,
      end: path.end,
      args: { name: spec.name, sig: wanted, n: String(params.length) },
    });
    return;
  }

  const required = spec.args.filter((arg) => !arg.optional).length;
  const max = spec.variadic ? Number.POSITIVE_INFINITY : spec.args.length;
  const got = params.length;
  if (got < required || got > max) {
    findings.push({
      kind: "HF504",
      start: path.start,
      end: path.end,
      args: { name: spec.name, sig: describeArity(spec, required, max), n: String(got) },
    });
  }
}

/** A human-readable arity phrase for HF504's `{sig}` slot. */
function describeArity(spec: HelperSpec, required: number, max: number): string {
  if (spec.variadic) {
    return required === 0 ? "any number of arguments" : `at least ${plural(required)}`;
  }
  if (required === max) {
    return plural(required);
  }
  return `${required} to ${max} arguments`;
}

function plural(count: number): string {
  return count === 1 ? "1 argument" : `${count} arguments`;
}

/* -------------------------------- faker / now argument checks ---------------------------- */

/**
 * Per-helper first-argument validation: `faker` (HF507/HF508) and `now` (HF509). Only fires on
 * STRING-LITERAL arguments — a dynamic arg (path/subexpression) is unknowable statically and is
 * never flagged (precision rule).
 */
function checkSpecialHelperArgs(
  spec: HelperSpec,
  params: readonly Expression[],
  findings: TemplateFinding[],
): void {
  if (spec.name === "faker") {
    checkFakerArg(params[0], findings);
  } else if (spec.name === "now") {
    checkNowOffsetArg(params[0], findings);
  }
}

function checkFakerArg(arg: Expression | undefined, findings: TemplateFinding[]): void {
  const literal = asStringLiteral(arg);
  if (!literal) {
    return;
  }
  const type = literal.value;
  if (FAKER_NAME_SET.has(type)) {
    return;
  }
  if (FAKER_PANIC_SET.has(type)) {
    // HF508 — a known parameterized gofakeit method called with no args panics at render.
    findings.push({ kind: "HF508", start: literal.start, end: literal.end, args: { t: type } });
    return;
  }
  // HF507 — unknown faker type for the pinned gofakeit version (renders empty).
  findings.push({
    kind: "HF507",
    start: literal.start,
    end: literal.end,
    args: { t: type, version: GOFAKEIT_VERSION },
  });
}

function checkNowOffsetArg(arg: Expression | undefined, findings: TemplateFinding[]): void {
  const literal = asStringLiteral(arg);
  if (!literal) {
    return;
  }
  const offset = literal.value;
  /*
   * Empty string and "0" are valid (no offset / zero duration); otherwise it must match the
   * unit grammar. An invalid offset is silently ignored by Hoverfly (HF509).
   */
  if (offset === "" || offset === "0" || NOW_OFFSET_RE.test(offset)) {
    return;
  }
  findings.push({ kind: "HF509", start: literal.start, end: literal.end, args: { o: offset } });
}

function asStringLiteral(expression: Expression | undefined): StringLiteral | undefined {
  return expression?.type === "StringLiteral" ? expression : undefined;
}

/* ---------------------------------- Vars / Literals refs --------------------------------- */

/**
 * HF505 / HF506 — resolve `Vars.X` and `Literals.X` path references against the document's
 * declared variable/literal names. Only the two-segment `Vars.<name>` / `Literals.<name>` head
 * is checked; deeper paths (`Vars.x.y`) still key off the first sub-name.
 */
function checkPathReferences(
  path: PathExpression,
  findings: TemplateFinding[],
  context: AnalyzerContext,
): void {
  if (path.data || path.thisRef || path.parts.length < 2) {
    return;
  }
  const root = path.parts[0];
  const name = path.parts[1];
  if (name === undefined) {
    return;
  }
  if (root === "Vars" && !context.variableNames.has(name)) {
    findings.push({ kind: "HF505", start: path.start, end: path.end, args: { x: name } });
  } else if (root === "Literals" && !context.literalNames.has(name)) {
    findings.push({ kind: "HF506", start: path.start, end: path.end, args: { x: name } });
  }
}

/** Whether `path` is the `Request.Body` method-call form (`{{Request.Body 'jsonpath' '$.x'}}`). */
function isRequestBodyMethodCall(path: PathExpression): boolean {
  return (
    !path.data &&
    !path.thisRef &&
    path.parts.length === 2 &&
    path.parts[0] === "Request" &&
    path.parts[1] === "Body"
  );
}

export { analyze, type AnalyzerContext, type TemplateFinding };
