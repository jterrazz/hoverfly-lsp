/**
 * Hover provider for tokens INSIDE templated Hoverfly strings.
 *
 * Driven from `service.ts` (which holds the cursor {@link Position}). Given a document position
 * inside a templatable body/header string, it finds the template token under the cursor and
 * renders:
 *
 *   - helper names → signature, arity, block/inline, builtin flag, example, docs link (registry);
 *   - faker type names → "zero-arg gofakeit v6.28.0 method" (registry version pin);
 *   - `Request.*` members → field/method docs, incl. the kubectl-JSONPath / xsel-XPath dialect
 *     note for the `Body` method-call form (report 08 §6).
 *
 * Returns `undefined` when the cursor is not on a recognised template token (so the caller can
 * fall back to schema/JSON hover). Never throws. All facts come from the registry / member data.
 */

import type { Hover, JSONDocument, Position, Range } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { MarkupKind } from "vscode-languageserver-types";

import {
  ALL_HELPERS,
  FAKER_NAMES,
  FAKER_PARAMETERIZED_PANICS,
  GOFAKEIT_VERSION,
  type HelperSpec,
} from "../registry/index.js";
import {
  type Expression,
  type MustacheNode,
  parse,
  type PathExpression,
  type Statement,
  type SubExpression,
} from "../template/index.js";
import { findTemplateLocation, type TemplateLocation } from "./template-location.js";
import { REQUEST_MEMBERS } from "./template-members.js";

const HELPER_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
  ALL_HELPERS.map((spec) => [spec.name, spec]),
);
const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);
const FAKER_PANIC_SET: ReadonlySet<string> = new Set(FAKER_PARAMETERIZED_PANICS);
const REQUEST_MEMBER_BY_NAME = new Map(REQUEST_MEMBERS.map((m) => [m.name, m]));

/**
 * Produce a {@link Hover} for the template token at `position`, or `undefined` when the cursor is
 * not inside a templatable string or not on a recognised token.
 */
function getTemplateHover(
  document: TextDocument,
  jsonDocument: JSONDocument,
  position: Position,
): Hover | undefined {
  const offset = document.offsetAt(position);
  const location = findTemplateLocation(document, jsonDocument, offset);
  if (!location) {
    return undefined;
  }

  const { ast } = parse(location.decoded);
  const hit = findHover(ast.body, location.decodedCursor);
  if (!hit) {
    return undefined;
  }
  const range = toRange(document, location, hit.start, hit.end);
  return { contents: { kind: MarkupKind.Markdown, value: hit.markdown }, range };
}

/* --------------------------------------- token search ------------------------------------ */

/** A hover hit: the markdown to show plus the decoded-offset span of the token. */
interface HoverHit {
  readonly markdown: string;
  readonly start: number;
  readonly end: number;
}

/** Walk the statements for the innermost token whose span contains `cursor`. */
function findHover(statements: readonly Statement[], cursor: number): HoverHit | undefined {
  for (const statement of statements) {
    if (!spans(statement, cursor)) {
      continue;
    }
    switch (statement.type) {
      case "MustacheNode": {
        return mustacheHover(statement, cursor);
      }
      case "BlockNode": {
        // The block-helper name itself, then recurse into the body/inverse.
        const onName = pathHover(statement.path, cursor, true);
        if (onName) {
          return onName;
        }
        const inParam = paramHover(statement.params, cursor, headName(statement.path));
        if (inParam) {
          return inParam;
        }
        return (
          findHover(statement.program, cursor) ??
          (statement.inverse ? findHover(statement.inverse, cursor) : undefined)
        );
      }
      default: {
        return undefined;
      }
    }
  }
  return undefined;
}

function mustacheHover(node: MustacheNode, cursor: number): HoverHit | undefined {
  if (spans(node.path, cursor)) {
    return pathHover(node.path, cursor, node.params.length > 0);
  }
  return paramHover(node.params, cursor, headName(node.path));
}

/**
 * Hover for a token inside a parameter list. `head` is the enclosing call's helper name, so a
 * string-literal arg of `faker` renders faker docs. Recurses into nested subexpressions.
 */
function paramHover(
  params: readonly Expression[],
  cursor: number,
  head: string | undefined,
): HoverHit | undefined {
  for (const [index, param] of params.entries()) {
    if (!spans(param, cursor)) {
      continue;
    }
    if (param.type === "SubExpression") {
      return subExpressionHover(param, cursor);
    }
    if (param.type === "PathExpression") {
      return pathHover(param, cursor, false);
    }
    if (param.type === "StringLiteral" && head === "faker" && index === 0) {
      return { markdown: fakerMarkdown(param.value), start: param.start, end: param.end };
    }
  }
  return undefined;
}

