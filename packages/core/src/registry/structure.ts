/**
 * Authoritative allowed-keys matrix for every object in a Hoverfly v5 simulation
 * (the "only allow the strict necessary" source of truth).
 *
 * Hand-transcribed from `research/13-field-constraints.md` §1, which is verified against the
 * SpectoLabs/hoverfly Go view structs (`core/handlers/v2/simulation_views{,_v5}.go`) and the
 * embedded `core/handlers/v2/schema.json`, plus a ground-truth run against real Hoverfly
 * v1.12.8 (`PUT /api/v2/simulation`, 2026-06-11).
 *
 * The two enforcement facts that make this matrix the LSP's biggest value-add (report 13 §0):
 *
 *   1. `additionalProperties:false` exists ONLY at the ROOT object — so a typo inside any
 *      sub-object is NOT caught by the schema. The Go layer silently DROPS any key that does
 *      not match a struct field, and the user's data vanishes (the silent-feature-loss class).
 *   2. Go's `encoding/json` matches struct field names CASE-INSENSITIVELY. So `STATUS`,
 *      `BodyFile`, `MATCHER` all bind to the canonical field and are normalized. A key only
 *      "drops" when NO case-folded match exists. This is why the unknown-key rule MUST compare
 *      CASE-FOLDED against the allowed set: a true typo (`staus`) → HF603 (dropped); a case
 *      variant (`bodyfile`) → HF604 (works, non-canonical), never HF603.
 *
 * This module is pure data + types; the HF603/HF604 unknown-key validators (and future
 * completion) consume it. No analysis logic lives here.
 *
 * Per report 13 §6 false-positive guards, the OPEN string-keyed maps are deliberately NOT
 * object kinds here (their keys are user data, never validated): `request.headers`,
 * `request.query`, `response.headers`, `requiresState`, `transitionsState`. The unknown-key
 * rule MUST skip them. See {@link USER_KEYED_MAP_PATHS}.
 */

/**
 * The closed object kinds whose keys come from a fixed Go struct. Each value of
 * {@link STRUCTURE_ALLOWED_KEYS} is keyed by one of these.
 *
 * The ROOT object is intentionally absent: its unknown keys are already an HTTP 400
 * (`additionalProperties:false`) surfaced as HF102, so HF603 skips it to avoid a double
 * diagnostic (report 13 §6).
 */
export type StructureObjectKind =
  | "data"
  | "delaysItem"
  | "delaysLogNormalItem"
  | "fieldMatcher"
  | "globalActions"
  | "literalsItem"
  | "logNormalDelay"
  | "meta"
  | "pair"
  | "request"
  | "response"
  | "variablesItem";

/**
 * Object kind → the EXACT allowed canonical keys (Go json tag), per report 13 §1. The HF603
 * rule compares an object's keys CASE-FOLDED against this set; HF604 fires for a case-only
 * variant of one of these; HF603 fires for anything with no case-fold match.
 *
 * Each entry cites its backing Go struct so the matrix can be re-verified on Hoverfly drift.
 */
