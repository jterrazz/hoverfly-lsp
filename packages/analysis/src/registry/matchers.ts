// outside: transcribed from research/07, verified against the Hoverfly Go source
// (core/matching/matchers/matchers.go, field_matcher.go, body_formdata_matching.go); per D8 a name
// is looked up case-insensitively, form exists on the body only and case-sensitively, and an
// unknown name, a config on any matcher but array and a non-boolean array config each panic.

const DOCS_BASE = 'https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html';

/** The JSON value types a matcher's `value` field may legitimately hold. */
export type MatcherValueType = 'array' | 'object' | 'string';

/** What a matcher does with a value of the wrong JSON type: never match, panic, or match vacuously (negate alone). */
export type WrongTypeBehavior = 'no-match' | 'panic' | 'vacuous-true';

/** The three boolean `config` keys honoured by the `array` matcher. */
export type ArrayConfigKey = 'ignoreOccurrences' | 'ignoreOrder' | 'ignoreUnknown';

export type MatcherSpec = {
    /** Registry key, the exact, case-sensitive canonical spelling Hoverfly stores. */
    name: string;
    /** JSON value types the matcher's `value` field accepts. */
    valueTypes: MatcherValueType[];
    /** Whether the matcher honours a `config` object (only `array` does). */
    supportsConfig: boolean;
    /** When `supportsConfig`, the boolean config keys recognised. */
    configKeys?: ArrayConfigKey[];
    /** Whether doMatch after this matcher receives an extracted value (jsonpath, xpath, jwt, jwtjsonpath) rather than the same input. */
    doMatchTransforms: boolean;
    /** Runtime behaviour on a wrong-typed `value`. */
    wrongTypeBehavior: WrongTypeBehavior;
    /** Whether the matcher is valid only on the request `body` (the `form` pseudo-matcher). */
    bodyOnly?: boolean;
    /** Whether the name is looked up case-sensitively: form alone, which Hoverfly compares with ==. */
    caseSensitiveLookup: boolean;
    /** Short human description plus a docs.hoverfly.io link. */
    docs: string;
};

