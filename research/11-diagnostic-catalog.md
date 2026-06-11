# HFxxx Diagnostic Catalog (frozen for v1)

Authored by the architect from `10-architect-decisions.md` (D4 severity policy, D8 source
corrections) and reports 07/08. **Codes are stable API**: once golden tests exist, a code's
meaning never changes (codes may be added, deprecated codes are never reused).

Every diagnostic: `source: "hoverfly"`, `code: "HFxxx"`, `codeDescription.href:
https://hoverfly-lsp.dev/diagnostics/hfxxx`. Range targeting rule: point at the **smallest
node that the user must change** (the matcher name string, not the whole pair). Messages are
sentence-case, no trailing period, state the consequence when it's surprising
(panic / silent no-match / silently ignored).

Severity legend: E=Error, W=Warning, I=Information, H=Hint.

## HF1xx — structure & meta

| Code  | Sev | Trigger                                                                                                                                               | Range              | Message template                                                                                              |
| ----- | --- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------- |
| HF101 | W   | File matches `*.hoverfly.json`/`hoverfly-simulation.json` but fails the content fingerprint (D3)                                                      | root (first line)  | `This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")` |
| HF102 | E   | Schema violation (re-tagged from vscode-json-languageservice; suppress noisy union messages per D5 when a more specific HF2xx fires on the same node) | as reported        | passthrough message                                                                                           |
| HF103 | I   | `schemaVersion` in v1–v4                                                                                                                              | the version string | `Schema version {v} is legacy; Hoverfly auto-upgrades it on import (current: v5.3)`                           |
| HF104 | E   | `schemaVersion` doesn't match `^v\d+(\.\d+)?$`                                                                                                        | the version string | `Unrecognized schema version "{v}"`                                                                           |

## HF2xx — request matchers

| Code  | Sev | Trigger                                                                                                                        | Range               | Message template                                                                            |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------- | ------------------------------------------------------------------------------------------- |
| HF201 | E   | Matcher name not in registry after lowercasing (and not body-`form`)                                                           | matcher name string | `Unknown matcher "{name}" — Hoverfly panics at match time on unknown matchers`              |
| HF202 | H   | Known matcher, non-canonical casing (lookup is case-insensitive)                                                               | matcher name string | `Prefer canonical lowercase "{canonical}"`                                                  |
| HF203 | E   | Value type not in the matcher's accepted set (per `registry/matchers.ts`; e.g. `array` with string value, `exact` with object) | value node          | `Matcher "{name}" expects {expected}; this pair will never match`                           |
| HF204 | E   | `config` present on any matcher except `array` (even `{}`)                                                                     | config node         | `"config" is only supported by the "array" matcher — Hoverfly panics on this`               |
| HF205 | W   | Unknown key inside `array` config (not ignoreUnknown/ignoreOrder/ignoreOccurrences)                                            | the key             | `Unknown config key "{key}" (ignored by Hoverfly)`                                          |
| HF206 | E   | `array` config value not a JSON boolean                                                                                        | the value           | `Config values must be booleans — Hoverfly panics on {type}`                                |
| HF207 | W   | `negate` with non-string value                                                                                                 | value node          | `"negate" with a non-string value always matches (vacuous true) — likely not what you want` |
| HF208 | E   | `form` matcher on any field other than `body`, or inside `doMatch`                                                             | matcher name string | `"form" is only valid on the body field — elsewhere Hoverfly panics`                        |
| HF209 | E   | `Form`/`FORM`/any non-lowercase `form` (its handling is case-SENSITIVE, unlike registry matchers)                              | matcher name string | `"form" is case-sensitive; "{name}" hits the registry and panics Hoverfly`                  |
| HF210 | H   | `doMatch` chained after an identity matcher (everything except jsonpath/xpath/jwt/jwtjsonpath)                                 | doMatch key         | `"{name}" passes the same value through — this chain is an AND of matchers on one value`    |
| HF211 | W   | Empty-string matcher value where it can never match (`jwtjsonpath` rejects empty; empty `regex`/`glob` suspicious)             | value node          | `Empty {name} value never matches`                                                          |

## HF3xx — response

