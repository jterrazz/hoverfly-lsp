/**
 * Structure — structural-key & value-shape rules (the "only allow the strict necessary" family).
 * All FACTS (the allowed-key matrix per object kind, the user-keyed maps to skip, the
 * schema-absent legal keys, the did-you-mean distance) live in `../../registry/structure.ts`;
 * nothing structural is hardcoded here.
 *
 *   HF603 (W)  unknown key on a closed object — no case-fold match against the kind's allowed
 *              set, so Go SILENTLY DROPS it (the user's data vanishes). Carries a did-you-mean
 *              suffix when a Levenshtein≤2 candidate exists. Range = the offending KEY node.
 *   HF604 (I)  case-only variant of an allowed key — Go binds it (case-insensitive) and
 *              normalizes, so it WORKS but is non-canonical. Range = the KEY node.
 *   HF212 (W)  a field-matcher with a `matcher` key (or an empty `{}`) but NO `value` — the
 *              value is nil so the matcher can never match. EXCEPT `negate` (→ HF207 territory)
 *              and `form` (→ HF208, value is an object). Range = the matcher object node.
 *   HF308 (E)  a `response.headers` value that is not an array of strings — Hoverfly 400s on it.
 *              Range = the offending value node.
 *   HF404 (E)  a `requiresState`/`transitionsState` value that is not a string — Hoverfly 400s.
 *              Range = the offending value node.
 *   HF405 (E)  a `removesState[]` entry that is not a string — Hoverfly 400s. Range = the element.
 *
 * ## Where HF603/HF604 run (and where they must NOT)
 * The unknown-key check runs at EVERY closed object level: `data`, each pair, `request`,
 * `response`, every field-matcher (recursing through `doMatch` chains AND through every
 * `headers`/`query` per-key matcher array), `logNormalDelay`, each `delays[]`/`delaysLogNormal[]`
 * item, `globalActions`, each `literals[]`/`variables[]` item, and `meta`. It is DELIBERATELY
 * skipped on:
 *   - the ROOT object — its unknown keys are already an HTTP 400 surfaced as HF102
 *     (`additionalProperties:false`); flagging here would double-report (report 13 §6).
 *   - the OPEN string-keyed maps whose keys are user data: `request.headers`, `request.query`,
 *     `response.headers`, `requiresState`, `transitionsState` (their PROPERTY KEYS are header /
 *     query / state names, never validated). We descend INTO them to reach the closed objects
 *     they contain (each header/query value is a matcher array of closed field-matchers), but we
 *     never treat their own keys as unknown. See {@link USER_KEYED_MAP_PATHS}.
 *   - `request.method` — legal despite being schema-absent (D5); it is in the `request` allowed
 *     set, so it is never flagged.
 *
 * This file is the one structural re-walk of the AST: the typed `SimulationModel` does not carry
 * every closed object (it omits `data`/`pair`/`meta`/`literals`/`variables`/`logNormalDelay`
 * key-shapes), and HF603 needs the raw KEY node of every property. The walk is driven entirely by
 * the {@link STRUCTURE_ALLOWED_KEYS} matrix and stays minimal and defensive (never throws).
 */

import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import type { Diagnostic } from "vscode-languageserver-types";

import {
  DID_YOU_MEAN_MAX_DISTANCE,
  STRUCTURE_ALLOWED_KEYS,
  type StructureObjectKind,
} from "../../registry/index.js";
import { makeDiagnostic } from "../diagnostics.js";
import type { RuleContext, SemanticRule } from "../types.js";

/* ----------------------------------- allowed-key lookup ---------------------------------- */

/**
 * Per kind: a map from a key's lowercased form to its canonical spelling. HF603/HF604 both work
 * CASE-FOLDED (Go's `encoding/json` matches struct fields case-insensitively), so this drives the
 * "binds vs dropped" decision: a lowercased key present here BINDS (canonical → ok, variant →
 * HF604); absent → dropped → HF603.
 */
const CANONICAL_BY_LOWER: Readonly<Record<StructureObjectKind, ReadonlyMap<string, string>>> =
  Object.fromEntries(
    (Object.keys(STRUCTURE_ALLOWED_KEYS) as StructureObjectKind[]).map((kind) => [
      kind,
      new Map(STRUCTURE_ALLOWED_KEYS[kind].map((key) => [key.toLowerCase(), key])),
    ]),
  ) as unknown as Record<StructureObjectKind, ReadonlyMap<string, string>>;

/* --------------------------------------- AST helpers ------------------------------------- */

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
  return node?.type === "object" ? node : undefined;
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
  const value = propValue(node, key);
  return value?.type === "array" ? value.items : [];
}

/* ----------------------------------- did-you-mean (HF603) -------------------------------- */

