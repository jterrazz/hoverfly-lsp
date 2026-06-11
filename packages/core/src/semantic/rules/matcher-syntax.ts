/**
 * HF23x — matcher VALUE-SYNTAX rules (research/14).
 *
 * Report 07 / HF203 check the value's JSON *type* (string vs array vs object). These rules check
 * the value's *content syntax*: a value can be the right type (a string) yet be garbage content
 * for that matcher, which makes Hoverfly's matcher silently `return false` at proxy time — an
 * invisible, never-loud no-match. The motivating bug: `{ "matcher": "jwt", "value": "$.username" }`
 * — a string (HF203 passes) that is not valid JSON text, so the `jwt` matcher never matches.
 *
 *   HF230 (E)  `regex` value — and each `{{ regex: … }}` leaf in `xmltemplated` — is not a valid
 *              Go RE2 pattern (validated with the real RE2 grammar via `re2js`, NOT `new RegExp`).
 *   HF231 (E)  `json` / `jsonpartial` / `jwt` value string is not valid JSON text.
 *   HF232 (W)  `jsonpath` / `jwtjsonpath` value has unbalanced brackets/quotes (balance lint only —
 *              no pure-JS kubectl-JSONPath parser exists, so we never run a full parser).
 *   HF233 (W)  `xpath` value has unbalanced brackets/quotes (balance lint only — no xsel grammar in
 *              pure JS).
 *   HF234 (W)  `xml` / `xmltemplated` value is not well-formed XML (template tokens neutralized
 *              first), validated with `fast-xml-parser`'s `XMLValidator`.
 *   HF235 (W)  `jwt` value is valid JSON but has top-level keys other than `header`/`payload` (the
 *              decoded JWT composite only has those two — extra keys can never match).
 *   HF236 (W)  an `array` value element is not a JSON string (Hoverfly stringifies a non-string
 *              element to a non-literal, so that element can never match).
 *
 * Interplay (research/14 §4 "Interplay with existing codes", LAW):
 *   - HF203 (wrong value TYPE) fires first and owns the node. HF23x only fire when the value is the
 *     correct type (a string, or a JSON array for `array`); a wrong-typed value gets HF203, never a
 *     syntax code — so these rules silently skip a non-string value (and a non-array `array` value).
 *   - HF211 (empty value never matches) owns the empty-string case for `regex`/`jwtjsonpath`/`glob`.
 *     HF230/HF232 must NOT also fire on an empty string — we defer to HF211 by skipping it.
 *   - `glob` is deliberately silent: ryanuber/go-glob has NO invalid syntax (only `*` is special),
 *     so any "invalid glob" error would be 100% false positive (research/14 §3.2, §7).
 *
 * All matcher FACTS (which names are transforming, value types, etc.) come from `registry/*`; the
 * RE2 grammar comes from the shared `../re2.js` validator (also used by HF601). Nothing about a
 * matcher's syntax contract is hardcoded beyond the per-matcher dispatch this file owns.
 */

import { XMLValidator } from "fast-xml-parser";
import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import type { Diagnostic } from "vscode-languageserver-types";

import { makeDiagnostic } from "../diagnostics.js";
import { isValidRe2 } from "../re2.js";
import type { FieldContainer, MatcherModel, RuleContext, SemanticRule } from "../types.js";

/* ------------------------------- matcher-tree walking ------------------------------------ */

