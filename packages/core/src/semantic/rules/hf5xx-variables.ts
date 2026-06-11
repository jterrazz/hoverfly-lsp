/**
 * HF5xx (variables) + a pair of cross-family `data.*` checks that key off the SAME model nodes.
 *
 * This file owns everything that validates `data.variables[]` / `data.literals[]` as STRUCTURED
 * import inputs (as opposed to `hf5xx.ts`, which validates `{{ … }}` template syntax inside
 * response bodies/headers). Keeping the variable-function checks together is load-bearing: HF510
 * and HF511 are mutually exclusive (a name is EITHER a raymond built-in OR an otherwise-unknown
 * function, never both), so one rule must decide which fires.
 *
 * Codes:
 *   HF510 (E)  `data.variables[].function` is one of the 8 raymond block built-ins
 *              (`if/unless/with/each/first/log/lookup/equal`). Better-UX message than HF511.
 *   HF511 (E)  `data.variables[].function` is a string that is NOT one of the 52 Hoverfly helpers
 *              AND not one of the 8 built-ins. Hoverfly HARD-REJECTS the import (HTTP 500,
 *              `function X not supported for custom variable`; report 13 §3.11 / T7/T13).
 *   HF512 (W)  `data.variables[].arguments` length ≠ the helper's arity (for a known-52
 *              `function`). Hoverfly tolerates the mismatch at import but the variable then renders
 *              empty (report 13 §3.12 / T8/T21). `requestBody` → exactly 2; variadic → a minimum.
 *   HF214 (W)  a `data.literals[].name` / `data.variables[].name` containing a character outside
 *              `[A-Za-z0-9_]` — un-referenceable via `{{Literals.x}}` / `{{Vars.x}}` (report 13
 *              §3.10). The name is still a legal Go map key (imports fine), just unusable → warning.
 *   HF213 (I)  a `destination` matcher with an `exact`/empty matcher whose value contains `://`
 *              (a full URL pasted where Hoverfly compares only the request host[:port]; report 13
 *              §3.3 / T19). Advisory — `glob`/`regex` destinations may legitimately carry slashes,
 *              so it fires ONLY for exact/default matchers.
 *
 * Precedence (HF510 vs HF511): a built-in name → HF510 ONLY; any other unknown → HF511 ONLY; a
 * valid Hoverfly helper → neither. The two never co-fire on the same node.
 */

import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import type { Diagnostic } from "vscode-languageserver-types";

import {
  type HelperSpec,
  HOVERFLY_HELPERS,
  RAYMOND_BUILTINS,
  VARIABLE_FUNCTION_NAMES,
} from "../../registry/index.js";
import { makeDiagnostic } from "../diagnostics.js";
import type { MatcherModel, RuleContext, SemanticRule } from "../types.js";

/** The 52 Hoverfly helper names valid in `data.variables[].function`. */
const VALID_VARIABLE_FUNCTIONS: ReadonlySet<string> = new Set(VARIABLE_FUNCTION_NAMES);

/** The 8 raymond block built-ins — HF510's specific case (rejected by `SupportedMethodMap`). */
const RAYMOND_BUILTIN_NAMES: ReadonlySet<string> = new Set(RAYMOND_BUILTINS.map((h) => h.name));

/** HelperSpec by name, for the HF512 arity lookup (the 52 Hoverfly helpers). */
const HELPER_SPEC_BY_NAME: ReadonlyMap<string, HelperSpec> = new Map(
  HOVERFLY_HELPERS.map((helper) => [helper.name, helper]),
);

/** A character outside the templating-reference charset (anything that is not `[A-Za-z0-9_]`). */
const NON_WORD_CHAR = /[^A-Za-z0-9_]/;

/* ------------------------------------- small AST helpers --------------------------------- */

