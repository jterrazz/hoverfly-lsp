/**
 * Authoritative matcher registry data (architect decisions D5 + D8).
 *
 * Transcribed from `research/07-matcher-value-types.md`, which was verified directly
 * against the SpectoLabs/hoverfly Go source on `master` (the matcher registry in
 * `core/matching/matchers/matchers.go`, the engine in `core/matching/field_matcher.go`,
 * and the body/form dispatch in `core/matching/body_formdata_matching.go`).
 *
 * Per D8, this OVERRIDES the docs-derived claims in earlier reports where they conflict:
 * matcher-name lookup is case-INSENSITIVE (the engine lowercases the name before lookup),
 * `form` DOES exist as a body-layer pseudo-matcher (case-SENSITIVE), unknown matcher names
 * PANIC, `config` on any non-`array` matcher PANICs, and non-bool `array` config values
 * PANIC.
 *
 * This module is pure data + types; the HF2xx semantic validators consume it in a later
 * phase. No analysis logic lives here.
 */

const DOCS_BASE = "https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html";

/** The JSON value types a matcher's `value` field may legitimately hold. */
export type MatcherValueType = "array" | "object" | "string";

/**
 * The runtime behaviour when a matcher receives a `value` of the wrong JSON type.
 *
 * - `no-match` — the matcher gracefully returns false (the pair can never match).
 * - `panic`    — Hoverfly crashes at request-matching time (nil func type assertion, etc.).
 * - `vacuous-true` — the matcher silently always matches (logic inversion); only `negate`.
 */
export type WrongTypeBehavior = "no-match" | "panic" | "vacuous-true";

/** The three boolean `config` keys honoured by the `array` matcher. */
export type ArrayConfigKey = "ignoreOccurrences" | "ignoreOrder" | "ignoreUnknown";

export type MatcherSpec = {
  /** Registry key — the exact, case-sensitive canonical spelling Hoverfly stores. */
  name: string;
  /** JSON value types the matcher's `value` field accepts. */
  valueTypes: MatcherValueType[];
  /** Whether the matcher honours a `config` object (only `array` does). */
  supportsConfig: boolean;
  /** When `supportsConfig`, the boolean config keys recognised. */
  configKeys?: ArrayConfigKey[];
  /**
   * Whether this matcher's `MatchValueGenerator` is a non-identity (transforming)
   * generator — i.e. `doMatch` after it extracts/transforms a value for the next link
   * rather than re-testing the same input. True only for jsonpath/xpath/jwt/jwtjsonpath.
   */
  doMatchTransforms: boolean;
  /** Runtime behaviour on a wrong-typed `value`. */
  wrongTypeBehavior: WrongTypeBehavior;
  /** Whether the matcher is valid only on the request `body` (the `form` pseudo-matcher). */
  bodyOnly?: boolean;
  /**
   * Whether the registry lookup for this name is case-sensitive. The registry engine
   * lowercases names (case-INSENSITIVE), so this is `false` for every registered matcher;
   * the `form` pseudo-matcher is dispatched with a literal `==` comparison, so it is the
   * only case-SENSITIVE entry.
   */
  caseSensitiveLookup: boolean;
  /** Short human description plus a docs.hoverfly.io link. */
  docs: string;
};

/**
 * The 14 registry matchers (`""` default, exact, negate, glob, regex, xml, xmltemplated,
 * xpath, json, jsonpartial, jsonpath, jwt, jwtjsonpath, array) PLUS the body-only `form`
 * pseudo-matcher. Total: 15 specs.
 *
 * Spelling traps (report 07 §1): the negate matcher's registry key is `negate` (the Go
 * const is `Negation`); `jsonpartial`/`jsonpath`/`jwtjsonpath`/`xmltemplated` are all
 * single-token, all-lowercase.
 */
