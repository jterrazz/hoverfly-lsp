/**
 * Shared Go-RE2 regex validator.
 *
 * Hoverfly compiles every regex with Go's stdlib `regexp` package, which is an **RE2** engine
 * (`regexp.MatchString`). RE2 is NOT JavaScript's `RegExp`: it rejects lookahead/lookbehind and
 * backreferences (which JS accepts) and accepts Python-style named groups `(?P<name>…)` (which JS
 * rejects). Validating a Hoverfly pattern with `new RegExp()` is therefore unsound in BOTH
 * directions and would emit false positives on perfectly valid Hoverfly patterns
 * (research/14 §3.1).
 *
 * We use {@link RE2JS} (`le0pard/re2js`, the pure-JS port of Google's RE2J) — it IS the same
 * grammar Go uses, so `RE2JS.compile(pattern)` throws iff RE2 would reject the pattern. Pure JS,
 * zero native build deps (D6/D7).
 *
 * Two call sites share this one validator (research/14 §3.1, §4):
 *   - HF230  — the `regex` matcher value, and each `{{ regex: … }}` leaf inside `xmltemplated`.
 *   - HF601  — `globalActions.delays[].urlPattern` / `delaysLogNormal[].urlPattern`.
 */

import { RE2JS } from "re2js";

/**
 * Whether `pattern` compiles under Go's RE2 engine (i.e. Hoverfly would accept it). Returns
 * `false` for any pattern RE2 rejects; never throws.
 *
 * Note: where `re2js` is more permissive than Go's `regexp` (e.g. a construct re2js accepts that
 * Go rejects) this yields a false NEGATIVE (a miss), never a false positive — the honest
 * trade-off per research/14 §3.1.
 */
export function isValidRe2(pattern: string): boolean {
  try {
    RE2JS.compile(pattern);
    return true;
  } catch {
    return false;
  }
}