/** Case-insensitive Levenshtein distance, capped early once it exceeds {@link DID_YOU_MEAN_MAX_DISTANCE}. */
function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase();
  const t = b.toLowerCase();
  const rows = s.length + 1;
  const cols = t.length + 1;
  let previous = Array.from({ length: cols }, (_, index) => index);
  for (let i = 1; i < rows; i++) {
    const current = [i, ...Array.from({ length: cols - 1 }, () => 0)];
    for (let j = 1; j < cols; j++) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      current[j] = Math.min(
        (current[j - 1] ?? 0) + 1,
        (previous[j] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      );
    }
    previous = current;
  }
  return previous[cols - 1] ?? 0;
}

/**
 * The pre-formatted ` (did you mean "x"?)` suffix for an unknown key, or `""` when no allowed key
 * is within {@link DID_YOU_MEAN_MAX_DISTANCE}. Compares case-folded against the canonical set; the
 * nearest (then alphabetically-first on ties) candidate wins.
 */
function didYouMean(key: string, allowed: readonly string[]): string {
  let best: string | undefined;
  let bestDistance = DID_YOU_MEAN_MAX_DISTANCE + 1;
  for (const candidate of allowed) {
    const distance = levenshtein(key, candidate);
    if (distance < bestDistance || (distance === bestDistance && candidate < (best ?? ""))) {
      best = candidate;
      bestDistance = distance;
    }
  }
  return best !== undefined && bestDistance <= DID_YOU_MEAN_MAX_DISTANCE
    ? ` (did you mean "${best}"?)`
    : "";
}

/* ------------------------------------ HF603 / HF604 -------------------------------------- */

/**
 * Emit HF603 (dropped typo) / HF604 (case variant) for every property of a closed object whose
 * key is not a canonical allowed key. A key that case-folds to an allowed key but is not the exact
 * spelling → HF604; a key with no case-fold match → HF603 (+ did-you-mean).
 */
function checkUnknownKeys(
  context: RuleContext,
  object: ObjectASTNode,
  kind: StructureObjectKind,
  diagnostics: Diagnostic[],
): void {
  const canonicalByLower = CANONICAL_BY_LOWER[kind];
  const allowed = STRUCTURE_ALLOWED_KEYS[kind];
  for (const property of object.properties) {
    const key = property.keyNode.value;
    const canonical = canonicalByLower.get(key.toLowerCase());
    if (canonical === undefined) {
      // HF603 — no case-fold match: Go silently drops it.
      diagnostics.push(
        makeDiagnostic(context.textDocument, "HF603", property.keyNode, {
          key,
          didYouMean: didYouMean(key, allowed),
        }),
      );
    } else if (canonical !== key) {
      // HF604 — case-only variant: Go binds + normalizes it, but it is non-canonical.
      diagnostics.push(
        makeDiagnostic(context.textDocument, "HF604", property.keyNode, { key, canonical }),
      );
    }
  }
}

/* ------------------------------------------ HF212 ---------------------------------------- */

/** Matcher names whose missing-value semantics are owned by another code (HF207 / HF208). */
const HF212_EXEMPT = new Set(["negate", "form"]);

/**
 * HF212 — a field-matcher with a `matcher` key (or an empty `{}`) but NO `value` key can never
 * match (the value is nil). A bare `{value:…}` shorthand is legal (default exact) → not flagged.
 * `negate` (→ HF207) and `form` (→ HF208) are exempt. Range = the matcher object node.
 */
function checkMatcherValuePresence(
  context: RuleContext,
  object: ObjectASTNode,
  diagnostics: Diagnostic[],
): void {
  const hasValue = object.properties.some((p) => p.keyNode.value === "value");
  if (hasValue) {
    return;
  }
  const matcherNode = propValue(object, "matcher");
  // A bare `{value:…}` with no matcher is legal shorthand; but here value is ABSENT. The defect is
  // An empty `{}` OR a `matcher`-only object. Either way the value is nil → never matches.
  if (matcherNode?.type === "string" && HF212_EXEMPT.has(matcherNode.value.toLowerCase())) {
    return;
  }
  diagnostics.push(makeDiagnostic(context.textDocument, "HF212", object));
}

/* -------------------------------------- structural walk ---------------------------------- */

/**
 * Recursively walk a single field-matcher object: its unknown keys (HF603/HF604), its
 * value-presence (HF212), and its `doMatch` chain (one object, or a legacy array of objects).
 */
function walkFieldMatcher(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "fieldMatcher", diagnostics);
  checkMatcherValuePresence(context, object, diagnostics);

  const doMatch = propValue(object, "doMatch");
  if (doMatch?.type === "object") {
    walkFieldMatcher(context, doMatch, diagnostics);
  } else if (doMatch?.type === "array") {
    // Legacy/array-shaped doMatch (a schema error) — still recurse so nested matchers are checked.
    for (const item of doMatch.items) {
      walkFieldMatcher(context, item, diagnostics);
    }
  }
}

/** Walk every field-matcher in a matcher-array value (a `path`/`body`/header/query field). */
function walkMatcherArray(
  context: RuleContext,
  value: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  if (value?.type !== "array") {
    return;
  }
  for (const item of value.items) {
    walkFieldMatcher(context, item, diagnostics);
  }
}

