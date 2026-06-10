/**
 * Markdown renderers for matcher completion items and hover content. ALL Hoverfly facts —
 * names, accepted value types, config support, `doMatch` behaviour, panic warnings, docs links
 * — are sourced from {@link MATCHER_SPECS} / {@link MATCHER_PANIC_NOTES} in the registry. This
 * module only formats that data; it hardcodes no matcher facts of its own (house rule).
 */

import { MATCHER_PANIC_NOTES, type MatcherSpec, type MatcherValueType } from "../registry/index.js";

/** Human label for a matcher's accepted JSON value types (registry data, formatted). */
function valueTypeLine(spec: MatcherSpec): string {
  const types: readonly MatcherValueType[] = spec.valueTypes;
  const joined = types.map((t) => `\`${t}\``).join(" | ");
  return `**Value type:** ${joined}`;
}

/** A one-line config-support note derived from the spec's `supportsConfig`/`configKeys`. */
function configLine(spec: MatcherSpec): string {
  if (spec.supportsConfig) {
    const keys = (spec.configKeys ?? []).map((k) => `\`${k}\``).join(", ");
    return `**Config:** supported — booleans ${keys}.`;
  }
  return "**Config:** not supported (a `config` key here panics Hoverfly).";
}

/**
 * Panic / footgun warnings relevant to a given matcher, pulled verbatim from
 * {@link MATCHER_PANIC_NOTES}. Returned as markdown lines (already prefixed with a warning sign).
 */
function panicWarnings(spec: MatcherSpec): string[] {
  const warnings: string[] = [];
  // Every matcher: a wrong-cased / unknown name panics.
  warnings.push(`⚠️ ${MATCHER_PANIC_NOTES.unknownMatcher}`);
  if (!spec.supportsConfig) {
    warnings.push(`⚠️ ${MATCHER_PANIC_NOTES.configOnNonArray}`);
  } else {
    warnings.push(`⚠️ ${MATCHER_PANIC_NOTES.nonBoolArrayConfigValue}`);
  }
  if (spec.bodyOnly) {
    warnings.push(`⚠️ ${MATCHER_PANIC_NOTES.formWrongCaseOrPlacement}`);
  }
  return warnings;
}

/**
 * Full markdown documentation for a matcher — used as a completion item's `documentation` and as
 * the hover body. Assembles the registry's `docs` string, the value-type line, the config line,
 * a `doMatch` note, and the relevant panic warnings.
 */
export function matcherMarkdown(spec: MatcherSpec): string {
  const displayName = spec.name === "" ? "(default / empty matcher)" : spec.name;
  const lines: string[] = [
    `### \`${displayName}\` matcher`,
    "",
    spec.docs,
    "",
    valueTypeLine(spec),
    configLine(spec),
  ];
  if (spec.doMatchTransforms) {
    lines.push(
      "**doMatch:** transforms/extracts a value for the next chained matcher (not a re-test of the same input).",
    );
  } else {
    lines.push("**doMatch:** AND-semantics — re-tests the same input against the next matcher.");
  }
  const warnings = panicWarnings(spec);
  if (warnings.length > 0) {
    lines.push("", ...warnings);
  }
  return lines.join("\n");
}

/** A short one-line `detail` string for a completion item (shown inline next to the label). */
export function matcherDetail(spec: MatcherSpec): string {
  const valueTypes = spec.valueTypes.join(" | ");
  const suffix = spec.bodyOnly ? " (body only)" : "";
  return `Hoverfly matcher · value: ${valueTypes}${suffix}`;
}