/** The value node for property `key` on an object node, if present. */
function propValue(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

/** The items of a `data.<key>[]` array, or `[]` when missing/not an array. */
function dataArrayItems(dataNode: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
  const array = propValue(dataNode, key);
  return array?.type === "array" ? array.items : [];
}

/* ---------------------------- HF510 / HF511 — variable function ---------------------------- */

/**
 * Validate `data.variables[].function`. Exactly one of HF510 / HF511 fires per item (or neither
 * for a valid helper). The string-node guard means a missing/non-string function is left to the
 * schema (HF102 `function is required`), not flagged here.
 */
function checkVariableFunction(
  context: RuleContext,
  fnNode: ASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  if (fnNode?.type !== "string") {
    return;
  }
  const name = fnNode.value;
  if (VALID_VARIABLE_FUNCTIONS.has(name)) {
    return;
  }
  if (RAYMOND_BUILTIN_NAMES.has(name)) {
    // HF510 owns the specific "you used a block built-in" message.
    diagnostics.push(makeDiagnostic(context.textDocument, "HF510", fnNode));
    return;
  }
  // HF511 — the catch-all for everything else (misspellings, fictional helpers).
  diagnostics.push(makeDiagnostic(context.textDocument, "HF511", fnNode, { name }));
}

/* ---------------------------------- HF512 — argument arity -------------------------------- */

/** A human-readable arity phrase for HF512's `{sig}` slot (count only; template adds "arguments"). */
function describeArity(spec: HelperSpec): string {
  const required = spec.args.filter((arg) => !arg.optional).length;
  if (spec.variadic) {
    return `at least ${String(required)}`;
  }
  const max = spec.args.length;
  return required === max ? String(required) : `${String(required)} to ${String(max)}`;
}

/**
 * HF512 — `arguments` length outside the helper's accepted range. Only fires for a known-52
 * `function` (an unknown function is HF511's concern, not arity). A missing `arguments` array is
 * treated as zero args. Variadic helpers enforce only a minimum.
 */
function checkVariableArity(
  context: RuleContext,
  item: ObjectASTNode,
  diagnostics: Diagnostic[],
): void {
  const fnNode = propValue(item, "function");
  if (fnNode?.type !== "string") {
    return;
  }
  const spec = HELPER_SPEC_BY_NAME.get(fnNode.value);
  if (!spec) {
    return;
  }

  const argsNode = propValue(item, "arguments");
  // A non-array `arguments` is a schema concern (HF102), not arity; only count a real array.
  const got = argsNode?.type === "array" ? argsNode.items.length : 0;
  const required = spec.args.filter((arg) => !arg.optional).length;
  const max = spec.variadic ? Number.POSITIVE_INFINITY : spec.args.length;

  if (got < required || got > max) {
    // Range = the `arguments` array node when present, else the whole item (the user must add it).
    const target = argsNode ?? item;
    diagnostics.push(
      makeDiagnostic(context.textDocument, "HF512", target, {
        fn: spec.name,
        sig: describeArity(spec),
        n: String(got),
      }),
    );
  }
}

/* --------------------------------- HF214 — templatable name ------------------------------- */

/** HF214 — a `name` value containing a char that breaks `{{Literals.x}}` / `{{Vars.x}}`. */
function checkName(context: RuleContext, item: ObjectASTNode, diagnostics: Diagnostic[]): void {
  const nameNode = propValue(item, "name");
  if (nameNode?.type !== "string") {
    return;
  }
  const name = nameNode.value;
  if (name.length > 0 && NON_WORD_CHAR.test(name)) {
    diagnostics.push(makeDiagnostic(context.textDocument, "HF214", nameNode, { n: name }));
  }
}

/* ------------------------------- HF213 — destination full URL ----------------------------- */

/**
 * Whether a matcher compares values literally (so a `://` in the value is certainly a mistake):
 * an `exact` matcher or the empty/default matcher. A `glob`/`regex`/etc. destination may carry
 * slashes intentionally → never flagged.
 */
function isLiteralMatcher(matcher: MatcherModel): boolean {
  const name = matcher.matcherName;
  return name === undefined || name === "" || name.toLowerCase() === "exact";
}

/** HF213 — a `destination` exact/default matcher whose value pastes in a scheme/path (`://`). */
function checkDestination(
  context: RuleContext,
  matcher: MatcherModel,
  diagnostics: Diagnostic[],
): void {
  if (matcher.parent.container !== "request" || matcher.parent.fieldName !== "destination") {
    return;
  }
  if (!isLiteralMatcher(matcher)) {
    return;
  }
  const { valueNode } = matcher;
  if (valueNode?.type !== "string" || !valueNode.value.includes("://")) {
    return;
  }
  diagnostics.push(
    makeDiagnostic(context.textDocument, "HF213", valueNode, { v: valueNode.value }),
  );
}

/* ----------------------------------------- rule ------------------------------------------ */

const HF5XX_VARIABLES_CODES = ["HF213", "HF214", "HF510", "HF511", "HF512"] as const;

/**
 * The variables/destination structural rule. Walks `data.variables[]`, `data.literals[]`, and the
 * destination matchers; never throws (absent/wrong-shaped nodes degrade to no-ops).
 */
const hf5xxVariablesRule: SemanticRule = {
  codes: HF5XX_VARIABLES_CODES,
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const { dataNode } = context.model;

    for (const item of dataArrayItems(dataNode, "variables")) {
      if (item.type !== "object") {
        continue;
      }
      checkVariableFunction(context, propValue(item, "function"), diagnostics);
      checkVariableArity(context, item, diagnostics);
      checkName(context, item, diagnostics);
    }

    for (const item of dataArrayItems(dataNode, "literals")) {
      if (item.type !== "object") {
        continue;
      }
      checkName(context, item, diagnostics);
    }

    for (const pair of context.model.pairs) {
      for (const requestField of pair.request.fields) {
        for (const matcher of requestField.matchers) {
          checkDestination(context, matcher, diagnostics);
        }
      }
    }

    return diagnostics;
  },
};

/** All HF5xx variable/structural rules. The integrator spreads this into `ALL_RULES`. */
const HF5XX_VARIABLES_RULES: readonly SemanticRule[] = [hf5xxVariablesRule];

export { HF5XX_VARIABLES_RULES, hf5xxVariablesRule };
