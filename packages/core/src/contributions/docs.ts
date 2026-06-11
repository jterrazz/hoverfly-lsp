/**
 * Markdown renderers for matcher completion items and hover content. ALL Hoverfly facts —
 * names, accepted value types, config support, `doMatch` behaviour, docs links — are sourced
 * from {@link MATCHER_SPECS} in the registry. This module only formats that data; it hardcodes
 * no matcher facts of its own (house rule).
 *
 * Content policy (issue: hover noise): a matcher hover/completion describes THAT matcher only —
 * its semantics, value type, `doMatch` behaviour, config support, docs link, and notes specific
 * to the matcher in hand. It does NOT append the generic "unknown matcher name panics" or
 * "config on a non-array matcher panics" warnings: those describe MISUSE the user is not
 * committing while hovering a valid matcher, and the HF2xx diagnostics (HF201 unknown name,
 * HF204 config misuse) own that messaging at the point the mistake is actually made. The only
 * notes surfaced here are intrinsic to the hovered matcher: array's config keys (ON array),
 * form's body-only + case-sensitivity (ON form), and negate's vacuous-true footgun (ON negate).
 */

import { type MatcherSpec, type MatcherValueType } from "../registry/index.js";

/** Human label for a matcher's accepted JSON value types (registry data, formatted). */
function valueTypeLine(spec: MatcherSpec): string {
  const types: readonly MatcherValueType[] = spec.valueTypes;
  const joined = types.map((t) => `\`${t}\``).join(" | ");
  return `**Value type:** ${joined}`;
}

/**
 * A one-line config-support note derived from the spec's `supportsConfig`/`configKeys`. Neutral
 * wording: the panic phrasing for misusing `config` belongs to HF204, not to a valid matcher's
 * own documentation.
 */
function configLine(spec: MatcherSpec): string {
  if (spec.supportsConfig) {
    const keys = (spec.configKeys ?? []).map((k) => `\`${k}\``).join(", ");
    return `**Config:** supported — booleans ${keys}.`;
  }
  return "**Config:** not supported.";
}

/**
 * Notes intrinsic to THIS matcher — surfaced only when they describe the hovered matcher's own
 * behaviour, never the generic any-matcher panics. Returned as markdown lines.
 *
 *   - `array`  — a non-boolean config value is a footgun (config keys ON array).
 *   - `form`   — body-only placement + case-sensitivity (semantics OF form).
 *   - `negate` — a non-string value matches vacuously (footgun OF negate).
 */
function matcherSpecificNotes(spec: MatcherSpec): string[] {
  const notes: string[] = [];
  if (spec.supportsConfig) {
    notes.push(
      '⚠️ Each `config` value must be a JSON boolean — a string like `"true"` or a number is a mistake.',
    );
  }
  if (spec.bodyOnly) {
    notes.push(
      "⚠️ Valid ONLY on the request `body`, only as a top-level matcher, and case-SENSITIVE (`form`, not `Form`/`FORM`).",
    );
  }
  if (spec.wrongTypeBehavior === "vacuous-true") {
    notes.push("⚠️ A non-string value matches vacuously (always true) — almost always a mistake.");
  }
  return notes;
}

/**
 * Full markdown documentation for a matcher — used as a completion item's `documentation` and as
 * the hover body. Assembles the registry's `docs` string, the value-type line, the config line,
 * a `doMatch` note, and any matcher-specific notes (no generic panic warnings).
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
  const notes = matcherSpecificNotes(spec);
  if (notes.length > 0) {
    lines.push("", ...notes);
  }
  return lines.join("\n");
}

/** A short one-line `detail` string for a completion item (shown inline next to the label). */
export function matcherDetail(spec: MatcherSpec): string {
  const valueTypes = spec.valueTypes.join(" | ");
  const suffix = spec.bodyOnly ? " (body only)" : "";
  return `Hoverfly matcher · value: ${valueTypes}${suffix}`;
}
