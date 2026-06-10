# Architect Decisions

Authoritative resolutions for the contradictions and open decisions surfaced by the research
round (see `06-gaps.md`). Implementation agents: when a report disagrees with this file,
**this file wins**. General rule applied throughout: **the Go source report (`02`) outranks
docs-derived reports (`01`, `05`)** — the Hoverfly docs are wrong in several places.

## D1 — Language & foundation

- TypeScript, ESM, Node ≥ 20. npm-workspaces monorepo.
- **Reuse `vscode-json-languageservice` (v5.7.x)** as the JSON engine (error-recovering
  parser, schema-driven diagnostics/completion/hover). Hoverfly-specific intelligence is
  layered on via `JSONWorkerContribution` + AST-walking semantic validators (the
  yaml-language-server / azure-pipelines / amazon-states-language-service pattern).
- `packages/core` = pure analysis, **zero LSP transport deps** (only
  vscode-json-languageservice, vscode-languageserver-types, vscode-languageserver-textdocument).
- `packages/server` = thin LSP wrapper, `vscode-languageserver@^10`, bin `hoverfly-lsp`
  (stdio default). Support **both push and pull diagnostics** (pull matters for headless agents).

## D2 — Contradiction resolutions (trust = source report 02)

| #     | Topic                   | Decision                                                                                                                                                                                                  |
| ----- | ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1    | `form` matcher          | **Does not exist** in the Go registry (docs/Java-only). Not in enum, not in completion. Diagnostic: unknown matcher.                                                                                      |
| C2    | `jsonPartial` casing    | Registry key is lowercase **`jsonpartial`**, lookup case-sensitive. `jsonPartial` ⇒ error-level diagnostic with autofix suggestion.                                                                       |
| C3    | Comparison helpers      | Only `isGreaterThan` / `isGreaterThanOrEqual` / `isLessThan` / `isLessThanOrEqual`. Short forms (`isGreater`, `isLess`) do not exist.                                                                     |
| C4    | `schemaVersion` pattern | Accept `^v\d+(\.\d+)?$` syntactically; Hoverfly loads any `startsWith("v5")` against the v5 schema. `/^v\d+$/` is a bug (rejects `v5.3`, the current default).                                            |
| C5    | `response.status`       | Not required, not bounded in the official schema. Bundled schema mirrors official. 100–599 bounds = **warning-level semantic check**, never schema error.                                                 |
| C6/C7 | Fallback JSON Schema    | Base = the **verbatim official `schema.json`** from Hoverfly master, enhanced (titles, descriptions, matcher enum as `examples`+semantic check — see D5). Never the hand-rolled schema in report 04 §6.2. |
| C8    | `xmltemplated`          | Real matcher; include in enum + completion.                                                                                                                                                               |
| C9    | Helper list             | The 52-helper verbatim list in report 02 §4.1 is the canonical completion set (pending arity table from report 08).                                                                                       |
| C10   | `now` offsets           | Pending source verification (report 08).                                                                                                                                                                  |

## D3 — Content fingerprint (gap B5)

A JSON document is treated as a Hoverfly simulation iff its root object has:

- a `data` property whose value is an object, **and**
- a `meta` property whose value is an object with a string `schemaVersion` that `startsWith("v")`.