/** The KEY/VALUE node of property `key` on an object node, if present. */
function valueNodeOf(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

/** Build a {@link MatcherModel} from a nested `doMatch` item node, inheriting placement. */
function nestedMatcher(node: ASTNode, fieldName: string, container: FieldContainer): MatcherModel {
  const object = node.type === "object" ? node : undefined;
  const matcherNode = valueNodeOf(object, "matcher");
  return {
    node: object,
    matcherNode,
    matcherName: matcherNode?.type === "string" ? matcherNode.value : undefined,
    valueNode: valueNodeOf(object, "value"),
    configNode: valueNodeOf(object, "config"),
    doMatchNode: valueNodeOf(object, "doMatch"),
    parent: { fieldName, container },
  };
}

/**
 * Yield every matcher in a field, recursing through `doMatch` chains (object shape, plus the
 * legacy array shape so syntax checks still fire on each nested object). Syntax applies at every
 * nesting level, same as HF2xx.
 */
function walkMatchers(matchers: readonly MatcherModel[]): MatcherModel[] {
  const out: MatcherModel[] = [];
  const visit = (matcher: MatcherModel): void => {
    out.push(matcher);
    const doMatchNode = matcher.doMatchNode;
    if (doMatchNode?.type === "object") {
      visit(nestedMatcher(doMatchNode, matcher.parent.fieldName, matcher.parent.container));
    } else if (doMatchNode?.type === "array") {
      for (const item of doMatchNode.items) {
        visit(nestedMatcher(item, matcher.parent.fieldName, matcher.parent.container));
      }
    }
  };
  for (const matcher of matchers) {
    visit(matcher);
  }
  return out;
}

/* ----------------------------------- syntax checks --------------------------------------- */

/** Whether `s` has balanced `[]`, `()`, `{}` and balanced `'`/`"` quotes (a dialect-agnostic lint). */
function isBalanced(s: string): boolean {
  const stack: string[] = [];
  const close: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
  let quote: "'" | '"' | undefined;
  for (const ch of s) {
    if (quote) {
      if (ch === quote) {
        quote = undefined;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === "(" || ch === "[" || ch === "{") {
      stack.push(close[ch]!);
      continue;
    }
    if (ch === ")" || ch === "]" || ch === "}") {
      if (stack.pop() !== ch) {
        return false;
      }
    }
  }
  return stack.length === 0 && quote === undefined;
}

/**
 * Replace `xmltemplated` leaf tokens (`{{ ignore }}`, `{{ regex: … }}`) with a benign placeholder
 * so the XML validator checks the XML *skeleton*, not the template tokens (whose `{{`/`}}` and
 * regex metacharacters like `<`/`&` would otherwise trip a strict XML validator). research/14 §3.7.
 */
function neutralizeTemplateTokens(xml: string): string {
  return xml.replace(/\{\{.*?\}\}/gs, "x");
}

/** Each `{{ regex: PATTERN }}` PATTERN found in an `xmltemplated` value (for HF230 reuse). */
function extractTemplatedRegexes(xml: string): string[] {
  const out: string[] = [];
  // Mirrors Hoverfly's leaf regex `^\s*{{\s*regex:(.*)}}\s*$` applied per `{{…}}` token.
  const tokenRe = /\{\{\s*regex:(?<pattern>.*?)\}\}/gs;
  for (const match of xml.matchAll(tokenRe)) {
    out.push((match.groups?.["pattern"] ?? "").trim());
  }
  return out;
}

/* ---------------------------------- per-matcher checks ----------------------------------- */

/** HF230 / HF231 / HF232 / HF233 / HF234 / HF235 / HF236 for one matcher. */
function checkSyntax(context: RuleContext, matcher: MatcherModel, diagnostics: Diagnostic[]): void {
  const { matcherName, valueNode } = matcher;
  if (!valueNode) {
    return; // Absent value is a schema/HF212 concern, never a syntax one.
  }

  // `matcher` lookup is case-insensitive (D8); the default (absent) name is exact → no syntax rule.
  const name = (matcherName ?? "").toLowerCase();

  switch (name) {
    case "regex": {
      checkRegex(context, valueNode, diagnostics);
      return;
    }
    case "json":
    case "jsonpartial": {
      checkJsonText(context, name, valueNode, diagnostics);
      return;
    }
    case "jwt": {
      checkJwt(context, valueNode, diagnostics);
      return;
    }
    case "jsonpath":
    case "jwtjsonpath": {
      checkBalance(context, "HF232", valueNode, diagnostics);
      return;
    }
    case "xpath": {
      checkBalance(context, "HF233", valueNode, diagnostics);
      return;
    }
    case "xml":
    case "xmltemplated": {
      checkXml(context, name, valueNode, diagnostics);
      return;
    }
    case "array": {
      checkArray(context, valueNode, diagnostics);
      return;
    }
    default: {
      // Glob, exact, negate, "" — no value-syntax contract (research/14 §3.2, §7).
      return;
    }
  }
}

/** HF230 — `regex` value must compile as a Go RE2 pattern. */
function checkRegex(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
  if (valueNode.type !== "string") {
    return; // Wrong type → HF203 owns it.
  }
  if (valueNode.value === "") {
    return; // Empty → HF211 owns it.
  }
  if (!isValidRe2(valueNode.value)) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF230", valueNode));
  }
}

/** HF231 — `json` / `jsonpartial` value string must parse as JSON. */
function checkJsonText(
  context: RuleContext,
  name: string,
  valueNode: ASTNode,
  diagnostics: Diagnostic[],
): void {
  if (valueNode.type !== "string") {
    return; // Wrong type → HF203 owns it.
  }
  if (!parsesAsJson(valueNode.value)) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF231", valueNode, { name }));
  }
}