// hazard: the negate matcher's key is `negate`; its Go constant is `Negation` (report 07 §1).
/** The 14 registry matchers, the empty default among them, and the body-only form pseudo-matcher. */
export const MATCHER_SPECS: readonly MatcherSpec[] = [
    {
        name: '',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Default matcher (empty string), behaves as \`exact\`. Non-string value never matches. ${DOCS_BASE}`,
    },
    {
        name: 'exact',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Exact string equality. Non-string value never matches. ${DOCS_BASE}`,
    },
    {
        name: 'negate',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        // outside: NegationMatch answers true for any value that is not a string (report 07 §3).
        wrongTypeBehavior: 'vacuous-true',
        caseSensitiveLookup: false,
        docs: `Matches when the value is NOT equal to the request value. A non-string value matches vacuously (always true), almost always a mistake. Registry key is \`negate\` (NOT \`negation\`). ${DOCS_BASE}`,
    },
    {
        name: 'glob',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Glob (wildcard) match, e.g. \`*.example.com\`. Non-string value never matches. ${DOCS_BASE}`,
    },
    {
        name: 'regex',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Regular-expression match. Non-string value never matches; an invalid pattern silently never matches. ${DOCS_BASE}`,
    },
    {
        name: 'xml',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Structural XML equality (both sides minified). Value is XML text. Non-string or unparseable XML never matches. ${DOCS_BASE}`,
    },
    {
        name: 'xmltemplated',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Templated XML match: leaf tokens \`{{ ignore }}\` and \`{{ regex: PATTERN }}\` are honoured; children matched order-independently. Non-string or unparseable XML never matches. ${DOCS_BASE}`,
    },
    {
        name: 'xpath',
        valueTypes: ['string'],
        supportsConfig: false,
        // outside: XPathMatchValueGenerator extracts a value for doMatch (report 07 §2b).
        doMatchTransforms: true,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `XPath expression match (ChrisTrenkamp/xsel engine). doMatch chains the XPath result. Non-string value never matches. ${DOCS_BASE}`,
    },
    {
        name: 'json',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Deep JSON equality, value is a STRING containing JSON text (not a JSON object literal). Non-string or invalid-JSON never matches. ${DOCS_BASE}`,
    },
    {
        name: 'jsonpartial',
        valueTypes: ['string'],
        supportsConfig: false,
        doMatchTransforms: false,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Partial JSON containment, value is a STRING of JSON text representing the expected subset. Registry key is single-token lowercase \`jsonpartial\`. ${DOCS_BASE}`,
    },
    {
        name: 'jsonpath',
        valueTypes: ['string'],
        supportsConfig: false,
        // outside: JsonPathMatcherValueGenerator extracts the query result for doMatch (report 07
        // §2b).
        doMatchTransforms: true,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `JSONPath query match (kubectl dialect: k8s.io/client-go/util/jsonpath, NOT Jayway). doMatch chains the query result. Non-string value never matches. ${DOCS_BASE}`,
    },
    {
        name: 'jwt',
        valueTypes: ['string'],
        supportsConfig: false,
        // outside: JwtMatchValueGenerator hands the decoded JWT on to doMatch (report 07 §2b).
        doMatchTransforms: true,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `JWT match, value is a STRING of JSON text describing the expected {"header":..,"payload":..} subset (same rules as jsonpartial). doMatch chains the decoded composite. ${DOCS_BASE}`,
    },
    {
        name: 'jwtjsonpath',
        valueTypes: ['string'],
        supportsConfig: false,
        // outside: JwtJsonPathMatchValueGenerator hands the JSONPath result on to doMatch (report
        // 07 §2b).
        doMatchTransforms: true,
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `JSONPath over a decoded JWT composite (PR #1210, merged 2025-12-12). Value is a NON-EMPTY JSONPath string (empty string never matches); defaults to the \`$.payload\` scope. ${DOCS_BASE}`,
    },
    {
        name: 'array',
        valueTypes: ['array'],
        supportsConfig: true,
        configKeys: ['ignoreUnknown', 'ignoreOrder', 'ignoreOccurrences'],
        doMatchTransforms: false,
        // outside: GetStringArray refuses a non-slice, so the pair never matches; a non-boolean
        // config value panics.
        wrongTypeBehavior: 'no-match',
        caseSensitiveLookup: false,
        docs: `Array match, value MUST be a JSON array (a plain string is rejected; the ';'-split applies to the incoming request value, NOT the matcher value). The ONLY matcher that accepts \`config\` (booleans \`ignoreUnknown\`/\`ignoreOrder\`/\`ignoreOccurrences\`). ${DOCS_BASE}`,
    },
    {
        name: 'form',
        valueTypes: ['object'],
        supportsConfig: false,
        doMatchTransforms: false,
        // outside: a non-object value falls back to the raw value and rarely matches; a misplaced
        // form panics.
        wrongTypeBehavior: 'no-match',
        bodyOnly: true,
        // outside: BodyMatching compares the name with ==, never lowercased.
        caseSensitiveLookup: true,
        docs: `Body-layer pseudo-matcher (NOT in the registry). Value is an object {fieldName: [matchers...]}. Valid ONLY on the request \`body\` and ONLY as a top-level matcher; the literal name \`form\` is case-SENSITIVE (\`Form\`/\`FORM\` or non-body placement is not recognised). ${DOCS_BASE}`,
    },
];

/** The 14 registry matcher names (every spec except the `form` pseudo-matcher). */
export const REGISTRY_MATCHER_NAMES: readonly string[] = MATCHER_SPECS.filter(
    (spec) => !spec.bodyOnly,
).map((spec) => spec.name);

/** The four matchers whose doMatch extracts a value; after any other, doMatch re-tests the same input. */
export const TRANSFORMING_MATCHER_NAMES: readonly string[] = MATCHER_SPECS.filter(
    (spec) => spec.doMatchTransforms,
).map((spec) => spec.name);

/** The runtime panic paths (decision D8, report 07 §2c, §2d, §3), each an error-level diagnostic. */
export const MATCHER_PANIC_NOTES = {
    /** An unknown/misspelled matcher name -> nil func type assertion -> PANIC. */
    unknownMatcher:
        'Unknown matcher name: Hoverfly does a nil func type assertion and CRASHES (panic) at request-matching time, not a silent no-match.',
    /** A `config` key on any matcher other than `array` -> MatchersWithConfig miss -> PANIC. */
    configOnNonArray:
        'A `config` key on any matcher other than `array` makes Hoverfly PANIC (even `config: {}`, since a decoded empty object is still non-nil).',
    /** A non-boolean `array` config value -> genericValue.(bool) with no ok-guard -> PANIC. */
    nonBoolArrayConfigValue:
        'An `array` config value that is not a JSON boolean (e.g. the string "true" or a number) makes Hoverfly PANIC (genericValue.(bool) has no ok-guard).',
    /** `form` written as `Form`/`FORM`, or `form` outside `body` -> registry miss -> PANIC. */
    formWrongCaseOrPlacement:
        '`form` is case-SENSITIVE and body-only; `Form`/`FORM`, or `form` on headers/query/path or inside doMatch, falls through to the registry and PANICs.',
} as const;
