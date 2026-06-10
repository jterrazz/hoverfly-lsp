/**
 * HF2xx — request-matcher rules. One rule ({@link hf2xxMatcherRule}) walks every matcher in
 * the document (recursing through `doMatch` chains, since HF2xx applies at every nesting
 * level) and emits the eleven matcher diagnostics. All matcher FACTS — names, accepted value
 * types, config keys, which matchers transform their value for `doMatch`, the `form`
 * pseudo-matcher's body-only/case-sensitive semantics, and the panic notes — come from
 * `../../registry/matchers.ts`; nothing about a matcher is hardcoded here.
 *
 *   HF201 (E)  unknown matcher name (after lowercasing, and not body-`form`) — Hoverfly panics.
 *   HF202 (H)  known matcher in non-canonical casing (registry lookup is case-insensitive).
 *   HF203 (E)  value JSON type not in the matcher's accepted set — the pair can never match.
 *   HF204 (E)  `config` present on a non-`array` matcher (even `{}`) — Hoverfly panics.
 *   HF205 (W)  unknown key inside an `array` matcher's `config` — silently ignored.
 *   HF206 (E)  non-boolean `array` config value — Hoverfly panics.
 *   HF207 (W)  `negate` with a non-string value — matches vacuously (always true).
 *   HF208 (E)  `form` on a non-body field, or inside a `doMatch` chain — Hoverfly panics.
 *   HF209 (E)  non-lowercase `form` (`Form`/`FORM`/…) — hits the registry and panics.
 *   HF210 (H)  `doMatch` after an identity (non-transforming) matcher — AND on one value.
 *   HF211 (W)  empty-string value where the matcher can never match (`jwtjsonpath`/`regex`/`glob`).
 *
 * The model does not pre-flatten `doMatch` chains, so this file recurses the chain itself (see
 * {@link walkMatchers}): the correct shape is a single chained matcher OBJECT, and the legacy
 * array shape (a schema error) is also walked so per-matcher diagnostics still fire on its
 * nested objects. It is the only AST re-walk here and is kept minimal.
 */

import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import { type Diagnostic } from "vscode-languageserver-types";

import {
  MATCHER_SPECS,
  type MatcherSpec,
  type MatcherValueType,
  TRANSFORMING_MATCHER_NAMES,
} from "../../registry/index.js";
import { makeDiagnostic } from "../diagnostics.js";
import type { FieldContainer, MatcherModel, RuleContext, SemanticRule } from "../types.js";

/* ------------------------------------ registry lookup ------------------------------------ */

/** Specs keyed by their lowercased canonical name (registry lookup is case-insensitive). */
const SPEC_BY_LOWER_NAME: ReadonlyMap<string, MatcherSpec> = new Map(
  MATCHER_SPECS.filter((spec) => !spec.bodyOnly).map((spec) => [spec.name.toLowerCase(), spec]),
);

/** The `form` pseudo-matcher spec (case-sensitive, body-only — never in the lookup map). */
const FORM_SPEC: MatcherSpec | undefined = MATCHER_SPECS.find((spec) => spec.bodyOnly);

/** The set of transforming matcher names ({@link TRANSFORMING_MATCHER_NAMES}), lowercased. */
const TRANSFORMING = new Set(TRANSFORMING_MATCHER_NAMES.map((name) => name.toLowerCase()));

/** Matchers whose empty-string value can never match (catalog HF211). */
const EMPTY_VALUE_NEVER_MATCHES = new Set(["jwtjsonpath", "regex", "glob"]);

/** Canonical recognised `array` config keys (from the array spec). */
const ARRAY_CONFIG_KEYS: ReadonlySet<string> = new Set(
  MATCHER_SPECS.find((spec) => spec.name === "array")?.configKeys,
);

/* ---------------------------------- matcher tree walking --------------------------------- */

/** A matcher seen during the walk, plus placement/depth and the raw key nodes HF2xx needs. */
interface WalkedMatcher {
  readonly matcher: MatcherModel;
  /** 0 at a field's top level; +1 per `doMatch` nesting level. */
  readonly depth: number;
  /** The `doMatch` property's KEY node (HF210 points here), when present. */
  readonly doMatchKeyNode: ASTNode | undefined;
}

/** The KEY node of property `key` on an object node, if present (the model exposes only values). */
function keyNodeOf(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return object?.properties.find((p) => p.keyNode.value === key)?.keyNode;
}