| Code  | Sev | Trigger                                                                                             | Range             | Message template                                                                           |
| ----- | --- | --------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ |
| HF301 | W   | `body` and `bodyFile` both set                                                                      | bodyFile key      | Mirror Hoverfly's `BodyAndBodyFileMessage` wording (report 05 §2.3): body takes precedence |
| HF302 | W   | `Content-Length` and `Transfer-Encoding` headers both set                                           | second header key | Mirror Hoverfly wording                                                                    |
| HF303 | W   | `Content-Length` ≠ byte length of `body` (skip when `templated`, `bodyFile`, or `encodedBody` true) | header value      | `Content-Length {n} does not match body length {m}`                                        |
| HF304 | W   | `status` outside 100–599                                                                            | status value      | `Status {n} is outside the valid HTTP range`                                               |
| HF305 | W   | `encodedBody: true` but `body` is not valid base64                                                  | body value        | `encodedBody is set but body is not valid base64`                                          |
| HF306 | W   | Negative `fixedDelay`                                                                               | value             | `Negative delay is ignored`                                                                |
| HF307 | W   | `logNormalDelay` constraint violation (per report 01: min/max/mean/median sanity)                   | offending field   | `{explain}`                                                                                |

## HF4xx — state

| Code  | Sev | Trigger                                                                                                                                                                                                                                  | Range     | Message template                                                                                                            |
| ----- | --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------- |
| HF401 | W   | `requiresState` key (non-`sequence:`-prefixed) never set by any `transitionsState` in the file — a key set ONLY by the same pair's own `transitionsState` still fires (the transition runs after the match, so first encounter is unset) | the key   | `State "{key}" is required but never set by any transitionsState — this pair can only match if the state is set externally` |
| HF402 | I   | `transitionsState` key never required (and not `sequence:`)                                                                                                                                                                              | the key   | `State "{key}" is set but never required in this simulation`                                                                |
| HF403 | I   | `removesState` entry never set anywhere                                                                                                                                                                                                  | the entry | `State "{key}" is removed but never set`                                                                                    |

## HF5xx — templating (active when `templated: true`; HF501 is the exception)

| Code  | Sev | Trigger                                                                                             | Range               | Message template                                                                        |
| ----- | --- | --------------------------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------- |
| HF501 | W   | `{{ ... }}` syntax in `body` while `templated` absent/false                                         | first mustache      | `Body contains template syntax but "templated" is not true — it will be sent literally` |
| HF502 | E   | Template parse error (unclosed `{{`, unclosed block, mismatched `{{/x}}`)                           | the offending token | `{parser message}`                                                                      |
| HF503 | E   | Unknown helper name (not in 52+8 catalog)                                                           | helper name         | `Unknown template helper "{name}"`                                                      |
| HF504 | E   | Helper arity mismatch (per `registry/helpers.ts`)                                                   | the call            | `"{name}" expects {sig}, got {n} arguments`                                             |
| HF505 | E   | `Vars.X` unresolved against `data.variables[].name`                                                 | the path            | `Variable "{x}" is not defined in data.variables`                                       |
| HF506 | E   | `Literals.X` unresolved against `data.literals[].name`                                              | the path            | `Literal "{x}" is not defined in data.literals`                                         |
| HF507 | I   | Unknown `faker '<Type>'` (not in pinned 210-name list)                                              | the arg             | `Unknown faker type "{t}" for gofakeit {version}`                                       |
| HF508 | W   | Parameterized gofakeit method (Number, Sentence, Password, Regex, …)                                | the arg             | `faker "{t}" requires arguments Hoverfly cannot pass — this panics at render time`      |
| HF509 | W   | Invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y, e.g. `w`)                         | the arg             | `Offset "{o}" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)` |
| HF510 | E   | Raymond built-in (`if/unless/with/each/first/log/lookup/equal`) used in `data.variables[].function` | function value      | `data.variables only accepts Hoverfly helper functions, not block built-ins`            |

## HF6xx — globalActions & misc

| Code  | Sev | Trigger                                                                                                                  | Range       | Message template                                           |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------ | ----------- | ---------------------------------------------------------- |
| HF601 | W   | `globalActions.delays[].urlPattern` is an invalid regex                                                                  | the pattern | `Invalid pattern`                                          |
| HF602 | I   | `postServeAction` not in the user-configured `hoverfly.registeredActions` allowlist (only when the setting is non-empty) | the value   | `Action "{a}" is not in your configured registeredActions` |

## Implementation notes

- HF102 suppression: when an HF2xx fires on a node, drop schema diagnostics covering the same
  range (the amazon-states lesson — report 05).
- HF203's `{expected}` strings come from the registry, not hand-written per call site.
- HF303/HF305 need raw byte length (UTF-8) — use TextEncoder, not `.length`.
- HF401–403: build one state-flow index per document pass, shared by all three rules.
- HF5xx ranges must map template-parser offsets back through JSON string escapes to document
  positions (escape-aware source maps; the hardest part — test `\n`, `\"`, `\uXXXX` cases).
- Verify-on-implementation: HF305 (does import actually fail?), HF306/HF307 exact runtime
  behavior, HF601 pattern dialect (regex vs glob — check Go source `regexp` vs `glob` usage).
