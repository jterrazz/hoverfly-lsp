/**
 * HF6xx — globalActions & misc.
 *
 *   HF601  W  `globalActions.delays[].urlPattern` is an invalid regex (range = the pattern).
 *   HF602  I  `response.postServeAction` not in the user-configured `registeredActions`
 *             allowlist — fires ONLY when the allowlist is configured and non-empty.
 *
 * Verified against SpectoLabs/hoverfly master (see this family's report notes):
 *   - HF601: `core/models/delay.go` (and `delay_log_normal.go`) match urlPattern with
 *            `regexp.Compile` / `regexp.MustCompile(...).MatchString(...)` — so urlPattern is a
 *            Go RE2 REGEX, not a glob. JS `RegExp` and Go RE2 are different dialects, so to
 *            avoid false positives this rule flags ONLY patterns that fail to compile as a JS
 *            `RegExp` (clearly malformed — unbalanced brackets/quantifiers). Patterns that are
 *            valid JS but use RE2-only or JS-only constructs are NOT flagged.
 *   - HF602: post-serve actions are registered at Hoverfly runtime and are unknowable from the
 *            file, so the catalog scopes this to a USER-configured allowlist. The allowlist is
 *            read from {@link RuleContext.settings}.registeredActions, threaded through the
 *            service. With no settings, HF602 never fires — matching the catalog ("only when
 *            the setting is non-empty").
 */

import type { ASTNode } from "vscode-json-languageservice";
import type { Diagnostic } from "vscode-languageserver-types";

import { makeDiagnostic } from "../diagnostics.js";
import type { RuleContext, SemanticRule } from "../types.js";

/** Whether a string is a syntactically-valid JS regular expression (HF601 conservative check). */
function isValidJsRegex(pattern: string): boolean {
  try {
    // eslint-disable-next-line no-new
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

/** First string property value for `key` on an object node, with its node. */
function stringPropValue(node: ASTNode | undefined, key: string): ASTNode | undefined {
  if (node?.type !== "object") {
    return undefined;
  }
  return node.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

/* --------------------------------------- HF601 ------------------------------------------- */

/** Each `globalActions.delays[].urlPattern` that is not a valid (JS) regex. */
function hf601(context: RuleContext): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const delay of context.model.globalActions.delays) {
    const { urlPatternNode, urlPattern } = delay;
    if (!urlPatternNode || urlPattern === undefined) {
      continue;
    }
    if (!isValidJsRegex(urlPattern)) {
      out.push(makeDiagnostic(context.textDocument, "HF601", urlPatternNode));
    }
  }
  return out;
}

/* --------------------------------------- HF602 ------------------------------------------- */

/** Each `response.postServeAction` not present in the configured `registeredActions` allowlist. */
function hf602(context: RuleContext): Diagnostic[] {
  const allow = context.settings.registeredActions;
  if (!allow || allow.length === 0) {
    return [];
  }
  const allowed = new Set(allow);

  const out: Diagnostic[] = [];
  for (const pair of context.model.pairs) {
    const valueNode = stringPropValue(pair.response.node, "postServeAction");
    if (valueNode?.type !== "string") {
      continue;
    }
    const action = valueNode.value;
    if (action.length === 0 || allowed.has(action)) {
      continue;
    }
    out.push(makeDiagnostic(context.textDocument, "HF602", valueNode, { a: action }));
  }
  return out;
}

/* ----------------------------------------- rules ----------------------------------------- */

/** HF601 — invalid globalActions delay urlPattern. */
export const hf601DelayPatternRule: SemanticRule = {
  codes: ["HF601"],
  run: hf601,
};

/** HF602 — postServeAction not in the configured allowlist. */
export const hf602PostServeActionRule: SemanticRule = {
  codes: ["HF602"],
  run: hf602,
};

/** All HF6xx rules. The integrator spreads this into `rules/index.ts#ALL_RULES`. */
export const HF6XX_RULES: readonly SemanticRule[] = [
  hf601DelayPatternRule,
  hf602PostServeActionRule,
];