export const MATCHER_SPECS: readonly MatcherSpec[] = [
  {
    name: "",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Default matcher (empty string) — behaves as \`exact\`. Non-string value never matches. ${DOCS_BASE}`,
  },
  {
    name: "exact",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Exact string equality. Non-string value never matches. ${DOCS_BASE}`,
  },
  {
    name: "negate",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    // A non-string value makes NegationMatch return true unconditionally (report 07 §3).
    wrongTypeBehavior: "vacuous-true",
    caseSensitiveLookup: false,
    docs: `Matches when the value is NOT equal to the request value. A non-string value matches vacuously (always true) — almost always a mistake. Registry key is \`negate\` (NOT \`negation\`). ${DOCS_BASE}`,
  },
  {
    name: "glob",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Glob (wildcard) match, e.g. \`*.example.com\`. Non-string value never matches. ${DOCS_BASE}`,
  },
  {
    name: "regex",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Regular-expression match. Non-string value never matches; an invalid pattern silently never matches. ${DOCS_BASE}`,
  },
  {
    name: "xml",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Structural XML equality (both sides minified). Value is XML text. Non-string or unparseable XML never matches. ${DOCS_BASE}`,
  },
  {
    name: "xmltemplated",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Templated XML match: leaf tokens \`{{ ignore }}\` and \`{{ regex: PATTERN }}\` are honoured; children matched order-independently. Non-string or unparseable XML never matches. ${DOCS_BASE}`,
  },
  {
    name: "xpath",
    valueTypes: ["string"],
    supportsConfig: false,
    // XPathMatchValueGenerator extracts a value for doMatch (report 07 §2b).
    doMatchTransforms: true,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `XPath expression match (ChrisTrenkamp/xsel engine). doMatch chains the XPath result. Non-string value never matches. ${DOCS_BASE}`,
  },
  {
    name: "json",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Deep JSON equality — value is a STRING containing JSON text (not a JSON object literal). Non-string or invalid-JSON never matches. ${DOCS_BASE}`,
  },
  {
    name: "jsonpartial",
    valueTypes: ["string"],
    supportsConfig: false,
    doMatchTransforms: false,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Partial JSON containment — value is a STRING of JSON text representing the expected subset. Registry key is single-token lowercase \`jsonpartial\`. ${DOCS_BASE}`,
  },
  {
    name: "jsonpath",
    valueTypes: ["string"],
    supportsConfig: false,
    // JsonPathMatcherValueGenerator extracts the query result for doMatch (report 07 §2b).
    doMatchTransforms: true,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `JSONPath query match (kubectl dialect: k8s.io/client-go/util/jsonpath, NOT Jayway). doMatch chains the query result. Non-string value never matches. ${DOCS_BASE}`,
  },
  {
    name: "jwt",
    valueTypes: ["string"],
    supportsConfig: false,
    // JwtMatchValueGenerator feeds the decoded JWT composite onward (report 07 §2b).
    doMatchTransforms: true,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `JWT match — value is a STRING of JSON text describing the expected {"header":..,"payload":..} subset (same rules as jsonpartial). doMatch chains the decoded composite. ${DOCS_BASE}`,
  },
  {
    name: "jwtjsonpath",
    valueTypes: ["string"],
    supportsConfig: false,
    // JwtJsonPathMatchValueGenerator feeds the JSONPath result onward (report 07 §2b).
    doMatchTransforms: true,
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `JSONPath over a decoded JWT composite (PR #1210, merged 2025-12-12). Value is a NON-EMPTY JSONPath string (empty string never matches); defaults to the \`$.payload\` scope. ${DOCS_BASE}`,
  },
  {
    name: "array",
    valueTypes: ["array"],
    supportsConfig: true,
    configKeys: ["ignoreUnknown", "ignoreOrder", "ignoreOccurrences"],
    doMatchTransforms: false,
    // GetStringArray rejects non-slices -> no match; a non-bool config value PANICs.
    wrongTypeBehavior: "no-match",
    caseSensitiveLookup: false,
    docs: `Array match — value MUST be a JSON array (a plain string is rejected; the ';'-split applies to the incoming request value, NOT the matcher value). The ONLY matcher that accepts \`config\` (booleans \`ignoreUnknown\`/\`ignoreOrder\`/\`ignoreOccurrences\`). ${DOCS_BASE}`,
  },
  {
    name: "form",
    valueTypes: ["object"],
    supportsConfig: false,
    doMatchTransforms: false,
    // Non-object value falls back to a raw value (likely no match); wrong placement PANICs.
    wrongTypeBehavior: "no-match",
    bodyOnly: true,
    // BodyMatching / getValueFromMatcherView use a literal == comparison, not lowercasing.
    caseSensitiveLookup: true,
    docs: `Body-layer pseudo-matcher (NOT in the registry). Value is an object {fieldName: [matchers...]}. Valid ONLY on the request \`body\` and ONLY as a top-level matcher; the literal name \`form\` is case-SENSITIVE (\`Form\`/\`FORM\` or non-body placement is not recognised). ${DOCS_BASE}`,
  },
];

/** The 14 registry matcher names (every spec except the `form` pseudo-matcher). */
export const REGISTRY_MATCHER_NAMES: readonly string[] = MATCHER_SPECS.filter(
  (spec) => !spec.bodyOnly,
).map((spec) => spec.name);

/**
 * The four matchers whose `doMatch` transforms/extracts a value for the next link
 * (`doMatchTransforms: true`). After any other matcher, `doMatch` re-tests the same input
 * (AND-semantics).
 */
export const TRANSFORMING_MATCHER_NAMES: readonly string[] = MATCHER_SPECS.filter(
  (spec) => spec.doMatchTransforms,
).map((spec) => spec.name);

/**
 * Known runtime PANIC paths (architect decision D8, report 07 §2c/§2d/§3). The HF2xx
 * validators surface each of these as an error-level diagnostic — these are hard crashes,
 * not graceful no-matches.
 */
export const MATCHER_PANIC_NOTES = {
  /** An unknown/misspelled matcher name -> nil func type assertion -> PANIC. */
  unknownMatcher:
    "Unknown matcher name: Hoverfly does a nil func type assertion and CRASHES (panic) at request-matching time, not a silent no-match.",
  /** A `config` key on any matcher other than `array` -> MatchersWithConfig miss -> PANIC. */
  configOnNonArray:
    "A `config` key on any matcher other than `array` makes Hoverfly PANIC (even `config: {}`, since a decoded empty object is still non-nil).",
  /** A non-boolean `array` config value -> genericValue.(bool) with no ok-guard -> PANIC. */
  nonBoolArrayConfigValue:
    'An `array` config value that is not a JSON boolean (e.g. the string "true" or a number) makes Hoverfly PANIC (genericValue.(bool) has no ok-guard).',
  /** `form` written as `Form`/`FORM`, or `form` outside `body` -> registry miss -> PANIC. */
  formWrongCaseOrPlacement:
    "`form` is case-SENSITIVE and body-only; `Form`/`FORM`, or `form` on headers/query/path or inside doMatch, falls through to the registry and PANICs.",
} as const;