- Ground-truth corrections (2026-06-11, see D9 in report 10):
  - `field-matchers` is typed `object` (restored to match official); `doMatch` self-`$ref`s it,
    so an array-shaped `doMatch` is now an **HF102** schema error — Hoverfly rejects it at import.
  - HF208/HF201/HF203/HF210 recurse object-shaped `doMatch` chains (not just the legacy array).
  - HF601 scans BOTH `globalActions.delays[]` and `delaysLogNormal[]` (both use a Go RE2
    `urlPattern`); resolves the "regex vs glob" verify note above — it is RE2 regex in both paths.

## Additive extension — structural strictness (2026-06-11)

Seventeen ADDITIVE codes adopted from `research/13-field-constraints.md` (whole-structure
field-constraint matrix) and `research/14-matcher-value-syntax.md` (matcher value-SYNTAX),
both ground-truth-verified against real Hoverfly v1.12.8. No existing code (HF101–HF602) is
changed. Severities follow D4: **E** = never-match / import-reject (400/500) / silently-dropped
feature; **W** = legal but almost-certainly a mistake; **I** = advisory. Range = the smallest
node the user must change.

Binding carve-outs (architect ruling): case-insensitive Go key matching means HF603 fires only
when NO case-fold match exists (a case-only variant goes to HF604); regex validation ONLY via
`re2js` (never `new RegExp`); no glob diagnostics; `jsonpath`/`xpath` = balance-lint only; custom
HTTP methods and custom schemes stay silent (HF215/HF216 fire ONLY on a near-miss TYPO of a
standard value, Hint-only — both fields are OPEN sets Hoverfly compares verbatim, T19).

### HF2xx — request matchers (extension)

| Code  | Sev | Trigger                                                                                                                                                                                                                                 | Range                                     | Message template                                                                                                |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| HF212 | W   | Field-matcher with a `matcher` (or empty/default) but no `value` key, OR an empty `{}` — EXCEPT when `matcher` is `negate` (defer to HF207) or `form` (HF208)                                                                           | the matcher object (or its `matcher` key) | `Matcher has no "value" — it can never match (the value is nil)`                                                |
| HF213 | I   | `destination` matcher with `exact`/empty matcher whose value contains `://` (full URL pasted where a host[:port] is expected); off by default acceptable                                                                                | value node                                | `destination matches the request host only (host[:port]); "{v}" includes a scheme or path and will never match` |
| HF214 | W   | `literals[].name` or `variables[].name` contains a char outside `[A-Za-z0-9_]` (un-referenceable via `{{Literals.x}}`/`{{Vars.x}}`)                                                                                                     | the name value node                       | `Name "{n}" contains a character that breaks "{{Literals.{n}}}" / "{{Vars.{n}}}" templating references`         |
| HF215 | H   | `method` value (under `exact`/default matcher) is a near-miss (Levenshtein ≤ 1) of a standard IANA HTTP method but not itself one (`GT`→`GET`); OPEN set compared verbatim, so a bespoke verb far from every standard verb stays silent | value node                                | `Unknown HTTP method "{value}" — did you mean "{suggestion}"?`                                                  |
| HF216 | H   | `scheme` value (under `exact`/default matcher) is a near-miss (Levenshtein ≤ 1) of a common URI scheme (http/https/ws/wss) but not itself one (`htttp`→`http`); string-compared verbatim, so a custom scheme (`ftp`) stays silent       | value node                                | `Unknown URI scheme "{value}" — did you mean "{suggestion}"?`                                                   |
| HF230 | E   | `regex` value (or `xmltemplated` `{{regex:…}}` leaf) is not a valid Go RE2 pattern (RE2 ≠ JS RegExp); validate with `re2js`, reuse for HF601                                                                                            | value node                                | `Invalid RE2 regex — Hoverfly (Go regexp) silently never matches this`                                          |
| HF231 | E   | `json`/`jsonpartial`/`jwt` value string does not parse as JSON text (the `jwt` `"$.username"` bug)                                                                                                                                      | value node                                | `"{name}" value must be JSON text; this is not valid JSON, so the pair never matches`                           |
| HF232 | W   | `jsonpath`/`jwtjsonpath` value has unbalanced `[]`/`()`/`{}`/quotes (balance lint only — no full kubectl-JSONPath parser)                                                                                                               | value node                                | `JSONPath has unbalanced brackets or quotes`                                                                    |
| HF233 | W   | `xpath` value has unbalanced `[]`/`()`/quotes (balance lint only — no full XPath engine)                                                                                                                                                | value node                                | `XPath has unbalanced brackets or quotes`                                                                       |
| HF234 | W   | `xml`/`xmltemplated` value is not well-formed XML (after neutralizing `{{ignore}}`/`{{regex:…}}` template tokens); validate with `fast-xml-parser`                                                                                      | value node                                | `"{name}" value is not well-formed XML; this pair never matches`                                                |
| HF235 | W   | `jwt` value parses as JSON but has a top-level key outside {`header`,`payload`}                                                                                                                                                         | the offending key (value node)            | `jwt value should be a partial {"header":…,"payload":…} spec; key "{k}" can never match a JWT`                  |
| HF236 | W   | `array` value element is not a JSON string (Hoverfly stringifies it to a non-literal)                                                                                                                                                   | the offending array element               | `array element {i} is not a string; Hoverfly cannot match a non-string element as written`                      |

