# 13 — Whole-Structure Field-Constraint Matrix (strict-validation source of truth)

**Goal:** validate the ENTIRE simulation JSON key-by-key, "only allow the strict necessary",
catching what HF101–HF602 currently miss. This file is the authoritative input a future
rule-implementation team codes against. **No existing code (HF101–HF602) is changed here**;
every proposal in §6 is ADDITIVE and continues each family's numbering.

**Sources cited inline.** Go-struct truth = `core/handlers/v2/simulation_views{,_v5}.go`
(report 02 §1). Embedded schema = `core/handlers/v2/schema.json` (report 02 §2, VERBATIM).
Matcher engine = report 07. Templating = report 08. Ground-truth (real Hoverfly v1.12.8,
`PUT /api/v2/simulation`) = report 12 + the NEW experiments in §4 below (2026-06-11).

---

## 0. The two enforcement layers (this is the spine of the whole report)

Hoverfly applies, in order, **three** gates on import. Knowing which gate a defect hits tells you
the LSP severity:

1. **Go `json.Unmarshal` into the typed view structs** (`SimulationViewV5`). This runs BEFORE schema
   validation for any _strongly-typed_ field (e.g. `removesState []string`). A type that cannot
   unmarshal into the Go type is rejected here with a `json: cannot unmarshal …` 400 (see T10, §4).
   **Crucially, Go's `encoding/json` matches struct field names CASE-INSENSITIVELY** (documented Go
   behavior; verified T6/T1, §4) — so `STATUS`, `BodyFile`, `MATCHER` all bind to the canonical field.
   Keys that do NOT case-insensitively match any field are **silently dropped** (verified T12, §4).
2. **`gojsonschema` validation against `schema.json`** (report 02 §2). `additionalProperties:false`
   exists **only at the root object** — so a top-level typo (`dataX`) is a 400 (T17), but a typo
   inside `data`/`request`/`response`/`field-matchers`/`meta`/`literals`/`variables` is NOT caught by
   the schema (no `additionalProperties:false` on sub-objects). The schema DOES enforce: required
   keys, value JSON-types for typed leaves, array-vs-object shapes, and `requiresState`/
   `transitionsState` string values.
3. **Semantic/import validation** (`simulation_views_validation.go`, `getVariables`,
   post-serve-action registry): emits `warnings[]` (body+bodyFile, content-length) or hard 500s
   (unknown `variables[].function`, unregistered `postServeAction`, lognormal min>max).