export const STRUCTURE_ALLOWED_KEYS: Readonly<Record<StructureObjectKind, readonly string[]>> = {
  /**
   * `DataViewV5` (report 13 §1.2). Unknown key silently dropped (no additionalProperties:false).
   * High-risk typos: `pair`, `globalAction`, `literal`, `variable`.
   */
  data: ["pairs", "globalActions", "literals", "variables"],

  /**
   * `RequestMatcherResponsePairViewV5` (report 13 §1.3). The `request`/`response` keys are
   * schema-required (missing → 400). High-risk typos: `requests`, `responses`, `req`, `res`, `label`.
   */
  pair: ["request", "response", "labels"],

  /**
   * `RequestMatcherViewV5` (report 13 §1.4). The `method` key is in the Go struct but ABSENT
   * from the official schema's `request` def (D5) — it imports clean and MUST NOT be flagged, so
   * it is listed here and HF603 never treats it as unknown. The `query` key must be an OBJECT (a
   * legacy string query is a 400). High-risk typos: `header`, `queries`, `requireState`.
   */
  request: ["path", "method", "destination", "scheme", "body", "headers", "query", "requiresState"],

  /**
   * `MatcherViewV5` field-matcher (report 13 §1.5). All four optional. The `doMatch` key must be
   * an OBJECT (array → HF102 / 400). High-risk typos: `matchers`/`match`/`machter`/`mathcer`,
   * `values`/`val`, `configs`/`conf`. Case variants (`Matcher`/`MATCHER`/`domatch`/`Config`) BIND
   * via Go → HF604, never HF603.
   */
  fieldMatcher: ["matcher", "value", "config", "doMatch"],

  /**
   * `ResponseDetailsViewV5` (report 13 §1.9). Highest-impact silent-drop typos: `transitionState`
   * (missing s), `removeState` (missing s), `statusCode`, `encodeBody`, `postServerAction`,
   * `header` (singular). Case variants (`bodyfile`, `lognormalDelay`) BIND → HF604.
   */
  response: [
    "status",
    "body",
    "bodyFile",
    "encodedBody",
    "headers",
    "templated",
    "transitionsState",
    "removesState",
    "fixedDelay",
    "logNormalDelay",
    "postServeAction",
  ],

  /**
   * `LogNormalDelayOptions` at the response level (report 13 §1.11). Unlike the globalActions
   * `delaysLogNormal[]` items, this def has NO `httpMethod`/`urlPattern` — these four int fields
   * are the entire allowed set. Typos: `medain`, `average`.
   */
  logNormalDelay: ["min", "max", "mean", "median"],

  /**
   * `GlobalActionsView` (report 13 §1.12). Typos: `delay`, `globalDelays`. The `delaysLognormal`
   * spelling is a case variant → HF604.
   */
  globalActions: ["delays", "delaysLogNormal"],

  /**
   * `ResponseDelayView` (report 13 §1.13). The `httpMethod` values are NOT validated (stay
   * permissive). Typos: `delayMs`, `method`, `pattern`, `urlPatter`.
   */
  delaysItem: ["delay", "httpMethod", "urlPattern"],

  /**
   * `ResponseDelayLogNormalView` (report 13 §1.14). The four int fields PLUS the method/url
   * filter — distinct from the response-level `logNormalDelay`.
   */
  delaysLogNormalItem: ["min", "max", "mean", "median", "httpMethod", "urlPattern"],

  /**
   * `GlobalLiteralViewV5` (report 13 §1.15). Schema `required:[name,value]`. Unknown key dropped
   * (accepted 200). Typo target: `values`.
   */
  literalsItem: ["name", "value"],

  /**
   * `GlobalVariableViewV5` (report 13 §1.16). Schema `required:[name,function]`. Typos:
   * `functions`, `args`/`argument`.
   */
  variablesItem: ["name", "function", "arguments"],

  /**
   * `MetaView` (report 13 §1.17). The `hoverflyVersion`/`timeExported` contents are NOT
   * format-validated (leave un-flagged); only an unknown KEY here is droppable.
   */
  meta: ["schemaVersion", "hoverflyVersion", "timeExported"],
};

/**
 * Documentation pointers (NOT used for unknown-key checking) for the OPEN string-keyed maps
 * whose keys are user data — HF603/HF604 MUST skip these entirely (report 13 §6 guard a):
 *
 *   - `request.headers`     — `map[string][]MatcherViewV5`   (any header name)
 *   - `request.query`       — `QueryMatcherViewV5`           (any query-param name)
 *   - `response.headers`    — `map[string][]string`          (any header name)
 *   - `requiresState`       — `map[string]string`            (user state names)
 *   - `transitionsState`    — `map[string]string`            (user state names)
 *
 * The ROOT object is also skipped (already HF102 via `additionalProperties:false`).
 */
export const USER_KEYED_MAP_PATHS: readonly string[] = [
  "request.headers",
  "request.query",
  "response.headers",
  "requiresState",
  "transitionsState",
];

/**
 * `request.method` is a legal key despite being absent from the official schema's `request`
 * definition (D5 / report 13 §6 guard b). It is already present in {@link STRUCTURE_ALLOWED_KEYS}
 * `request`, but is also named here so the unknown-key rule can assert it is never flagged.
 */
export const SCHEMA_ABSENT_LEGAL_KEYS: Readonly<Record<string, readonly string[]>> = {
  request: ["method"],
};

/**
 * The "did you mean" suggestion threshold for HF603 (report 13 §6): a candidate is offered only
 * when the case-insensitive Levenshtein distance to an allowed key is ≤ this. A key that
 * case-FOLDS exactly to an allowed key is NOT an HF603 candidate (distance 0 but it BINDS) —
 * it is an HF604 case-variant instead.
 */
export const DID_YOU_MEAN_MAX_DISTANCE = 2;