/** Build a {@link MatcherModel} from a nested `doMatch` item node, inheriting placement. */
function nestedMatcher(node: ASTNode, fieldName: string, container: FieldContainer): MatcherModel {
  const object = node.type === "object" ? node : undefined;
  const value = (k: string): ASTNode | undefined =>
    object?.properties.find((p) => p.keyNode.value === k)?.valueNode;
  const matcherNode = value("matcher");
  return {
    node: object,
    matcherNode,
    matcherName: matcherNode?.type === "string" ? matcherNode.value : undefined,
    valueNode: value("value"),
    configNode: value("config"),
    doMatchNode: value("doMatch"),
    parent: { fieldName, container },
  };
}

/**
 * Yield every matcher in the document, recursing through `doMatch` chains. Each result carries
 * its nesting depth and the `doMatch` key node so the rules can target diagnostics precisely.
 */
function walkMatchers(matchers: readonly MatcherModel[]): WalkedMatcher[] {
  const out: WalkedMatcher[] = [];

  const visit = (matcher: MatcherModel, depth: number): void => {
    out.push({
      matcher,
      depth,
      doMatchKeyNode: keyNodeOf(matcher.node, "doMatch"),
    });
    const doMatchNode = matcher.doMatchNode;
    if (doMatchNode?.type === "object") {
      // The correct, Hoverfly-accepted shape: `doMatch` is a single chained matcher object.
      visit(
        nestedMatcher(doMatchNode, matcher.parent.fieldName, matcher.parent.container),
        depth + 1,
      );
    } else if (doMatchNode?.type === "array") {
      /*
       * Legacy/array-shaped doMatch (a schema error, HF102) — still recurse so that matcher
       * diagnostics fire on each nested object rather than vanishing behind the shape error.
       */
      for (const item of doMatchNode.items) {
        visit(nestedMatcher(item, matcher.parent.fieldName, matcher.parent.container), depth + 1);
      }
    }
  };

  for (const matcher of matchers) {
    visit(matcher, 0);
  }
  return out;
}

/* --------------------------------------- helpers ----------------------------------------- */

/** A human-readable description of a value node's JSON type (for HF206's `{type}`). */
function jsonTypeName(node: ASTNode): string {
  switch (node.type) {
    case "array": {
      return "an array";
    }
    case "object": {
      return "an object";
    }
    case "string": {
      return "a string";
    }
    case "number": {
      return "a number";
    }
    case "boolean": {
      return "a boolean";
    }
    case "null": {
      return "null";
    }
    default: {
      return "this value";
    }
  }
}

/** Render a spec's accepted value types as the catalog's `{expected}` phrase. */
function expectedValuePhrase(spec: MatcherSpec): string {
  const phrase: Record<MatcherValueType, string> = {
    array: "a JSON array",
    object: "an object",
    string: "a string",
  };
  return spec.valueTypes.map((type) => phrase[type]).join(" or ");
}

/** Whether `form` at this placement is valid: literal lowercase `form`, body field, top level. */
function isValidFormPlacement(matcher: MatcherModel, depth: number): boolean {
  return (
    matcher.parent.container === "request" && matcher.parent.fieldName === "body" && depth === 0
  );
}

/* ----------------------------------- per-matcher checks ---------------------------------- */

/**
 * Emit the name/placement diagnostic(s) for one matcher and return the spec to use for the
 * value/config checks (`undefined` when the name is unknown or `form` is mis-placed, so the
 * caller skips value-type checks that would only add noise atop a hard error).
 */
function checkNameAndPlacement(
  context: RuleContext,
  walked: WalkedMatcher,
  diagnostics: Diagnostic[],
): MatcherSpec | undefined {
  const { matcher, depth } = walked;
  const { matcherName, matcherNode } = matcher;

  // Absent / non-string matcher name = default exact (no diagnostic; a non-string is a schema concern).
  if (matcherName === undefined || !matcherNode) {
    return matcherName === undefined ? SPEC_BY_LOWER_NAME.get("") : undefined;
  }

  const lower = matcherName.toLowerCase();

  // The `form` family is case-SENSITIVE and dispatched outside the registry.
  if (lower === "form") {
    if (matcherName !== "form") {
      // HF209 — `Form`/`FORM`/… falls through to the registry and panics.
      diagnostics.push(
        makeDiagnostic(context.textDocument, "HF209", matcherNode, { name: matcherName }),
      );
      return undefined;
    }
    if (!isValidFormPlacement(matcher, depth)) {
      // HF208 — lowercase `form` on a non-body field or inside doMatch panics.
      diagnostics.push(makeDiagnostic(context.textDocument, "HF208", matcherNode));
      return undefined;
    }
    return FORM_SPEC;
  }

  const spec = SPEC_BY_LOWER_NAME.get(lower);
  if (!spec) {
    // HF201 — unknown matcher name; Hoverfly panics at match time.
    diagnostics.push(
      makeDiagnostic(context.textDocument, "HF201", matcherNode, { name: matcherName }),
    );
    return undefined;
  }

  // HF202 — known matcher, non-canonical casing (lookup is case-insensitive).
  if (matcherName !== spec.name) {
    diagnostics.push(
      makeDiagnostic(context.textDocument, "HF202", matcherNode, { canonical: spec.name }),
    );
  }
  return spec;
}