function subExpressionHover(node: SubExpression, cursor: number): HoverHit | undefined {
  if (spans(node.path, cursor)) {
    return pathHover(node.path, cursor, true);
  }
  return paramHover(node.params, cursor, headName(node.path));
}

/** The single-segment helper name a path heads, or `undefined` for dotted/`@`/`this` paths. */
function headName(path: PathExpression): string | undefined {
  if (path.data || path.thisRef || path.parts.length !== 1) {
    return undefined;
  }
  return path.parts[0];
}

/**
 * Hover for a path token: a helper name (when `asCall`), a `Request.*` member, or a faker arg is
 * handled at the param level. `asCall` is true when the path heads a call (mustache with args,
 * block open, subexpression head) so a single-segment name resolves to a helper.
 */
function pathHover(path: PathExpression, cursor: number, asCall: boolean): HoverHit | undefined {
  void cursor;
  // `Request.Body` / `Request.<member>` method/field hover.
  if (!path.data && !path.thisRef && path.parts[0] === "Request" && path.parts.length >= 2) {
    const member = REQUEST_MEMBER_BY_NAME.get(path.parts[1] ?? "");
    if (member) {
      return {
        markdown: requestMemberMarkdown(member.name),
        start: path.start,
        end: path.end,
      };
    }
  }

  // A single-segment identifier that is (or could be) a helper.
  if (!path.data && !path.thisRef && path.parts.length === 1) {
    const name = path.parts[0] ?? "";
    const spec = HELPER_BY_NAME.get(name);
    if (spec && (asCall || spec.args.length === 0)) {
      return { markdown: helperMarkdown(spec), start: path.start, end: path.end };
    }
  }
  return undefined;
}

/** Faker hover is detected on a string-literal arg of a `faker` call (handled in mustacheHover). */

/* ------------------------------------ markdown renderers --------------------------------- */

function helperMarkdown(spec: HelperSpec): string {
  const args = spec.args.map((a) =>
    a.optional ? `[${a.name}: ${a.type}]` : `${a.name}: ${a.type}`,
  );
  if (spec.variadic) {
    args.push("…");
  }
  const prefix = spec.block ? "#" : "";
  const signature = [`${prefix}${spec.name}`, ...args].join(" ");
  const kind = spec.block ? "block helper" : "inline helper";
  const origin = spec.builtin ? "raymond built-in" : "Hoverfly helper";
  const required = spec.args.filter((a) => !a.optional).length;
  const arity = spec.variadic
    ? `≥ ${required} argument(s)`
    : `${required}${required === spec.args.length ? "" : `–${spec.args.length}`} argument(s)`;
  return [
    `### \`${spec.name}\` — ${kind}`,
    "",
    `\`${signature}\``,
    "",
    spec.docs,
    "",
    `**Kind:** ${kind} · **Arity:** ${arity} · **Source:** ${origin}`,
    "",
    `Example: \`${spec.example}\``,
  ].join("\n");
}

function requestMemberMarkdown(name: string): string {
  const member = REQUEST_MEMBER_BY_NAME.get(name);
  if (!member) {
    return "";
  }
  const kind = member.methodCall ? "method call" : "field";
  return [
    `### \`Request.${member.name}\` — ${kind}`,
    "",
    member.docs,
    "",
    `Example: \`${member.example}\``,
  ].join("\n");
}

function fakerMarkdown(type: string): string {
  const known = FAKER_NAME_SET.has(type);
  const panics = FAKER_PANIC_SET.has(type);
  const lines = [`### faker \`'${type}'\``, ""];
  if (known) {
    lines.push(`A zero-arg gofakeit (v${GOFAKEIT_VERSION}) method.`);
  } else if (panics) {
    lines.push(
      `⚠️ \`${type}\` is a PARAMETERIZED gofakeit method — calling it with no arguments panics at render time.`,
    );
  } else {
    lines.push(
      `Unknown gofakeit type for the pinned version (v${GOFAKEIT_VERSION}); it renders empty.`,
    );
  }
  return lines.join("\n");
}

/* ------------------------------------- span utilities ------------------------------------ */

/** Whether `cursor` lies within a node's decoded span (inclusive of the end for edge cursors). */
function spans(node: { start: number; end: number }, cursor: number): boolean {
  return cursor >= node.start && cursor <= node.end;
}

/** Map a decoded `[start, end)` span back to a document {@link Range}. */
function toRange(
  document: TextDocument,
  location: TemplateLocation,
  start: number,
  end: number,
): Range {
  const docStart = location.sourceMap.toDocOffset(start);
  const docEnd = location.sourceMap.toDocOffset(end);
  return { start: document.positionAt(docStart), end: document.positionAt(docEnd) };
}

export { getTemplateHover };