/** HF231 + HF235 — `jwt` value must be JSON text whose top-level keys are header/payload only. */
function checkJwt(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
  if (valueNode.type !== "string") {
    return; // Wrong type → HF203 owns it.
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(valueNode.value);
  } catch {
    // HF231 — the motivating `$.username` case: a string that is not valid JSON text.
    diagnostics.push(makeDiagnostic(context.textDocument, "HF231", valueNode, { name: "jwt" }));
    return;
  }
  // HF235 — parses, but a top-level key outside {header, payload} can never match a JWT composite.
  if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
    for (const key of Object.keys(parsed)) {
      if (key !== "header" && key !== "payload") {
        diagnostics.push(makeDiagnostic(context.textDocument, "HF235", valueNode, { k: key }));
      }
    }
  }
}

/**
 * HF232 / HF233 — bracket/quote balance lint for a string value. An empty value is trivially
 * balanced (so it never fires here); the empty-`jwtjsonpath` no-match is owned by HF211 anyway.
 */
function checkBalance(
  context: RuleContext,
  code: "HF232" | "HF233",
  valueNode: ASTNode,
  diagnostics: Diagnostic[],
): void {
  if (valueNode.type !== "string") {
    return; // Wrong type → HF203 owns it.
  }
  if (!isBalanced(valueNode.value)) {
    diagnostics.push(makeDiagnostic(context.textDocument, code, valueNode));
  }
}

/** HF234 (+ HF230 reuse) — `xml` / `xmltemplated` value must be well-formed XML. */
function checkXml(
  context: RuleContext,
  name: string,
  valueNode: ASTNode,
  diagnostics: Diagnostic[],
): void {
  if (valueNode.type !== "string") {
    return; // Wrong type → HF203 owns it.
  }
  const raw = valueNode.value;

  if (name === "xmltemplated") {
    // Each `{{ regex: PATTERN }}` leaf is a Go RE2 pattern compiled at match time → reuse HF230.
    for (const pattern of extractTemplatedRegexes(raw)) {
      if (pattern !== "" && !isValidRe2(pattern)) {
        diagnostics.push(makeDiagnostic(context.textDocument, "HF230", valueNode));
      }
    }
  }

  const xml = name === "xmltemplated" ? neutralizeTemplateTokens(raw) : raw;
  if (xml.trim() === "") {
    return; // An empty/whitespace value is not a well-formedness defect to flag here.
  }
  if (XMLValidator.validate(xml) !== true) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF234", valueNode, { name }));
  }
}

/** HF236 — every `array` element must be a JSON string. */
function checkArray(context: RuleContext, valueNode: ASTNode, diagnostics: Diagnostic[]): void {
  if (valueNode.type !== "array") {
    return; // Wrong type → HF203 owns it.
  }
  valueNode.items.forEach((item, index) => {
    if (item.type !== "string") {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF236", item, { i: index }));
    }
  });
}

/* --------------------------------------- helpers ----------------------------------------- */

/** Whether `text` parses as JSON (the same strict grammar as Go's `encoding/json`). */
function parsesAsJson(text: string): boolean {
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------ rule ----------------------------------------- */

/**
 * The HF23x matcher-value-syntax rule: one pass over every matcher (recursing `doMatch`) emitting
 * all seven value-syntax diagnostics. Never throws; absent/wrong-typed nodes degrade to no-ops and
 * defer to HF203/HF211.
 */
export const matcherSyntaxRule: SemanticRule = {
  codes: ["HF230", "HF231", "HF232", "HF233", "HF234", "HF235", "HF236"],
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const pair of context.model.pairs) {
      for (const field of pair.request.fields) {
        for (const matcher of walkMatchers(field.matchers)) {
          checkSyntax(context, matcher, diagnostics);
        }
      }
    }
    return diagnostics;
  },
};

/** All matcher-value-syntax rules. The integrator spreads this into `ALL_RULES`. */
export const MATCHER_SYNTAX_RULES: readonly SemanticRule[] = [matcherSyntaxRule];