**The single biggest LSP value-add is layer-2's blind spot:** unknown keys inside sub-objects.
Go's case-insensitivity makes this subtle — only a _true_ typo (no case-folded match) is silently
dropped; a case variant is silently _accepted and normalized_. Both deserve a diagnostic (drop = the
user's data vanishes; case variant = non-canonical but works → hint).

---

## 1. ALLOWED-KEYS MATRIX

For each object: the EXACT allowed keys (Go json tag), the JSON type, required?, and what each gate
does with a stray key. "Silently dropped (case-insensitive)" = unknown key NOT matching any field
even case-folded → Go drops it, schema doesn't catch it (no `additionalProperties:false`).

### 1.1 Root object — `SimulationViewV5` (report 02 §1.1, schema §2 root)

| Key    | Type   | Required | Notes                         |
| ------ | ------ | -------- | ----------------------------- |
| `data` | object | **yes**  | schema `required:[data,meta]` |
| `meta` | object | **yes**  |                               |

**Unknown root key → HTTP 400** (`Additional property X is not allowed` — root has
`additionalProperties:false`). Verified T17 §4. This is the ONLY object that rejects unknowns at the
schema layer. Already covered by HF102 passthrough.

### 1.2 `data` — `DataViewV5` (report 02 §1.1)

| Key             | Type   | Required | Go tag                |
| --------------- | ------ | -------- | --------------------- |
| `pairs`         | array  | no       | `pairs`               |
| `globalActions` | object | no       | `globalActions`       |
| `literals`      | array  | no       | `literals,omitempty`  |
| `variables`     | array  | no       | `variables,omitempty` |

Unknown key inside `data` → **silently dropped** (no `additionalProperties:false`). High-risk typos:
`pair`, `globalAction`, `literal`, `variable`, `Pairs` (case variant → accepted). LSP candidate.

### 1.3 `data.pairs[]` item — `RequestMatcherResponsePairViewV5` (report 02 §1.3; schema `request-response-pair`)

| Key        | Type            | Required | Go tag             |
| ---------- | --------------- | -------- | ------------------ |
| `request`  | object          | **yes**  | `request`          |
| `response` | object          | **yes**  | `response`         |
| `labels`   | array of string | no       | `labels,omitempty` |

`request`/`response` are schema-`required` → missing → 400 (T16 §4). Unknown key → silently dropped.
High-risk typos: `requests`, `responses`, `req`, `res`, `label`.

### 1.4 `request` — `RequestMatcherViewV5` (report 02 §1.3; schema `request`)

| Key             | Type                             | Required | Go tag                      |
| --------------- | -------------------------------- | -------- | --------------------------- |
| `path`          | array of field-matcher           | no       | `path,omitempty`            |
| `method`        | array of field-matcher           | no       | `method,omitempty` †        |
| `destination`   | array of field-matcher           | no       | `destination,omitempty`     |
| `scheme`        | array of field-matcher           | no       | `scheme,omitempty`          |
| `body`          | array of field-matcher           | no       | `body,omitempty`            |
| `headers`       | object → arrays of field-matcher | no       | `headers,omitempty`         |
| `query`         | object → arrays of field-matcher | no       | `query,omitempty` (POINTER) |
| `requiresState` | object → string values           | no       | `requiresState,omitempty`   |

† **`method` is present in the Go struct but ABSENT from the official schema's `request` definition**
(report 02 §2 / D5). It imports clean (Go unmarshal + schema permits because sub-objects don't set
`additionalProperties:false`). **Do NOT flag `method`.** (Already a D5 exception.)

Unknown key → silently dropped. High-risk typos: `header` (→ singular, dropped — request won't match
on that header), `queries`, `requireState`/`requiresStates`, `pathh`, `bodyMatchers`. **`query` must
be an OBJECT** — a legacy plain-string query (`"query":"a=1&b=2"`) is **HTTP 400** (`Expected: object,
given: string`; T11 §4). There is NO legacy string form accepted in v5; the v1/v2 string→matcher
conversion happens only during the v1/v2→v5 _upgrade_ path (report 02 §5.2), never on a v5 doc.

### 1.5 field-matcher object — `MatcherViewV5` (report 02 §1.3; schema `field-matchers`)

| Key       | Type   | Required | Go tag                                     |
| --------- | ------ | -------- | ------------------------------------------ |
| `matcher` | string | no\*     | `matcher`                                  |
| `value`   | any    | no\*     | `value`                                    |
| `config`  | object | no       | `config,omitempty`                         |
| `doMatch` | object | no       | `doMatch,omitempty` (POINTER; self-`$ref`) |

\* Schema marks NEITHER required (report 02 §2 `field-matchers` has no `required`). An **empty `{}`**
imports clean (T3 §4) and behaves as `{matcher:"", value:nil}` = default exact against `nil` → no
match. A **bare `{value:"/a"}`** imports clean (T4 §4) → default exact (matcher `""`). A
**`{matcher:"exact"}` with no value** imports clean (T2 §4) → exact against `nil` interface → never
matches any string. **`doMatch` MUST be an OBJECT, not an array** (D9; array → HF102 / 400). `config`
allowed schema-side on any matcher but PANICs at match-time on non-`array` (HF204).

Unknown key → silently dropped. High-risk typos: **`matchers`/`match`/`matchor`/`mathcer`/`machter`**
(→ matcher defaults to `""`=exact, often not intended), **`values`/`val`**, **`doMatchs`/`domatch`**
(lowercase `domatch` → DROPPED, NOT case-folded to `doMatch`? — Go IS case-insensitive so `domatch`
binds to `DoMatch`; only genuinely different spellings drop), **`configs`/`conf`**.

> **Subtlety to encode:** because Go json is case-insensitive, `Matcher`, `MATCHER`, `domatch`,
> `DoMatch`, `Config`, `Value` ALL bind. A typo only "drops" when no case-fold matches
> (`machter`, `vlaue`, `doMtch`). The "did-you-mean" mechanism (§6) must compare **case-folded**
> against the allowed set to avoid false-flagging a working case variant as unknown — instead emit a
> casing hint for those.

### 1.6 `request.headers` — `map[string][]MatcherViewV5` (schema `request-headers`)

`additionalProperties: {items: field-matchers, type: array}` → ANY header name key; each value MUST
be an **array of field-matcher objects**. A non-array value → 400 (schema). No fixed key set (header
names are user-defined) → no unknown-key check; but value-shape check is a candidate.

### 1.7 `request.query` — `QueryMatcherViewV5 = map[string][]MatcherViewV5` (schema `request-queries`)

Same shape as headers: any query-param key, value = array of field-matchers. **The whole `query`
must be an object** (T11). Per-param value must be an array.

### 1.8 `requiresState` — `map[string]string` (schema `request.requiresState`)

`patternProperties: {".{1,}": {type:string}}` → any non-empty key, **values MUST be strings**.
Non-string value → **HTTP 400** (T9 §4: `Expected: string, given: integer`). Key `sequence:<n>` is a
reserved convention (HF401). No unknown-key concept (keys are user state names).

### 1.9 `response` — `ResponseDetailsViewV5` (report 02 §1.4; schema `response`)

| Key                | Type                     | Required | Go tag                       | Schema leaf type        |
| ------------------ | ------------------------ | -------- | ---------------------------- | ----------------------- |
| `status`           | integer                  | no       | `status` (no omitempty)      | integer                 |
| `body`             | string                   | no       | `body` (no omitempty)        | string                  |
| `bodyFile`         | string                   | no       | `bodyFile,omitempty`         | string                  |
| `encodedBody`      | boolean                  | no       | `encodedBody` (no omitempty) | boolean                 |
| `headers`          | object → array of string | no       | `headers,omitempty`          | (def `headers`)         |
| `templated`        | boolean                  | no       | `templated` (no omitempty)   | boolean                 |
| `transitionsState` | object → string          | no       | `transitionsState,omitempty` | patternProps string     |
| `removesState`     | array of string          | no       | `removesState,omitempty`     | `array` (no item type!) |
| `fixedDelay`       | integer                  | no       | `fixedDelay,omitempty`       | integer                 |
| `logNormalDelay`   | object                   | no       | `logNormalDelay,omitempty`   | (4 int props)           |
| `postServeAction`  | string                   | no       | `postServeAction,omitempty`  | string                  |

Unknown key → **silently dropped** (verified T12: `transitionState`, `removeState` typos vanish).
**Highest-impact typo targets** (silent feature loss): `transitionState` (missing `s`),
`removeState` (missing `s`), `bodyfile` (case → binds via Go! T1), `delay`/`fixedDelays`,
`logNormal`/`lognormalDelay` (case → binds), `header` (singular), `statusCode`, `encodeBody`,
`postServerAction`/`postServeActions`. **`removesState` entries MUST be strings** — a non-string
entry is a **Go-unmarshal 400** (`cannot unmarshal number into …removesState of type string`; T10
§4) — note the schema alone says only `type:array` (no item type), so this is enforced by the Go
_typed slice_, with a different (uglier) error message than the gojsonschema ones.

### 1.10 `response.headers` — `map[string][]string` (schema `headers`)

`additionalProperties:{items:{type:string}, type:array}` → any header name; value **MUST be an array
of strings**. A **plain string value → HTTP 400** (T5 §4: `Expected: array, given: string`). This is
a frequent authoring mistake worth its own clear diagnostic (the raw schema message is fine but a
targeted HF code reads better and can offer a wrap-in-array fix).

### 1.11 `response.logNormalDelay` — `LogNormalDelayOptions` (report 02 §1.4)

| Key      | Type    | Notes |
| -------- | ------- | ----- |
| `min`    | integer |       |
| `max`    | integer |       |
| `mean`   | integer |       |
| `median` | integer |       |

Schema leaf types int. Constraint relations enforced at import (HARD 500, min>max etc.) — HF307
covers the relations. Unknown key (e.g. `medain`, `average`) → silently dropped. **Note the
response-level `logNormalDelay` schema def has NO `httpMethod`/`urlPattern`** (unlike
`delaysLogNormal`); those four int fields are the entire allowed set.

### 1.12 `data.globalActions` — `GlobalActionsView` (report 02 §1.2)

| Key               | Type  | Go tag            |
| ----------------- | ----- | ----------------- |
| `delays`          | array | `delays`          |
| `delaysLogNormal` | array | `delaysLogNormal` |

Unknown key → silently dropped. Typos: `delay`, `delaysLognormal` (case → binds), `globalDelays`.

### 1.13 `globalActions.delays[]` — `ResponseDelayView` (schema `delay`)

| Key          | Type    | Notes                                |
| ------------ | ------- | ------------------------------------ |
| `delay`      | integer | fixed delay in **ms**                |
| `httpMethod` | string  | optional method FILTER (empty = all) |
| `urlPattern` | string  | Go RE2 regex (HF601)                 |

`httpMethod=FOO` imports clean (T20 §4) — **method values NOT validated here either; stay permissive.**
Empty `httpMethod` = applies to all methods. Unknown key typos: `delayMs`, `method`, `pattern`,
`urlPatter`.

### 1.14 `globalActions.delaysLogNormal[]` — `ResponseDelayLogNormalView` (schema `delay-log-normal`)

| Key          | Type    | Notes                |
| ------------ | ------- | -------------------- |
| `min`        | integer |                      |
| `max`        | integer |                      |
| `mean`       | integer |                      |
| `median`     | integer |                      |
| `httpMethod` | string  | optional filter      |
| `urlPattern` | string  | Go RE2 regex (HF601) |

Unknown key → silently dropped. (Relation constraints `min<max` here are NOT validated the same way
as response.logNormalDelay — verify if extending HF307; out of scope for this matrix beyond noting it.)

### 1.15 `data.literals[]` — `GlobalLiteralViewV5` (schema `literals`, `required:[name,value]`)

| Key     | Type   | Required |
| ------- | ------ | -------- |
| `name`  | string | **yes**  |
| `value` | any    | **yes**  |

Missing `value` → **400** (T14 §4: `value is required`). Unknown key (`extra`) → **silently dropped /
accepted 200** (T22 §4). `name` charset: used as `{{Literals.<name>}}` — see §3.10.

### 1.16 `data.variables[]` — `GlobalVariableViewV5` (schema `variables`, `required:[name,function]`)

| Key         | Type   | Required |
| ----------- | ------ | -------- |
| `name`      | string | **yes**  |
| `function`  | string | **yes**  |
| `arguments` | array  | no       |

Missing `function` → **400** (T15 §4: `function is required`). **Unknown/unsupported `function` →
HARD 500** (`function X not supported for custom variable`; T7/T13 §4). Arity mismatch → **200, no
error** (variable silently dropped at render; T8/T21 §4). `name` referenced as `{{Vars.<name>}}` — §3.10.

### 1.17 `meta` — `MetaView` (report 02 §1.2; schema `meta`, `required:[schemaVersion]`)

| Key               | Type   | Required |
| ----------------- | ------ | -------- |
| `schemaVersion`   | string | **yes**  |
| `hoverflyVersion` | string | no       |
| `timeExported`    | string | no       |

`schemaVersion` covered by HF103/HF104. `hoverflyVersion`/`timeExported` are **free strings, NOT
format-validated at import** (no RFC3339 check on `timeExported`; it's just stamped on export). **Leave
un-flagged** — flagging a hand-edited `timeExported` would be a false positive. Unknown key → dropped.

---

## 2. CO-OCCURRENCE / REQUIREDNESS inside a field-matcher

Already covered: `config`/`doMatch` co-occurrence (HF204 config-on-non-array; HF205/206 config keys/
types; HF210 doMatch chaining). NEW findings on the `value`/`matcher` pair:

| Shape                          | Import   | Runtime behavior                                                         | Proposed     |
| ------------------------------ | -------- | ------------------------------------------------------------------------ | ------------ |
| `{}` (empty)                   | 200 (T3) | matcher=`""`(exact), value=`nil` → ExactMatch(nil,…) → **never matches** | HF212 (W)    |
| `{value:"x"}` (no matcher)     | 200 (T4) | default exact on `"x"` → **valid, intended shorthand**                   | none (legal) |
| `{matcher:"exact"}` (no value) | 200 (T2) | ExactMatch(nil,…) → non-string → **never matches**                       | HF212 (W)    |
| `{matcher:"exact", value:"x"}` | 200      | normal                                                                   | none         |

**Rule:** a field-matcher with a `matcher` (or empty/default) but **no `value`** can never match
(value is `nil`, all string matchers type-assert and fail; `negate` is the lone exception →
vacuous-true, already HF207-adjacent). An **empty `{}`** is the same defect. Both are silent
no-match, never an import error → **warning** (D4: "almost-certainly a mistake; silent no-match").
A bare `{value:…}` is a legal, common shorthand (default exact) → **do NOT flag** (false-positive risk).

> Exception to fold into HF212: when `matcher` is `negate`, a missing/non-string value is
> vacuous-TRUE (always matches), which is the HF207 logic-inversion family — prefer the existing
> HF207 message there over HF212. Implementation: HF212 fires only when the matcher is NOT `negate`
> and NOT `form` (form's value is an object, handled by HF208).

---

## 3. VALUE DOMAINS (what to enforce vs. stay permissive)

### 3.1 `method` value — **STAY PERMISSIVE**

Hoverfly compares the matcher value against the raw request method string; custom verbs are legal and
import clean (T19 §4: `GETT` → 200). Non-standard verbs (`PATCH`, `PROPFIND`, gRPC, custom) are
routinely valid. **Do NOT warn on non-standard methods** — false positives are the credibility killer.
At most an **info/hint** could note an unusual verb, but the recommendation is to **emit nothing**.
(Standard set for hover/completion only: GET, HEAD, POST, PUT, DELETE, CONNECT, OPTIONS, TRACE, PATCH.)

### 3.2 `scheme` value — **STAY PERMISSIVE**

`ftp` imports clean (T19). Hoverfly is a proxy; in practice schemes are `http`/`https` (and `ws`/`wss`
for some setups), but the matcher just string-compares. **Do NOT error.** Optional **info** for a
scheme outside {http, https, ws, wss} is defensible but low value — recommend none in v1.

### 3.3 `destination` value — **STAY PERMISSIVE**

Compared against the request `Host` (host[:port], no scheme/path). `http://host/path` imports clean
(T19). A value containing `://` or a path is _probably_ wrong (it'll never match a bare host), but the
matcher may be `glob`/`regex` where slashes are intentional. **Recommend info-only**, and only for an
`exact`/empty matcher whose value contains `://` (a strong signal the author pasted a full URL). Even
then, weigh false positives — propose as HF213 (I), off by default acceptable.

### 3.4 `status` — covered by HF304 (100–599 warning). Schema = any integer; out-of-range imports clean.

No additional proposal.

### 3.5 `response.headers` values must be arrays-of-strings

Plain string → **400** (T5). Propose **HF308 (E)** with a "wrap in `[ … ]`" fix (clearer than the raw
HF102 passthrough; also lets us suppress the noisy schema message per HF102's suppression note).

### 3.6 `fixedDelay` / `logNormalDelay` — covered (HF306/HF307). The HF307 relation set already mirrors

`ValidateLogNormalDelayOptions` completely (all 4 fields, 8 constraints — see hf3xx.ts header). No gap.

### 3.7 `delays[].httpMethod` — **STAY PERMISSIVE** (T20: `FOO` → 200; empty = all methods). No proposal.

### 3.8 `delays[].delay` units — integer milliseconds; negative is meaningless. \*\*Negative fixedDelay is

HF306; the globalActions `delay` int is not validated for sign by Hoverfly** — a negative delay there
is silently treated as no delay. Low value; propose **HF604 (I)\*\* optional (negative globalActions
`delay`/lognormal field → ignored). Weigh against noise; acceptable to defer.

### 3.9 `meta.hoverflyVersion` / `meta.timeExported` — **NOT validated; leave un-flagged** (§1.17). No proposal.

### 3.10 `literals[].name` / `variables[].name` — templating-reference charset

Referenced as `{{Literals.<name>}}` / `{{Vars.<name>}}` (Handlebars dotted path). A name containing a
**dot, space, or other path-breaking char** makes the reference un-addressable (`{{Vars.my var}}`
won't parse; `{{Vars.a.b}}` resolves `a` then `.b`). Hoverfly imports such a name fine (it's just a map
key), but it can never be referenced. Propose **HF214 (W)**: literal/variable `name` containing a
character outside `[A-Za-z0-9_]` is unreferenceable via templating. (Hoverfly bracket-index syntax
`{{Vars.[weird name]}}` is NOT supported by its path resolver for these roots — treat any non-word
char as a warning. Keep it a warning, not error: the name is still a legal map key, just unusable.)

### 3.11 `variables[].function` UNKNOWN name — **HARD 500 at import** (T7/T13). Currently HF510 only

fires for the 8 raymond _built-ins_. **A function that is neither a Hoverfly helper NOR a built-in is
ALSO rejected** (and even the built-ins are rejected — T13 `each` → 500). So the real Hoverfly rule is:
`function` MUST be one of the **52** Hoverfly helpers, full stop. Propose **HF511 (E)**: unknown
`variables[].function` (not in the 52). HF510 stays as the _specific_ "you used a block built-in"
message (better UX); HF511 is the catch-all for everything else (`notAHelper`, `randomStringX`,
misspellings). Both are errors; HF510 takes precedence when the name is one of the 8 built-ins.

### 3.12 `variables[].arguments` ARITY — **NOT import-enforced; silent drop at render** (T8/T21 → 200).

So arity mismatch never fails import and never crashes; the variable just renders empty. Propose
**HF512 (W)**: `arguments` length ≠ the helper's arity (from `registry/helpers.ts`), for the known-52
functions. Warning, not error (Hoverfly tolerates it; consequence is a silently-empty variable). This
mirrors HF504 (template-side arity) on the `variables[]` side. (Note `requestBody` needs exactly 2;
variadic helpers like `concat` only enforce a minimum.)

### 3.13 `requiresState`/`transitionsState` values must be strings — **400** (T9). Propose **HF404 (E)**:

non-string `requiresState`/`transitionsState` value (clearer targeted message + suppress HF102). The
range is the offending value node.

### 3.14 `removesState` entries must be strings — **400** (Go unmarshal, ugly message; T10). Propose

**HF405 (E)**: non-string `removesState[]` entry — gives a clean message where Hoverfly's raw error is
`json: cannot unmarshal …`. Range = the offending array element.

---

## 4. GROUND-TRUTH OBSERVATIONS (real Hoverfly v1.12.8, 2026-06-11, `PUT /api/v2/simulation`)

New experiments run for THIS report (report 12 covered doMatch/HF2xx/HF3xx/HF50x; these are the
key-structure cases it didn't). Hoverfly started with `-db memory`, stopped after (`pkill`).

| #   | Input                                                                       | HTTP    | Behavior / evidence                                                                                                                 |
| --- | --------------------------------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| T1  | unknown keys `machter`,`unknownReqKey`,`staus`,`bodyfile`,`transitionState` | 200     | typos dropped; **`bodyfile` (case-only diff) BOUND to `BodyFile`** → fired the body+bodyFile WARNING. Proves Go case-insensitivity. |
| T2  | `{matcher:"exact"}` no value                                                | 200     | imports; matches nothing at runtime (value=nil)                                                                                     |
| T3  | empty matcher `{}`                                                          | 200     | imports; default exact vs nil → never matches                                                                                       |
| T4  | bare `{value:"/a"}` no matcher                                              | 200     | imports; **legal default-exact shorthand**                                                                                          |
| T5  | `response.headers` value = plain string                                     | **400** | `Expected: array, given: string`                                                                                                    |
| T6  | ALLCAPS keys `MATCHER/VALUE/STATUS/BODY`                                    | 200     | **all bound + normalized** (stored as `matcher`,`value`,`status`,`body`). Confirms case-insensitive unmarshal.                      |
| T7  | `variables[].function:"notAHelper"`                                         | **500** | `function notAHelper not supported for custom variable v1`                                                                          |
| T8  | `variables` arity mismatch (`randomStringLength` 0 args)                    | 200     | **no import error**; variable silently dropped at render                                                                            |
| T9  | `requiresState`/`transitionsState` non-string values                        | **400** | `Expected: string, given: integer`/`boolean`                                                                                        |
| T10 | `removesState:[5,true]`                                                     | **400** | `json: cannot unmarshal number into …removesState of type string` (Go-layer, not gojsonschema)                                      |
| T11 | `query:"a=1&b=2"` (legacy string)                                           | **400** | `Expected: object, given: string` — **no legacy string query in v5**                                                                |
| T12 | typos `transitionState`,`removeState`                                       | 200     | **silently dropped** — stored response has neither key                                                                              |
| T13 | `variables[].function:"each"` (raymond built-in)                            | **500** | `function each not supported` — built-ins rejected too                                                                              |
| T14 | `literals[]` missing `value`                                                | **400** | `value is required`                                                                                                                 |
| T15 | `variables[]` missing `function`                                            | **400** | `function is required`                                                                                                              |
| T16 | pair missing `request`                                                      | **400** | `request is required`                                                                                                               |
| T17 | top-level unknown key `dataX`                                               | **400** | `Additional property dataX is not allowed` (root only)                                                                              |
| T18 | `config:{}` on `exact`                                                      | 200     | imports (panic is runtime-only — matches report 12)                                                                                 |
| T19 | method `GETT`, scheme `ftp`, destination `http://host/path`                 | 200     | **all permissive** — no value-domain enforcement                                                                                    |
| T20 | `delays[].httpMethod:"FOO"`                                                 | 200     | method-filter values not validated                                                                                                  |
| T21 | `variables` `requestBody` with 1 of 2 args                                  | 200     | arity not import-enforced                                                                                                           |
| T22 | `literals[]` unknown key `extra`                                            | 200     | silently dropped (no additionalProperties:false)                                                                                    |

---

## 5. SUMMARY OF WHAT'S MISSING vs. EXISTING VALIDATORS

- **Unknown-key detection inside sub-objects** is the dominant gap (Hoverfly's schema only guards the
  root). Nothing in HF1xx–HF6xx flags `transitionState`, `staus`, `removeState`, `machter`,
  `delaysLognormal`, etc. — the silent-drop class.
- **`value`/`matcher` co-occurrence** (empty/missing value) — no rule today.
- **`response.headers` plain-string**, **`requiresState`/`transitionsState` non-string**,
  **`removesState` non-string** — surface today only as raw HF102 schema passthrough (noisy/uglier);
  targeted codes give better messages + fixes + suppression.
- **`variables[].function` unknown (non-built-in)** — HF510 only catches the 8 built-ins; the
  catch-all (HARD-500 at import) is uncovered.
- **`variables[].arguments` arity** — no rule (HF504 is template-side only).
- **literal/variable `name` charset for templating reference** — no rule.

**No contradictions found** between these proposals and existing validators/corpus, with one nuance:
report 12 showed HF50x "crash" wording is inaccurate (graceful degradation); the NEW `variables[]`
findings here are the opposite — `variables[].function` IS hard-enforced at import (500), unlike
template-body helpers. So HF511 legitimately carries error severity where HF503 (template-body
unknown helper) is "graceful empty render". Keep the messages distinct.

---

## 6. PROPOSED NEW DIAGNOSTICS (additive; continues each family)

Severity per D4: **E** = never-match / import-reject (400/500) / silently-dropped feature;
**W** = legal but almost-certainly a mistake; **I** = advisory. Range = smallest node the user must
change. Every proposal cites its §4 experiment or source.

### HF2xx (request matchers) — taken through HF211; continue at HF212

| Code      | Sev | Trigger                                                                                                                                                           | Range                                     | Message draft                                                                                                | Evidence                                                                                                 |
| --------- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| **HF212** | W   | field-matcher with a `matcher` (or empty/default) but **no `value`** key, OR an empty `{}` — EXCEPT when `matcher` is `negate` (defer to HF207) or `form` (HF208) | the matcher object (or its `matcher` key) | `Matcher has no "value" — it can never match (the value is nil)`                                             | T2, T3 §4; report 07 §3 (ExactMatch nil → no match)                                                      |
| **HF213** | I   | `destination` matcher with `exact`/empty matcher whose value contains `://` (full URL pasted where a host[:port] is expected)                                     | value node                                | `destination matches the request host only (host[:port]); "{v}" includes a scheme/path and will never match` | T19 §4; report 02 §1.3 (Destination = Host) — **OFF by default acceptable; high false-positive caution** |
| **HF214** | W   | `literals[].name` or `variables[].name` contains a char outside `[A-Za-z0-9_]` (un-referenceable via `{{Literals.x}}`/`{{Vars.x}}`)                               | the name value node                       | `Name "{n}" contains a character that breaks "{{Literals.{n}}}" / "{{Vars.{n}}}" templating references`      | report 08 §1 (Handlebars dotted path); T22 (name is a free map key)                                      |

### HF3xx (response) — taken through HF307; continue at HF308

| Code      | Sev | Trigger                                                                          | Range          | Message draft                                                                            | Evidence         |
| --------- | --- | -------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------- | ---------------- |
| **HF308** | E   | a `response.headers` value that is a plain string instead of an array of strings | the value node | `Response header values must be an array of strings — wrap it in [ … ]` (offer wrap fix) | T5 §4 (HTTP 400) |

### HF4xx (state) — taken through HF403; continue at HF404

| Code      | Sev | Trigger                                                            | Range                       | Message draft                                                            | Evidence          |
| --------- | --- | ------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------ | ----------------- |
| **HF404** | E   | a `requiresState` or `transitionsState` value that is not a string | the offending value node    | `State values must be strings — Hoverfly rejects this at import`         | T9 §4 (HTTP 400)  |
| **HF405** | E   | a `removesState[]` entry that is not a string                      | the offending array element | `removesState entries must be strings — Hoverfly rejects this at import` | T10 §4 (HTTP 400) |

### HF5xx (templating / variables) — taken through HF510; continue at HF511

| Code      | Sev | Trigger                                                                                                                                     | Range                      | Message draft                                                                                               | Evidence                                                         |
| --------- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| **HF511** | E   | `variables[].function` is a string that is NOT one of the 52 Hoverfly helpers and NOT one of the 8 built-ins (HF510 owns the built-in case) | function value node        | `Unknown variable function "{name}" — Hoverfly rejects the import (only the 52 helper functions are valid)` | T7 §4 (HTTP 500)                                                 |
| **HF512** | W   | `variables[].arguments` length ≠ the helper's arity (for a known-52 `function`; variadic → enforce minimum; `requestBody` → exactly 2)      | the `arguments` array node | `"{fn}" expects {sig} arguments, got {n} — the variable renders empty`                                      | T8/T21 §4 (silent drop at render); `registry/helpers.ts` arities |

### HF6xx (globalActions & misc) — taken through HF602; continue at HF603

| Code      | Sev | Trigger                                                                                                                                                                                                                                                                                                                                                                                                                     | Range           | Message draft                                                                                        | Evidence                                                                               |
| --------- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| **HF603** | W/I | **UNKNOWN-KEY family** — a key that does not (case-insensitively) match any allowed key for its object (`data`, `request`, `response`, field-matcher, `logNormalDelay`, `delays[]`, `delaysLogNormal[]`, `globalActions`, `literals[]`, `variables[]`, `meta`, pair). **W** when the object has a strong allowed-set; downgrade to **I** for header/query maps where keys are user-defined (i.e. SKIP those maps entirely). | the unknown key | `Unknown key "{key}"{didYouMean} — silently ignored by Hoverfly`                                     | T12, T22 §4 (silent drop); report 02 §2 (no additionalProperties:false on sub-objects) |
| **HF604** | I   | a key that is a **case-only variant** of an allowed key (Go binds it, but it's non-canonical)                                                                                                                                                                                                                                                                                                                               | the key         | `Prefer canonical "{canonical}" — "{key}" works (Go matches case-insensitively) but is non-standard` | T1/T6 §4 (case variants bind + normalize)                                              |

> **HF603 is the flagship.** It must run per-object against a fixed allowed-set table (the §1 matrix),
> and MUST be skipped for the two open string-keyed maps (`request.headers`, `request.query`,
> `response.headers`, `requiresState`, `transitionsState`) whose keys are user data. The root object
> is already covered by HF102 (schema `additionalProperties:false`) — HF603 should SKIP the root to
> avoid a double diagnostic, or be suppressed there per the HF102 dedup rule.

### "Did you mean" typo-suggestion mechanism (for HF603)

- Maintain the per-object allowed-key set from the §1 matrix (a static map: object-kind → string[]).
- For each unknown key `k`, compute **case-insensitive Levenshtein** against the allowed set; if the
  minimum distance ≤ 2 **and** the candidate is not a pure case variant (those go to HF604, not
  HF603), append `(did you mean "{candidate}"?)` to the message and attach a `CodeAction` quick-fix
  renaming the key. Examples that must resolve: `staus`→`status`, `machter`→`matcher`,
  `transitionState`→`transitionsState`, `removeState`→`removesState`, `bodyfile`→`bodyFile` (but
  `bodyfile` is a case variant → HF604, since Go binds it).
- **False-positive guards (credibility):** (a) never flag keys inside user-keyed maps; (b) never flag
  `method` on `request` (D5 — legal, schema-absent); (c) treat a key that case-folds to an allowed
  key as HF604 (works), never HF603 (dropped); (d) keep HF603 a **warning** (the doc still imports —
  it's a silent feature loss, not a reject), so an over-eager match never blocks the user.

### Permissive-by-design (DO NOT flag — false-positive killers)

- **Custom HTTP methods** (`GETT`, `PROPFIND`, gRPC verbs) — T19. No HF code.
- **Non-standard schemes** beyond http/https (ws, ftp, custom) — T19. No HF code.
- **`request.method`** as a request key — D5; legal despite schema omission.
- **`meta.hoverflyVersion` / `meta.timeExported`** free-string contents — §1.17.
- **`delays[].httpMethod` values** — T20.
- **bare `{value:…}` field-matchers** — T4; legal default-exact shorthand.
- **`variables[].arguments` arity** is only a **warning** (Hoverfly tolerates; HF512), never an error.
- **JSONPath / XPath / regex dialect specifics** — keep lenient per report 08 §6.3 (kubectl jsonpath,
  xsel xpath, Go RE2) — HF601 already restricts itself to JS-uncompilable patterns for this reason.

---

## 7. Proposed-diagnostics count per family

| Family    | New codes | List                                                       |
| --------- | --------- | ---------------------------------------------------------- |
| HF2xx     | 3         | HF212 (W), HF213 (I, opt), HF214 (W)                       |
| HF3xx     | 1         | HF308 (E)                                                  |
| HF4xx     | 2         | HF404 (E), HF405 (E)                                       |
| HF5xx     | 2         | HF511 (E), HF512 (W)                                       |
| HF6xx     | 2         | HF603 (W/I, unknown-key flagship), HF604 (I, case variant) |
| **Total** | **10**    | (4 E, 4 W, 2 I; HF213 optional)                            |