### HF3xx — response (extension)

| Code  | Sev | Trigger                                                                          | Range          | Message template                                                        |
| ----- | --- | -------------------------------------------------------------------------------- | -------------- | ----------------------------------------------------------------------- |
| HF308 | E   | A `response.headers` value that is a plain string instead of an array of strings | the value node | `Response header values must be an array of strings — wrap it in [ … ]` |

### HF4xx — state (extension)

| Code  | Sev | Trigger                                                            | Range                       | Message template                                                         |
| ----- | --- | ------------------------------------------------------------------ | --------------------------- | ------------------------------------------------------------------------ |
| HF404 | E   | A `requiresState` or `transitionsState` value that is not a string | the offending value node    | `State values must be strings — Hoverfly rejects this at import`         |
| HF405 | E   | A `removesState[]` entry that is not a string                      | the offending array element | `removesState entries must be strings — Hoverfly rejects this at import` |

### HF5xx — templating / variables (extension)

| Code  | Sev | Trigger                                                                                                                                     | Range                      | Message template                                                                                            |
| ----- | --- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------- |
| HF511 | E   | `variables[].function` is a string that is NOT one of the 52 Hoverfly helpers and NOT one of the 8 built-ins (HF510 owns the built-in case) | function value node        | `Unknown variable function "{name}" — Hoverfly rejects the import (only the 52 helper functions are valid)` |
| HF512 | W   | `variables[].arguments` length ≠ the helper's arity (known-52 `function`; variadic → minimum; `requestBody` → exactly 2)                    | the `arguments` array node | `"{fn}" expects {sig} arguments, got {n} — the variable renders empty`                                      |

### HF6xx — globalActions & misc (extension)

| Code  | Sev | Trigger                                                                                                                                                                                                                                                                     | Range           | Message template                                                                                     |
| ----- | --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| HF603 | W   | UNKNOWN-KEY flagship — a key that does not (case-insensitively) match any allowed key for its object (per the `registry/structure.ts` matrix). SKIP the root (HF102), the user-keyed maps (`headers`/`query`/`requiresState`/`transitionsState`), and `request.method` (D5) | the unknown key | `Unknown key "{key}"{didYouMean} — silently ignored by Hoverfly`                                     |
| HF604 | I   | A key that is a case-only variant of an allowed key (Go binds it case-insensitively, but it is non-canonical)                                                                                                                                                               | the key         | `Prefer canonical "{canonical}" — "{key}" works (Go matches case-insensitively) but is non-standard` |

> `{didYouMean}` is a pre-formatted suffix the HF603 rule supplies (e.g. ` (did you mean
"status"?)`) or the empty string. The allowed-key matrix, user-keyed-map skip list, and the
> did-you-mean Levenshtein threshold live in `packages/core/src/registry/structure.ts`.

This extension brings the catalog to **56 codes** (37 original + 17 structural-strictness + 2
method/scheme well-known-value codes HF215/HF216). The exhaustive severity table in
`packages/core/test/semantic/catalog.test.ts` pins all 56.

### Method/scheme well-known-value did-you-mean (2026-06-11)

HF215/HF216 add VALUE intelligence (completion + Hint did-you-mean) for `request.method` and
`request.scheme`. Both fields are OPEN sets Hoverfly compares VERBATIM and never validates at import
(research/13 §3.1/§3.2; ground-truth: a live v1.12.8 import of `method:"GT"` / `scheme:"htttp"`
returns HTTP 200 with the values stored verbatim). The zero-false-positive policy is LAW: the Hint
fires ONLY on a near-miss (Levenshtein ≤ 2) of a standard value (a typo) and never on a plausible
custom value (`PURGE`, `PROPFIND`, `ftp`). The standard sets (IANA HTTP Method Registry; common URI
schemes) live in `packages/core/src/registry/http.ts`; the Levenshtein machinery is shared with
HF603 via `packages/core/src/semantic/levenshtein.ts`. Completion offers the standard values but
never restricts the field to them. Gate (both completion and Hint): the `method`/`scheme` field
directly under `request`, with an `exact` (or absent/default-exact) matcher only.