/**
 * Walk a `request.headers`/`request.query` map: SKIP its own (user-defined) keys, but descend into
 * each value, which is a matcher array of closed field-matchers.
 */
function walkRequestMatcherMap(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  for (const property of object.properties) {
    walkMatcherArray(context, property.valueNode, diagnostics);
  }
}

function walkRequest(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "request", diagnostics);

  // Top-level matcher-array fields (path/method/destination/scheme/body) carry field-matchers.
  for (const field of ["path", "method", "destination", "scheme", "body"]) {
    walkMatcherArray(context, propValue(object, field), diagnostics);
  }
  // Headers/query are user-keyed maps → skip their keys, descend into their matcher arrays.
  walkRequestMatcherMap(context, propValue(object, "headers"), diagnostics);
  walkRequestMatcherMap(context, propValue(object, "query"), diagnostics);
  // RequiresState is a user-keyed map of STRING values (HF404). Keys are state names → not checked.
  checkStateValues(context, propValue(object, "requiresState"), diagnostics);
}

/* ----------------------------------- HF308 / HF404 / HF405 ------------------------------- */

/** HF404 — every `requiresState`/`transitionsState` value that is not a string. */
function checkStateValues(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  for (const property of object.properties) {
    const value = property.valueNode;
    if (value && value.type !== "string") {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF404", value));
    }
  }
}

/** HF308 — every `response.headers` value that is not an array whose items are all strings. */
function checkResponseHeaders(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  for (const property of object.properties) {
    const value = property.valueNode;
    if (!value) {
      continue;
    }
    if (value.type !== "array" || value.items.some((item) => item.type !== "string")) {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF308", value));
    }
  }
}

/** HF405 — every `removesState[]` entry that is not a string. */
function checkRemovesState(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  if (node?.type !== "array") {
    return;
  }
  for (const item of node.items) {
    if (item.type !== "string") {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF405", item));
    }
  }
}

function walkResponse(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "response", diagnostics);
  checkResponseHeaders(context, propValue(object, "headers"), diagnostics);
  checkStateValues(context, propValue(object, "transitionsState"), diagnostics);
  checkRemovesState(context, propValue(object, "removesState"), diagnostics);

  const logNormalDelay = asObject(propValue(object, "logNormalDelay"));
  if (logNormalDelay) {
    checkUnknownKeys(context, logNormalDelay, "logNormalDelay", diagnostics);
  }
}

function walkPair(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "pair", diagnostics);
  walkRequest(context, propValue(object, "request"), diagnostics);
  walkResponse(context, propValue(object, "response"), diagnostics);
}

/** Walk every item of a closed-object array (`literals[]`, `variables[]`, `delays[]`, …). */
function walkClosedItems(
  context: RuleContext,
  items: readonly ASTNode[],
  kind: StructureObjectKind,
  diagnostics: Diagnostic[],
): void {
  for (const item of items) {
    const object = asObject(item);
    if (object) {
      checkUnknownKeys(context, object, kind, diagnostics);
    }
  }
}

function walkGlobalActions(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "globalActions", diagnostics);
  walkClosedItems(context, arrayItems(object, "delays"), "delaysItem", diagnostics);
  walkClosedItems(
    context,
    arrayItems(object, "delaysLogNormal"),
    "delaysLogNormalItem",
    diagnostics,
  );
}

function walkData(
  context: RuleContext,
  node: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const object = asObject(node);
  if (!object) {
    return;
  }
  checkUnknownKeys(context, object, "data", diagnostics);
  for (const pair of arrayItems(object, "pairs")) {
    walkPair(context, pair, diagnostics);
  }
  walkClosedItems(context, arrayItems(object, "literals"), "literalsItem", diagnostics);
  walkClosedItems(context, arrayItems(object, "variables"), "variablesItem", diagnostics);
  walkGlobalActions(context, propValue(object, "globalActions"), diagnostics);
}

/* ------------------------------------------ rule ----------------------------------------- */

/**
 * The structure rule: one defensive pass over every CLOSED object in the document (driven by the
 * allowed-key matrix), emitting HF603/HF604 (unknown / case-variant keys), HF212 (matcher with no
 * value), HF308 (response header not array-of-strings), HF404 (non-string state value) and HF405
 * (non-string removesState entry). Skips the root and the user-keyed maps. Never throws.
 */
const structureRule: SemanticRule = {
  codes: ["HF212", "HF308", "HF404", "HF405", "HF603", "HF604"],
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const root = context.model.root;
    if (!root) {
      return diagnostics;
    }
    // ROOT is intentionally NOT checked for unknown keys (already HF102 via additionalProperties).
    walkData(context, propValue(root, "data"), diagnostics);

    const meta = asObject(propValue(root, "meta"));
    if (meta) {
      checkUnknownKeys(context, meta, "meta", diagnostics);
    }
    return diagnostics;
  },
};

/** All structure rules. The integrator spreads this into `rules/index.ts#ALL_RULES`. */
export const STRUCTURE_RULES: readonly SemanticRule[] = [structureRule];

export { structureRule };