`data.pairs` is **NOT** required (it's optional in the official schema). The server politely
returns empty results (no diagnostics, no completions) for JSON files that don't match the
fingerprint, **unless** the file matched an explicit filename pattern (`*.hoverfly.json`,
`hoverfly-simulation.json`) — explicitly-named files always get full treatment, including
"this doesn't look like a simulation" diagnostics.

Canonical filename convention to promote: **`*.hoverfly.json`**.

## D4 — Severity policy (gap B6)

Principle: **error** = Hoverfly would reject the import or silently never match;
**warning** = legal but almost certainly a mistake (mirrors Hoverfly's own import warnings);
**information** = style/upgrade hints; **hint** = optional niceties.

- Schema violations (per official schema): error.
- Unknown matcher name / wrong casing: **error** (Hoverfly doesn't reject the import, but the
  pair can never match — silent no-match is worse than a rejection, so we flag it as error).
- Matcher value type mismatch (per the normative table in report 07): error.
- `body` + `bodyFile` both set: warning (mirror Hoverfly's `BodyAndBodyFileMessage` wording).
- `Content-Length` + `Transfer-Encoding` both set: warning (mirror Hoverfly wording).
- `Content-Length` ≠ actual body length: warning (in scope; body length is computable).
- `requiresState` key never produced by any `transitionsState` (and not `sequence:`-prefixed): warning.
- `transitionsState`/`removesState` keys never required anywhere: information.
- `{{ Vars.X }}` / `{{ Literals.X }}` unresolved against `data.variables`/`data.literals`: error.
- Unknown template helper when `templated: true`: error. Helper arity mismatch: error.
- Template syntax in body while `templated` absent/false: **warning** ("templating is not enabled").
- `faker '<Type>'` unknown type: **information only** (list is gofakeit-version-dependent).
- `postServeAction`: completion from user setting `hoverfly.registeredActions`; unknown value = information only (runtime-registered, unknowable from the file).
- `schemaVersion` v1–v4: information ("will be auto-upgraded; current is v5.3").
- v5.x feature used under a lower v5.x version tag (e.g. `array` matcher under `v5`): **off by default** (versions are intent markers, not enforced — Hoverfly validates all v5.x against one schema). Available as opt-in strict mode later.

Diagnostic codes: stable, prefixed `HF`, grouped by hundreds —
`HF1xx` schema/structure, `HF2xx` matchers, `HF3xx` response fields, `HF4xx` state,
`HF5xx` templating, `HF6xx` globalActions/meta. Exact catalog authored in Phase 2
(semantic validators) and frozen before golden tests are written. Every diagnostic carries
`code`, `source: "hoverfly"`, and `codeDescription.href` pointing at our docs.

## D5 — Matcher enum strategy

The official schema leaves `matcher` as a free string. We keep the **bundled schema permissive**
(matcher: string, with the 14 registry names as `examples` for schema-only consumers) and
enforce the known-name check **semantically** (HF2xx) — this gives clean, single diagnostics
instead of vscode-json-languageservice's noisy oneOf/enum failures, and lets the SchemaStore
artifact stay forward-compatible.

Registry (exact spellings, from Go source): `""` (default exact), `exact`, `negate`, `glob`,
`regex`, `xml`, `xmltemplated`, `xpath`, `json`, `jsonpartial`, `jsonpath`, `jwt`,
`jwtjsonpath`, `array`. (`method` field on request: valid — present in the Go view struct —
even though absent from the official schema's request definition; do not flag it.)

## D6 — Scope decisions

- **In scope**: JSON simulation format only, v5.x fully featured; v1–v4 accepted + upgrade hint, no completion investment.
- **Out of scope (v1)**: YAML simulations, hoverfly-java DSL, middleware, Hoverfly Cloud-only extensions (docs.cloud.hoverfly.io). Revisit Cloud features post-v1.
- **Hoverfly version pinned** per release: schema + helper catalog embedded with a `HOVERFLY_COMMIT` constant; CI job diffs `core/handlers/v2/schema.json` (+ matcher/templating sources) against Hoverfly master weekly and opens an issue on drift.
- License: MIT (all deps MIT/Apache — verified, no copyleft).

## D8 — Source-verification corrections (reports 07/08/09 — these OVERRIDE D2 where they conflict)

Round-2 verification read the actual matcher/templating Go code paths; several earlier
"trusted" claims from report 02 were wrong:

- **Matcher lookup is case-INSENSITIVE** (`matchers.Matchers[strings.ToLower(name)]`), so
  `jsonPartial` works at runtime. Revised C2: non-canonical casing = **hint** ("use canonical
  lowercase `jsonpartial`"), not error.
- **`form` DOES exist** — revised C1: it's a body-layer pseudo-matcher handled literally
  (case-SENSITIVE `"form"`) outside the registry. Value = object `{field: [matchers...]}`.
  Valid **only** on `body`; `form` on headers/query/etc., or `Form`/`FORM` anywhere, falls
  through to the registry and **panics Hoverfly**. Diagnostics: `form` outside body = error;
  wrong-case form = error (NOT a casing hint — case-insensitivity doesn't apply here).
- **Unknown matcher name ⇒ runtime PANIC** (nil func type assertion), not silent no-match.
  Unknown matcher = error, message mentions the crash.
- **`config` key on any non-`array` matcher ⇒ PANIC** (even `{}`). Error. `array` is the only
  matcher accepting config; config values must be JSON booleans (string `"true"` ⇒ PANIC ⇒ error).
- **`array` value must be a JSON array** — a plain string is rejected (no ';'-split on the
  matcher side; the split applies to the incoming request value). String value = error.
- **`negate` with non-string value matches vacuously (always true)** — silent logic inversion.
  Warning.
- Most other matchers: non-string value ⇒ graceful no-match ⇒ error-level diagnostic
  ("this pair can never match").
- **`doMatch` is generic** (valid after any matcher). Only `jsonpath`/`xpath`/`jwt`/`jwtjsonpath`
  transform the value for the next link; after identity matchers it's AND-semantics — hint
  explaining that.
- `jwtjsonpath` exists (merged 2025-12-12); empty JSONPath string ⇒ no match ⇒ error on empty.
- **Templating grammar: build a real nested, block-aware Handlebars parser** (not a flat
  tokenizer): block helpers `#if/#unless/#each/#equal/#with` + `{{else}}`, subexpressions
  `(multiply (this.price) (this.qty) '')`, `@index/@first/@last/@key`, dotted paths.
- Helper catalog = **52 Hoverfly helpers + 8 raymond built-ins** (`if, unless, with, each,
first, log, lookup, equal` — `first`/`equal` are SpectoLabs-fork additions).
  `data.variables[].function` accepts **only the 52**, not the built-ins.
- `now` offset units: `ns, us, µs, μs, ms, s, m, h, d, y` (no `w`); optional `+/-`, fractional
  ok; invalid offsets silently ignored at render ⇒ warning. Formats: `''`=RFC3339,
  `'unix'`=seconds, `'epoch'`=**milliseconds** (misnamed), else Go time layout.
- faker: gofakeit **v6.28.0** pinned; **210 valid zero-arg names** (case-sensitive, full list
  in report 08) — completion source. Parameterized gofakeit methods (`Number`, `Sentence`,
  `Password`, `Regex`…) **panic** when used ⇒ warning; unknown name = information.
- JSONPath dialect = **kubectl** (`k8s.io/client-go/util/jsonpath`), NOT Jayway/RFC9535;
  XPath via `ChrisTrenkamp/xsel`. Hover docs must say so.
- Claude Code plugin (verified against official docs): `.lsp.json` at plugin root,
  required `command` + `extensionToLanguage` (single extensions only — map `".json"`),
  optional `args/transport/env/initializationOptions/settings/workspaceFolder/startupTimeout/
maxRestarts/diagnostics` (diagnostics default true, auto-injected after edits). Content
  fingerprint (D3) is the activation filter. Pre-ship test: coexistence with another
  `.json`-mapped LSP plugin.

## D7 — Distribution

1. npm: `hoverfly-lsp` bin (single esbuild/tsup bundle) — serves Zed, IntelliJ/LSP4IJ, Claude Code, Neovim, etc.
2. VS Code: `.vsix` bundling the server (no separate install), published to Marketplace + Open VSX.
3. Zed: Rust/WASM extension, `path_suffixes = ["hoverfly.json", "hoverfly-simulation.json"]`, installs server from npm.
4. IntelliJ: LSP4IJ template (works on Community) — documented setup; native-API plugin deferred.
5. Claude Code: plugin with LSP component (exact shape per report 09); content fingerprint (D3) handles `.json`-wide activation.
6. SchemaStore: submit enhanced-but-faithful schema, `fileMatch: ["*.hoverfly.json", "hoverfly-simulation.json"]` (NOT bare `simulation.json` — too generic). Promote `$schema` self-declaration in docs.
