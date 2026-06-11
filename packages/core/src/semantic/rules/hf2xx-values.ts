/**
 * HF215 / HF216 — well-known-VALUE did-you-mean hints for `request.method` and `request.scheme`.
 *
 * Both fields are OPEN sets that Hoverfly compares VERBATIM and NEVER validates at import
 * (research/13 §3.1/§3.2, verified T19: `method:"GETT"`, `scheme:"ftp"` both import 200; a live
 * v1.12.8 run of `method:"GT"` / `scheme:"htttp"` returns HTTP 200, stored verbatim). The
 * zero-false-positive policy is therefore LAW here:
 *
 *   HF215 (H)  a `method` value that is a NEAR-MISS (case-insensitive Levenshtein ≤
 *              {@link VALUE_DID_YOU_MEAN_MAX_DISTANCE}) of a standard {@link HTTP_METHODS} verb but is NOT
 *              itself a standard verb — i.e. a typo (`GT`→GET, `POSTT`→POST). A value that is far
 *              from every standard verb (`PURGE`, `PROPFIND`, a bespoke verb) is a plausible custom
 *              method and stays SILENT.
 *   HF216 (H)  the same, for `scheme` against {@link URI_SCHEMES} (`htttp`→http). A custom scheme
 *              (`ftp`, …) stays silent.
 *
 * Gate (both): the field is `method`/`scheme` directly under `request` (NOT a header/query map, NOT
 * a nested `doMatch` chain — those are not method/scheme enums), the matcher is `exact` or absent
 * (default-exact), and the value is a non-empty string. A `glob`/`regex`/etc. value is a PATTERN,
 * never an enum, so neither hint applies. NEVER error/warning — only Hint, only on a typo.
 *
 * The standard value sets live in `registry/http.ts` (IANA citation); the Levenshtein machinery is
 * shared with HF603 via `../levenshtein.js`. Nothing about the value domains is hardcoded here.
 */

import type { Diagnostic } from "vscode-languageserver-types";

import {
  HTTP_METHODS,
  URI_SCHEMES,
  VALUE_DID_YOU_MEAN_MAX_DISTANCE,
} from "../../registry/index.js";
import type { DiagnosticCode } from "../catalog.js";
import { makeDiagnostic } from "../diagnostics.js";
import { nearestWithin } from "../levenshtein.js";
import type { MatcherModel, RuleContext, SemanticRule } from "../types.js";

/** A field's well-known-value contract: which code fires and against which standard set. */
interface ValueDomain {
  readonly code: DiagnosticCode;
  readonly standard: readonly string[];
}

/** Only these two top-level request fields carry a well-known-value enum. */
const VALUE_DOMAINS: Readonly<Record<string, ValueDomain>> = {
  method: { code: "HF215", standard: HTTP_METHODS },
  scheme: { code: "HF216", standard: URI_SCHEMES },
};

/** Whether the matcher is `exact` or absent/empty (default-exact) — the only enum-shaped matchers. */
function isExactOrDefault(matcher: MatcherModel): boolean {
  const name = matcher.matcherName;
  return name === undefined || name === "" || name.toLowerCase() === "exact";
}

/**
 * Emit the did-you-mean hint for one direct method/scheme matcher, if its value is a near-miss
 * typo of a standard value (and not itself a standard value). Defensive: a non-string / empty /
 * non-exact / exactly-standard value produces nothing.
 */
function checkValue(
  context: RuleContext,
  matcher: MatcherModel,
  domain: ValueDomain,
  diagnostics: Diagnostic[],
): void {
  if (!isExactOrDefault(matcher)) {
    return; // A pattern matcher (glob/regex/…) value is not an enum.
  }
  const valueNode = matcher.valueNode;
  if (valueNode?.type !== "string" || valueNode.value === "") {
    return; // Wrong type → HF203; empty → HF211. Never our concern.
  }
  const value = valueNode.value;
  // Already a standard value (any case) → never a typo. Methods compare case-sensitively at runtime,
  // But a case-variant of a real verb is not the typo class HF215 targets — so we fold case here.
  const lower = value.toLowerCase();
  if (domain.standard.some((candidate) => candidate.toLowerCase() === lower)) {
    return;
  }
  const suggestion = nearestWithin(value, domain.standard, VALUE_DID_YOU_MEAN_MAX_DISTANCE);
  if (suggestion === undefined) {
    return; // Far from every standard value → a plausible custom value → stay SILENT.
  }
  diagnostics.push(
    makeDiagnostic(context.textDocument, domain.code, valueNode, { value, suggestion }),
  );
}

/**
 * The HF215/HF216 rule: one pass over the direct `method`/`scheme` matchers of every request,
 * emitting a Hint only for a near-miss typo. Never throws.
 */
export const methodSchemeValueRule: SemanticRule = {
  codes: ["HF215", "HF216"],
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    for (const pair of context.model.pairs) {
      for (const field of pair.request.fields) {
        // Only the top-level request field (not a header/query map entry) carries a value enum.
        if (field.container !== "request") {
          continue;
        }
        const domain = VALUE_DOMAINS[field.fieldName];
        if (!domain) {
          continue;
        }
        // Direct matchers only — a nested doMatch chain is not a method/scheme enum.
        for (const matcher of field.matchers) {
          checkValue(context, matcher, domain, diagnostics);
        }
      }
    }
    return diagnostics;
  },
};

/** All HF2xx value-domain rules. The integrator spreads this into `ALL_RULES`. */
export const HF2XX_VALUE_RULES: readonly SemanticRule[] = [methodSchemeValueRule];
