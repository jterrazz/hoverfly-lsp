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
