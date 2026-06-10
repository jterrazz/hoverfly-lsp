<!-- GENERATED FILE — do not edit by hand. Run `npm run docs:diagnostics` to regenerate. -->

# Diagnostic catalog

Every diagnostic the Hoverfly LSP emits carries a stable `HFxxx` code, `source: "hoverfly"`, and a `codeDescription.href` pointing back at this page. Codes are **stable API**: once frozen, a code's meaning never changes (new codes may be added; deprecated codes are never reused).

Severity policy (architect decision D4): **Error** = Hoverfly would reject the import or the pair could silently never match; **Warning** = legal but almost certainly a mistake; **Information** = style/upgrade hints; **Hint** = optional niceties.

> Generated from `packages/core/src/semantic/catalog.ts` (code, severity, message) plus the trigger/range prose from `research/11-diagnostic-catalog.md`. Regenerate with `npm run docs:diagnostics`.

There are **37 codes** across 6 families.

## HF1xx — structure & meta

Document shape, schema validity, and `schemaVersion` handling.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF101](#hf101) | Warning | File matches `*.hoverfly.json`/`hoverfly-simulation.json` but fails the content fingerprint (D3). | root (first line) | `This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")` |
| [HF102](#hf102) | Error | Schema violation (re-tagged from vscode-json-languageservice; noisy union messages are suppressed when a more specific HF2xx fires on the same node). | as reported by the schema engine | _(passthrough — supplied by the parser/schema)_ |
| [HF103](#hf103) | Information | `schemaVersion` in v1–v4. | the version string | `Schema version {v} is legacy; Hoverfly auto-upgrades it on import (current: v5.3)` |
| [HF104](#hf104) | Error | `schemaVersion` does not match `^v\d+(\.\d+)?$`. | the version string | `Unrecognized schema version "{v}"` |

## HF2xx — request matchers

Matcher names, value types, `config`, the `form` pseudo-matcher, and `doMatch` chains.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF201](#hf201) | Error | Matcher name not in the registry after lowercasing (and not the body-`form` pseudo-matcher). | matcher name string | `Unknown matcher "{name}" — Hoverfly panics at match time on unknown matchers` |
| [HF202](#hf202) | Hint | Known matcher, non-canonical casing (registry lookup is case-insensitive). | matcher name string | `Prefer canonical lowercase "{canonical}"` |
| [HF203](#hf203) | Error | Value type not in the matcher's accepted set (e.g. `array` with a string value, `exact` with an object). | value node | `Matcher "{name}" expects {expected}; this pair will never match` |
| [HF204](#hf204) | Error | `config` present on any matcher except `array` (even `{}`). | config node | `"config" is only supported by the "array" matcher — Hoverfly panics on this` |
| [HF205](#hf205) | Warning | Unknown key inside `array` config (not `ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`). | the key | `Unknown config key "{key}" (ignored by Hoverfly)` |
| [HF206](#hf206) | Error | `array` config value is not a JSON boolean. | the value | `Config values must be booleans — Hoverfly panics on {type}` |
| [HF207](#hf207) | Warning | `negate` with a non-string value. | value node | `"negate" with a non-string value always matches (vacuous true) — likely not what you want` |
| [HF208](#hf208) | Error | `form` matcher on any field other than `body`, or inside `doMatch`. | matcher name string | `"form" is only valid on the body field — elsewhere Hoverfly panics` |
| [HF209](#hf209) | Error | `Form`/`FORM`/any non-lowercase `form` (its handling is case-sensitive, unlike registry matchers). | matcher name string | `"form" is case-sensitive; "{name}" hits the registry and panics Hoverfly` |
| [HF210](#hf210) | Hint | `doMatch` chained after an identity matcher (everything except jsonpath/xpath/jwt/jwtjsonpath). | doMatch key | `"{name}" passes the same value through — this chain is an AND of matchers on one value` |
| [HF211](#hf211) | Warning | Empty-string matcher value where it can never match (`jwtjsonpath` rejects empty; empty `regex`/`glob` is suspicious). | value node | `Empty {name} value never matches` |

## HF3xx — response

Body/bodyFile, header parity, status range, encoding, and delays.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF301](#hf301) | Warning | `body` and `bodyFile` both set. | bodyFile key | `Response contains both body and bodyFile; please remove one of them, otherwise body is used if non-empty` |
| [HF302](#hf302) | Warning | `Content-Length` and `Transfer-Encoding` headers both set. | second header key | `Response contains both Content-Length and Transfer-Encoding headers; please remove one of these headers` |
| [HF303](#hf303) | Warning | `Content-Length` ≠ byte length of `body` (skipped when `templated`, `bodyFile`, or `encodedBody`). | header value | `Content-Length {n} does not match body length {m}` |
| [HF304](#hf304) | Warning | `status` outside 100–599. | status value | `Status {n} is outside the valid HTTP range` |
| [HF305](#hf305) | Warning | `encodedBody: true` but `body` is not valid base64. | body value | `encodedBody is set but body is not valid base64` |
| [HF306](#hf306) | Warning | Negative `fixedDelay`. | the value | `Negative delay is ignored` |
| [HF307](#hf307) | Warning | `logNormalDelay` constraint violation (min/max/mean/median sanity). | offending field | _(passthrough — supplied by the parser/schema)_ |

## HF4xx — state

State-flow analysis across `requiresState` / `transitionsState` / `removesState`.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF401](#hf401) | Warning | `requiresState` key (non-`sequence:`-prefixed) never set by any `transitionsState` in the file. A key set only by the same pair's own `transitionsState` still fires (the transition runs after the match). | the key | `State "{key}" is required but never set by any transitionsState — this pair can only match if the state is set externally` |
| [HF402](#hf402) | Information | `transitionsState` key never required (and not `sequence:`). | the key | `State "{key}" is set but never required in this simulation` |
| [HF403](#hf403) | Information | `removesState` entry never set anywhere. | the entry | `State "{key}" is removed but never set` |

## HF5xx — templating

Active when `templated: true` (HF501 is the exception). Parser errors, helpers, variables, faker, and `now` offsets.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF501](#hf501) | Warning | `{{ ... }}` syntax in `body` while `templated` is absent/false. | first mustache | `Body contains template syntax but "templated" is not true — it will be sent literally` |
| [HF502](#hf502) | Error | Template parse error (unclosed `{{`, unclosed block, mismatched `{{/x}}`). | the offending token | _(passthrough — supplied by the parser/schema)_ |
| [HF503](#hf503) | Error | Unknown helper name (not in the 52+8 catalog). | helper name | `Unknown template helper "{name}"` |
| [HF504](#hf504) | Error | Helper arity mismatch (per the helper registry). | the call | `"{name}" expects {sig}, got {n} arguments` |
| [HF505](#hf505) | Error | `Vars.X` unresolved against `data.variables[].name`. | the path | `Variable "{x}" is not defined in data.variables` |
| [HF506](#hf506) | Error | `Literals.X` unresolved against `data.literals[].name`. | the path | `Literal "{x}" is not defined in data.literals` |
| [HF507](#hf507) | Information | Unknown `faker '<Type>'` (not in the pinned 210-name list). | the arg | `Unknown faker type "{t}" for gofakeit {version}` |
| [HF508](#hf508) | Warning | Parameterized gofakeit method (Number, Sentence, Password, Regex, …). | the arg | `faker "{t}" requires arguments Hoverfly cannot pass — this panics at render time` |
| [HF509](#hf509) | Warning | Invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y, e.g. `w`). | the arg | `Offset "{o}" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)` |
| [HF510](#hf510) | Error | Raymond built-in (`if`/`unless`/`with`/`each`/`first`/`log`/`lookup`/`equal`) used in `data.variables[].function`. | function value | `data.variables only accepts Hoverfly helper functions, not block built-ins` |

## HF6xx — globalActions & misc

Delay URL patterns and post-serve actions.

| Code | Severity | Trigger | Range | Message |
| --- | --- | --- | --- | --- |
| [HF601](#hf601) | Warning | `globalActions.delays[].urlPattern` (or `delaysLogNormal[]`) is an invalid Go RE2 regex. | the pattern | `Invalid pattern` |
| [HF602](#hf602) | Information | `postServeAction` not in the user-configured `hoverfly.registeredActions` allowlist (only when the setting is non-empty). | the value | `Action "{a}" is not in your configured registeredActions` |

## Per-code anchors

The `codeDescription.href` for each diagnostic resolves to `https://hoverfly-lsp.dev/diagnostics/<code>`; the anchors below mirror that catalog.

### HF101

- **Severity:** Warning
- **Trigger:** File matches `*.hoverfly.json`/`hoverfly-simulation.json` but fails the content fingerprint (D3).
- **Range:** root (first line)
- **Message:** `This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")`

### HF102

- **Severity:** Error
- **Trigger:** Schema violation (re-tagged from vscode-json-languageservice; noisy union messages are suppressed when a more specific HF2xx fires on the same node).
- **Range:** as reported by the schema engine
- **Message:** passthrough (supplied by the parser/schema)

### HF103

- **Severity:** Information
- **Trigger:** `schemaVersion` in v1–v4.
- **Range:** the version string
- **Message:** `Schema version {v} is legacy; Hoverfly auto-upgrades it on import (current: v5.3)`

### HF104

- **Severity:** Error
- **Trigger:** `schemaVersion` does not match `^v\d+(\.\d+)?$`.
- **Range:** the version string
- **Message:** `Unrecognized schema version "{v}"`

### HF201

- **Severity:** Error
- **Trigger:** Matcher name not in the registry after lowercasing (and not the body-`form` pseudo-matcher).
- **Range:** matcher name string
- **Message:** `Unknown matcher "{name}" — Hoverfly panics at match time on unknown matchers`

### HF202

- **Severity:** Hint
- **Trigger:** Known matcher, non-canonical casing (registry lookup is case-insensitive).
- **Range:** matcher name string
- **Message:** `Prefer canonical lowercase "{canonical}"`

### HF203

- **Severity:** Error
- **Trigger:** Value type not in the matcher's accepted set (e.g. `array` with a string value, `exact` with an object).
- **Range:** value node
- **Message:** `Matcher "{name}" expects {expected}; this pair will never match`

### HF204

- **Severity:** Error
- **Trigger:** `config` present on any matcher except `array` (even `{}`).
- **Range:** config node
- **Message:** `"config" is only supported by the "array" matcher — Hoverfly panics on this`

### HF205

- **Severity:** Warning
- **Trigger:** Unknown key inside `array` config (not `ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`).
- **Range:** the key
- **Message:** `Unknown config key "{key}" (ignored by Hoverfly)`

### HF206

- **Severity:** Error
- **Trigger:** `array` config value is not a JSON boolean.
- **Range:** the value
- **Message:** `Config values must be booleans — Hoverfly panics on {type}`

### HF207

- **Severity:** Warning
- **Trigger:** `negate` with a non-string value.
- **Range:** value node
- **Message:** `"negate" with a non-string value always matches (vacuous true) — likely not what you want`

### HF208

- **Severity:** Error
- **Trigger:** `form` matcher on any field other than `body`, or inside `doMatch`.
- **Range:** matcher name string
- **Message:** `"form" is only valid on the body field — elsewhere Hoverfly panics`

### HF209

- **Severity:** Error
- **Trigger:** `Form`/`FORM`/any non-lowercase `form` (its handling is case-sensitive, unlike registry matchers).
- **Range:** matcher name string
- **Message:** `"form" is case-sensitive; "{name}" hits the registry and panics Hoverfly`

### HF210

- **Severity:** Hint
- **Trigger:** `doMatch` chained after an identity matcher (everything except jsonpath/xpath/jwt/jwtjsonpath).
- **Range:** doMatch key
- **Message:** `"{name}" passes the same value through — this chain is an AND of matchers on one value`

### HF211

- **Severity:** Warning
- **Trigger:** Empty-string matcher value where it can never match (`jwtjsonpath` rejects empty; empty `regex`/`glob` is suspicious).
- **Range:** value node
- **Message:** `Empty {name} value never matches`

### HF301

- **Severity:** Warning
- **Trigger:** `body` and `bodyFile` both set.
- **Range:** bodyFile key
- **Message:** `Response contains both body and bodyFile; please remove one of them, otherwise body is used if non-empty`

### HF302

- **Severity:** Warning
- **Trigger:** `Content-Length` and `Transfer-Encoding` headers both set.
- **Range:** second header key
- **Message:** `Response contains both Content-Length and Transfer-Encoding headers; please remove one of these headers`

### HF303

- **Severity:** Warning
- **Trigger:** `Content-Length` ≠ byte length of `body` (skipped when `templated`, `bodyFile`, or `encodedBody`).
- **Range:** header value
- **Message:** `Content-Length {n} does not match body length {m}`

### HF304

- **Severity:** Warning
- **Trigger:** `status` outside 100–599.
- **Range:** status value
- **Message:** `Status {n} is outside the valid HTTP range`

### HF305

- **Severity:** Warning
- **Trigger:** `encodedBody: true` but `body` is not valid base64.
- **Range:** body value
- **Message:** `encodedBody is set but body is not valid base64`

### HF306

- **Severity:** Warning
- **Trigger:** Negative `fixedDelay`.
- **Range:** the value
- **Message:** `Negative delay is ignored`

### HF307

- **Severity:** Warning
- **Trigger:** `logNormalDelay` constraint violation (min/max/mean/median sanity).
- **Range:** offending field
- **Message:** passthrough (supplied by the parser/schema)

### HF401

- **Severity:** Warning
- **Trigger:** `requiresState` key (non-`sequence:`-prefixed) never set by any `transitionsState` in the file. A key set only by the same pair's own `transitionsState` still fires (the transition runs after the match).
- **Range:** the key
- **Message:** `State "{key}" is required but never set by any transitionsState — this pair can only match if the state is set externally`

### HF402

- **Severity:** Information
- **Trigger:** `transitionsState` key never required (and not `sequence:`).
- **Range:** the key
- **Message:** `State "{key}" is set but never required in this simulation`

### HF403

- **Severity:** Information
- **Trigger:** `removesState` entry never set anywhere.
- **Range:** the entry
- **Message:** `State "{key}" is removed but never set`

### HF501

- **Severity:** Warning
- **Trigger:** `{{ ... }}` syntax in `body` while `templated` is absent/false.
- **Range:** first mustache
- **Message:** `Body contains template syntax but "templated" is not true — it will be sent literally`

### HF502

- **Severity:** Error
- **Trigger:** Template parse error (unclosed `{{`, unclosed block, mismatched `{{/x}}`).
- **Range:** the offending token
- **Message:** passthrough (supplied by the parser/schema)

### HF503

- **Severity:** Error
- **Trigger:** Unknown helper name (not in the 52+8 catalog).
- **Range:** helper name
- **Message:** `Unknown template helper "{name}"`

### HF504

- **Severity:** Error
- **Trigger:** Helper arity mismatch (per the helper registry).
- **Range:** the call
- **Message:** `"{name}" expects {sig}, got {n} arguments`

### HF505

- **Severity:** Error
- **Trigger:** `Vars.X` unresolved against `data.variables[].name`.
- **Range:** the path
- **Message:** `Variable "{x}" is not defined in data.variables`

### HF506

- **Severity:** Error
- **Trigger:** `Literals.X` unresolved against `data.literals[].name`.
- **Range:** the path
- **Message:** `Literal "{x}" is not defined in data.literals`

### HF507

- **Severity:** Information
- **Trigger:** Unknown `faker '<Type>'` (not in the pinned 210-name list).
- **Range:** the arg
- **Message:** `Unknown faker type "{t}" for gofakeit {version}`

### HF508

- **Severity:** Warning
- **Trigger:** Parameterized gofakeit method (Number, Sentence, Password, Regex, …).
- **Range:** the arg
- **Message:** `faker "{t}" requires arguments Hoverfly cannot pass — this panics at render time`

### HF509

- **Severity:** Warning
- **Trigger:** Invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y, e.g. `w`).
- **Range:** the arg
- **Message:** `Offset "{o}" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)`

### HF510

- **Severity:** Error
- **Trigger:** Raymond built-in (`if`/`unless`/`with`/`each`/`first`/`log`/`lookup`/`equal`) used in `data.variables[].function`.
- **Range:** function value
- **Message:** `data.variables only accepts Hoverfly helper functions, not block built-ins`

### HF601

- **Severity:** Warning
- **Trigger:** `globalActions.delays[].urlPattern` (or `delaysLogNormal[]`) is an invalid Go RE2 regex.
- **Range:** the pattern
- **Message:** `Invalid pattern`

### HF602

- **Severity:** Information
- **Trigger:** `postServeAction` not in the user-configured `hoverfly.registeredActions` allowlist (only when the setting is non-empty).
- **Range:** the value
- **Message:** `Action "{a}" is not in your configured registeredActions`