/** HF203 / HF207 / HF211 — value-shape checks for a resolved matcher spec. */
function checkValue(
  context: RuleContext,
  matcher: MatcherModel,
  spec: MatcherSpec,
  diagnostics: Diagnostic[],
): void {
  const { valueNode } = matcher;
  if (!valueNode) {
    // An absent value is a schema concern (HF102), not a matcher-semantics one.
    return;
  }

  const lower = spec.name.toLowerCase();

  /*
   * HF207 — `negate` with a non-string value matches vacuously (always true). This takes
   * precedence over HF203 for negate: it is the more accurate (warning, not "never match") one.
   */
  if (lower === "negate") {
    if (valueNode.type !== "string") {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF207", valueNode));
    }
    return;
  }

  // HF203 — value JSON type not in the matcher's accepted set; the pair can never match.
  const accepted = (spec.valueTypes as readonly string[]).includes(valueNode.type);
  if (!accepted) {
    diagnostics.push(
      makeDiagnostic(context.textDocument, "HF203", valueNode, {
        name: spec.name,
        expected: expectedValuePhrase(spec),
      }),
    );
    return;
  }

  // HF211 — empty-string value where this matcher can never match.
  if (
    valueNode.type === "string" &&
    valueNode.value === "" &&
    EMPTY_VALUE_NEVER_MATCHES.has(lower)
  ) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF211", valueNode, { name: lower }));
  }
}

/** HF204 / HF205 / HF206 — `config` checks for a resolved matcher spec. */
function checkConfig(
  context: RuleContext,
  matcher: MatcherModel,
  spec: MatcherSpec,
  diagnostics: Diagnostic[],
): void {
  const { configNode } = matcher;
  if (!configNode) {
    return;
  }

  // HF204 — `config` on any matcher except `array` panics (even `{}`).
  if (!spec.supportsConfig) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF204", configNode));
    return;
  }

  // `array` config: a non-object config is a schema concern; only inspect an object.
  if (configNode.type !== "object") {
    return;
  }

  for (const property of configNode.properties) {
    const key = property.keyNode.value;
    if (!ARRAY_CONFIG_KEYS.has(key)) {
      // HF205 — unknown config key (silently ignored by Hoverfly).
      diagnostics.push(makeDiagnostic(context.textDocument, "HF205", property.keyNode, { key }));
      continue;
    }
    const value = property.valueNode;
    if (value && value.type !== "boolean") {
      // HF206 — config values must be booleans; a non-bool panics.
      diagnostics.push(
        makeDiagnostic(context.textDocument, "HF206", value, { type: jsonTypeName(value) }),
      );
    }
  }
}

/** HF210 — `doMatch` after an identity (non-transforming) matcher is an AND on one value. */
function checkDoMatch(
  context: RuleContext,
  walked: WalkedMatcher,
  spec: MatcherSpec | undefined,
  diagnostics: Diagnostic[],
): void {
  const { matcher, doMatchKeyNode } = walked;
  if (!matcher.doMatchNode || !doMatchKeyNode || !spec) {
    return;
  }
  if (!TRANSFORMING.has(spec.name.toLowerCase())) {
    diagnostics.push(
      makeDiagnostic(context.textDocument, "HF210", doMatchKeyNode, { name: spec.name }),
    );
  }
}

/* ------------------------------------------ rule ----------------------------------------- */

/**
 * The HF2xx matcher rule: a single pass over every matcher (recursing into `doMatch`) emitting
 * all eleven matcher diagnostics. Never throws; absent/wrong-shaped nodes degrade to no-ops.
 */
export const hf2xxMatcherRule: SemanticRule = {
  codes: [
    "HF201",
    "HF202",
    "HF203",
    "HF204",
    "HF205",
    "HF206",
    "HF207",
    "HF208",
    "HF209",
    "HF210",
    "HF211",
  ],
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];

    for (const pair of context.model.pairs) {
      for (const field of pair.request.fields) {
        for (const walked of walkMatchers(field.matchers)) {
          const spec = checkNameAndPlacement(context, walked, diagnostics);
          if (spec) {
            checkValue(context, walked.matcher, spec, diagnostics);
            checkConfig(context, walked.matcher, spec, diagnostics);
          }
          checkDoMatch(context, walked, spec, diagnostics);
        }
      }
    }

    return diagnostics;
  },
};

/** All HF2xx matcher rules. The integrator spreads this into `ALL_RULES`. */
export const HF2XX_RULES: readonly SemanticRule[] = [hf2xxMatcherRule];
