# 06 — Gap & Contradiction Report (Adversarial Completeness Review)

> Reviewer role: adversarial completeness critic for **hoverfly-lsp**.
> Inputs reviewed: `01-hoverfly-format.md` (docs-based format reference — note: lives at
> `/Users/jterrazz/Developer/01-hoverfly-format.md`, NOT in this folder), `02-hoverfly-source-truth.md`
> (Go source truth), `03-lsp-architecture.md` (architecture/repo design), `04-ide-integration.md`
> (editor wiring), `05-prior-art.md` (prior art + a second docs-based schema/matcher pass).
> Question answered: what is MISSING or CONTRADICTORY that would block/derail an implementation team.

---

## Verdict

**needs-followup-research** — but only narrowly. The corpus is unusually strong: report 02 (source
truth) gives a field-by-field validator-ready schema, an exhaustive matcher registry, and a verbatim
52-helper list. The blockers are not "we don't know the format"; they are **a handful of concrete
docs-vs-source contradictions that, if the wrong source is trusted, will ship a validator that
flags valid files as errors (or vice-versa)**, plus a couple of editor-integration claims that are
asserted without a load-bearing citation and must be verified before code is written against them.

**Rule for the implementation team: when 02 (source) and 01/04/05 (docs) disagree, TRUST 02.**
Hoverfly validates and matches against the Go source; the docs lag and are demonstrably wrong in
several enumerations. 02 was extracted from `master` source and is internally consistent with the
verbatim `schema.json` reproduced in both 02 §2 and 05 §4.1.

---

## 1. Contradictions (each with which to trust)

### C1 — `form` matcher: valid type or not? (HIGH — will produce wrong diagnostics)

- **01 §4 / 01 §13 / 05 §4.3 / 05 §8.4**: list `form` as a first-class matcher (value = object of
  matcher-arrays, body-only), and 05 even bakes it into the "13 known matcher types" error string.
- **02 §6 row 1**: **`form` does NOT exist** in `Matchers` or `MatchersWithConfig` in the Go core.
  Form data is handled in _templating_ via `Request.FormData`; `form` as a matcher is a docs/Java-side
  artifact. An incoming `"matcher":"form"` passes JSON-schema (matcher is `{"type":"string"}`) but
  fails/no-matches at runtime.
- **TRUST 02.** Do NOT offer `form` as a completion for the OSS Go target, and do NOT include it in
  the "valid matcher" enum for an _error_-level diagnostic. If supporting hoverfly-java users is a
  goal, surface `form` at most as an info/warning, never as canonical. **This single contradiction
  changes the matcher enum, the completion list, AND the diagnostic error message** — it must be
  resolved before anyone writes `matcher-kinds.ts`.

### C2 — matcher name casing: `jsonPartial` vs `jsonpartial` (HIGH)

- **01 §4 / 05 §4.3**: spell it **`jsonPartial`** (camelCase capital P), 01 explicitly calling out the
  capital P as intentional.
- **02 §3.2 / §6 row 2**: registry key is **`jsonpartial`** (all lowercase); Hoverfly lookup is
  case-sensitive. camelCase will silently never match.
- **TRUST 02.** Autocomplete/validate lowercase `jsonpartial`; treat `jsonPartial` as a typo to repair.
  05's error-string literal ("Valid types: ... jsonPartial ...") is itself wrong and must be fixed.

### C3 — comparison helper names: short vs long forms (HIGH)

- **05 §5.3**: lists `isGreater`, `isLess` (short forms).
- **01 §10.9**: also uses `isGreater`/`isLess` in its table (line 606-607) — so the docs-based reports
  agree with each other but are both wrong.
- **02 §4.1 / §6 row 3**: the **registered** helper names are `isGreaterThan`, `isGreaterThanOrEqual`,
  `isLessThan`, `isLessThanOrEqual`. There is no `isGreater`/`isLess`.
- **TRUST 02.** Completion and any "unknown helper" diagnostic must use the long forms only.

### C4 — `meta.schemaVersion` validation pattern: `^v\d+$` vs `HasPrefix("v5")` (HIGH — breaks v5.3)

- **04 §6.2 (JSON Schema, line 915)** constrains `schemaVersion` with `"pattern": "^v\\d+$"`, and
  **04 §5.4 content-detection** asserts the fingerprint is `meta.schemaVersion` matching `/^v\d+$/`
  with the example `"v5"`. 05 §5 repeats `/^v\d+$/` ("e.g. `v5`").
- **02 §5.1 / 05 §2.2**: Hoverfly accepts `strings.HasPrefix(schemaVersion, "v5")` — i.e. `v5`, `v5.0`,
  `v5.1`, `v5.2`, **`v5.3`** (the current default emitted by `NewMetaView`).
- `^v\d+$` does **NOT** match `v5.3` (the dot fails). The fallback JSON Schema in 04 §6.2 and the
  content-detection heuristic in 04/05 would therefore **reject or fail to detect the most common
  real-world files** — including every freshly exported simulation.
- **TRUST 02.** Use `^v\d+(\.\d+)?$` (or simply `^v5(\.\d+)?$` / `startsWith("v5")` for activation).
  This bug is replicated in three places and must be fixed in all of them.

### C5 — `response.status`: required + bounded, or optional? (MEDIUM)

- **04 §6.2 fallback schema (line 968-970)**: marks `status` **required** and `minimum:100/maximum:599`.
- **02 §2 / 05 §4.1 (the verbatim official schema)**: `response` has **no `required`**; `status` is a
  plain `{"type":"integer"}` with no bounds. 02 §1.4 confirms `status` has no `omitempty` (serialized
  even as 0) but is optional on input.
- **TRUST 02 for parity** (the bundled schema must not invent a `required`/range the real validator
  lacks, or the LSP flags files Hoverfly accepts). The 100-599 bound is a reasonable _opt-in
  semantic/warning_ layer (and matches the `setStatusCode` runtime range), but it must NOT be encoded
  as a hard schema error. Decide explicitly: parity-strict bundled schema + separate semantic lints.

### C6 — fallback JSON Schema `additionalProperties:false` placement (MEDIUM)

- **04 §6.2 (line 889)**: sets `additionalProperties:false` at the **root** AND omits it everywhere
  else — but its `requestMatchers`/`response` definitions silently drop fields present in the real
  schema (no `method` formal entry, no `labels`, no `literals`/`variables` under data, `query` typed
  as bare `{"type":"object"}`, `requiresState` as bare object). 04's `data` also marks `pairs`
  **required**, which the official schema does NOT.
- **02 §2 / 05 §4.1**: official schema sets `additionalProperties:false` **only at root**; sub-objects
  accept unknown keys; `data.pairs` is optional.
- **TRUST 02** for the _bundled/parity_ schema. 04's hand-written schema (§6.2) is a lossy
  re-derivation and should be **replaced by the verbatim official schema** (02 §2 / 05 §4.1) for the
  zero-install SchemaStore artifact, with any stricter rules added as a clearly-separate "strict"
  variant. Shipping 04 §6.2 as-is would diverge from Hoverfly in at least 5 ways.

### C7 — matcher enum used in the fallback schema is incomplete (MEDIUM)

- **04 §6.2 (line 945)**: enumerates only `["exact","glob","regex","xpath","jsonpath","jwt","array"]`
  in `matcherValue.matcher` — missing `json`, `jsonpartial`, `xml`, `xmltemplated`, `jwtjsonpath`,
  `negate`. A file using `"matcher":"json"` would be flagged invalid by this fallback schema.
- **02 §3.2 (14 registry entries incl. empty string) / 05 §4.3 (13 listed)**: the full set.
- **TRUST 02 §3.2** as the authoritative enum (note it also includes `xmltemplated`, which 01 §3.2's
  table has but 05 §4.3's matcher table OMITS — see C8).

### C8 — `xmltemplated` matcher presence (LOW but a coverage gap)

- **02 §3.2** lists `xmltemplated` (`XmlTemplatedMatch`) as a registered matcher.
- **05 §4.3** matcher table (13 rows) and **04 §6.2** enum both **omit `xmltemplated`** entirely.
  01 §3 also omits it from §4's main table (it appears only in 02).
- **TRUST 02.** `xmltemplated` is real and must be in the enum/completion. It is the matcher most
  likely to be forgotten because only the source-truth report captured it.

### C9 — helper count / total enumeration (LOW)

- **02 §4.1**: authoritative verbatim list of **52** helpers from `helperMethodMap`.
- **01 §10 / 05 §5.3**: enumerate helpers by category but never give a total and both miss/rename some
  (e.g. the `isGreater`/`isLess` error from C3; `jsonFromJWT` is listed as a helper in 02's map but
  treated only as an accessor in 01 §10.11).
- **TRUST 02 §4.1** as the canonical completion list (all 52). The category groupings in 01/05 are
  useful for hover-doc copy but are not the source of truth for the enum.

### C10 — `now` offset units (LOW)

- **01 §10.2** lists offsets including `µs`/`us` and `y` (year) and `d` (day).
- **05 §5.2** lists `ns, us, ms, s, m, h, d, y` (no `µs`).
- Minor; both are docs-derived and neither was confirmed against `template_helpers.go` for the exact
  accepted unit tokens. **Follow-up: confirm offset tokens against source** before shipping
  offset-token completion/validation (otherwise risk false-positive diagnostics on valid offsets).

---

## 2. Blocking gaps (must be filled before implementation)

### B1 — Per-matcher `value`-type rules are described prose-only, not specified as a validation table the team can code directly.

Both 01 §4 and 02 §3.3 describe value types narratively (e.g. "json: string containing JSON",
"array: string semicolon-split OR string[]"), but there is **no single normative table mapping
{matcher → accepted JSON types → error message}**. Critically, 02 §3.3 says `array`'s value may be a
**string (split on `;`) OR an array**, while 05 §4.3 says `array`'s value is **"array of strings"**
only — a latent contradiction that directly affects the `array`-value diagnostic. The team needs a
decided spec: for each matcher, is the value `string` / `valid-JSON-string` / `string|array` /
`object`, and is a wrong type an error or warning. Resolve `array` per 02 (accept both string and
array) and write the table.

### B2 — Template-string sub-language: parse depth is undecided and under-specified for validation.

03 §5/§8 and 05 §6.2/§8.3 both recommend a template-aware pass, but the two reports **disagree on
rigor**: 05 §8.3 explicitly says "a regex-based tokenizer scanning for `{{[^}]+}}` is sufficient",
while the feature set (helper-name validation, arg-count/type checks, block helpers `{{#if}}…{{/if}}`,
`{{#each}}` with `@index/@last`, nested helper calls like `{{ sum (getArray 'x') }}`) requires real
nesting/balance awareness that a flat regex cannot provide. There is **no helper-arity table** (how
many args each of the 52 helpers takes, which are required) anywhere in the corpus — yet 05 §8.4
rule 6 promises "Request.Body called without required arguments" diagnostics. Decide: tokenizer vs
real Handlebars/raymond-compatible parser, and produce the arity/signature table, before building
`template-refs.ts`. This is the single largest hidden-scope risk in the project.

### B3 — `faker` type enumeration is non-authoritative.

01 §10.4 lists ~30 faker type names but explicitly flags them as "verify against the linked go-fakeit
version before shipping as authoritative"; 05 gives only examples. No report pinned the gofakeit
version Hoverfly vendors or extracted the real accepted `faker` argument set. If the LSP validates
(error) on `faker 'Type'`, it will false-positive. **Decide:** completion-only (no validation) for
faker types, OR pin gofakeit version and extract the list. Until decided, faker validation is
unspecified.

### B4 — Claude Code `.lsp.json` mechanism is asserted without a verifiable citation.

04 §4 describes a "native `.lsp.json` plugin system" with a specific field schema
(`extensionToLanguage`, `diagnostics`, `maxRestarts`, etc.) and even an `claude plugin install`
flow — but provides **no source link** for this exact schema (the References section links
"Claude Code Plugins Reference" and "MCP documentation" generically). 04 itself flags the load-bearing
problem: `extensionToLanguage` keys are real filesystem extensions, so `.hoverfly.json` collapses to
`.json` and **cannot distinguish Hoverfly files by extension** — forcing reliance on server-side
content detection (which then collides with C4's broken `^v\d+$` regex). **Verify the actual current
`.lsp.json` schema and field names against live Claude Code docs before coding the plugin**; treat
04 §4.2's field table as unverified.

### B5 — Server-side content-detection heuristic is inconsistent across reports and partly wrong.

- 04 §5.4 requires `data.pairs` to be an **array** AND `meta.schemaVersion` to match `/^v\d+$/`.
- 05 §8.5 requires only root `data` + `meta` present and `schemaVersion` startsWith `"v"`.
- 02/01 confirm `data.pairs` is **optional** (a valid sim can have empty/absent pairs; globalActions-
  only or literals-only files exist).
  Using 04's heuristic, a valid simulation with no `pairs` (or `schemaVersion:"v5.3"`) is **not
  detected as Hoverfly** and gets no LSP service. **Decide the canonical fingerprint** (recommend:
  `data` and `meta` objects present + `meta.schemaVersion` startsWith `"v"`; do NOT require `pairs`;
  do NOT use `^v\d+$`). This must be settled because three editors (Claude Code, and the fallback paths
  for Zed/IntelliJ) depend on it.

### B6 — Diagnostic severity policy is undecided (error vs warning vs info per rule).

The reports propose many semantic rules (unknown matcher, wrong value type, config-on-non-array,
form-misuse, state cross-refs, version-postdates-field, bodyFile-not-found, Content-Length checks)
but scatter the severities and sometimes conflict: 01 §14 calls unknown matcher an **error**, but
since Hoverfly itself only no-matches (never rejects) an unknown matcher (02 §2), an over-strict
error may surprise users. bodyFile-missing is called a _warning_ (01 §6.3) for good reason. There is
**no consolidated severity table with stable diagnostic codes** (03 §8 asks for `HF001…` codes but
none are assigned). Golden tests (03 §6.2) cannot be written until codes + severities are fixed.
**Produce the diagnostic catalog (code, severity, message template, range target) before semantic work.**

---

## 3. Per-question findings

### (1) Is the simulation schema spec complete enough to write a validator field-by-field? — **YES, via 02.**

02 §1 (Go view structs) + §2 (verbatim `schema.json`, independently reproduced in 05 §4.1) give every
field, type, optional/pointer status, and required-key set. A validator can be written directly from 02. **Caveat:** do NOT use 04 §6.2's hand-rolled schema as the artifact — it is lossy and contradicts
02 (see C5/C6/C7). Use the verbatim official schema. The one genuinely under-specified area is the
**per-matcher value-type table (B1)** — the structural schema is complete, but the semantic value
typing the LSP is supposed to add is prose-only.

### (2) Are matcher types and template functions enumerated exhaustively with value types? — **MATCHERS: yes (02 §3.2, 14 entries). HELPERS: yes for names (02 §4.1, 52). VALUE TYPES: partially (B1).**

Matcher _names_ are exhaustive and authoritative in 02 (and only 02 includes `xmltemplated` and the
`""`-empty-default — C7/C8). Helper _names_ are exhaustive in 02 §4.1. What is **missing**: a
normative matcher-value-type table (B1) and any helper-arity/signature table (B2). Template helper
_argument_ specs do not exist in any report beyond example usage.

### (3) Do docs-based and source-based reports contradict each other? — **YES, 10 contradictions (C1-C10).**

The most damaging are C1 (`form`), C2 (`jsonPartial` casing), C3 (`isGreater` naming), and C4
(`^v\d+$` rejecting `v5.3`). In every case **trust 02 (source)** over 01/04/05 (docs). The docs-based
reports also agree _with each other_ on some wrong facts (C3), which is a trap: cross-doc agreement
is not source corroboration.

### (4) Is the file-activation strategy decided per editor? — **MOSTLY, with one unresolved policy and one unverified mechanism.**

04 §8.2 gives a clean per-editor decision table (VS Code: new `hoverfly-simulation` language ID +
`filenamePatterns`; Zed: `path_suffixes`; IntelliJ: LSP4IJ file-name patterns; Claude Code:
`extensionToLanguage` + content detection) and a canonical `*.hoverfly.json` convention (04 §7).
**Unresolved/blocking:** (a) the content-detection fingerprint is inconsistent and partly wrong
(B5/C4); (b) the Claude Code `.lsp.json` schema is unverified (B4); (c) 05 §8.5 recommends
_heuristic content-based_ activation while 04 §7 recommends _filename-based_ — these are presented as
both-recommended but are different defaults; pick one primary (recommend filename `*.hoverfly.json`
with content-detection as fallback, matching 04). Zed directory-based matching
(`hoverfly/*.json`) is acknowledged as NOT supported by `path_suffixes` and requires Rust code that
04 §2.4 sketches but does not fully implement.

### (5) Any licensing concerns reusing vscode-json-languageservice? — **NO blocking concern.**

`vscode-json-languageservice` is **MIT** (05 §6.1 states MIT; consistent with the upstream
microsoft/vscode-json-languageservice license). The other reused/precedent libs are permissive too:
`yaml-language-server` MIT, `amazon-states-language-service` and `cloudformation-languageserver`
Apache-2.0, the `vscode-languageserver-node` family MIT. All are permissive and compatible with
shipping an open-source or commercial LSP; standard attribution/license-file retention is the only
obligation. **Nice-to-have follow-up:** confirm the chosen project license is compatible (MIT/Apache
both fine) and that bundling (esbuild) preserves the MIT license texts of bundled deps; LSP4IJ is
Apache-2.0 (04 §3.1) and the `zed_extension_api` crate is Apache-2.0/MIT — no copyleft anywhere in
the stack. No GPL/AGPL dependency was identified in any report.

---

## 4. Nice-to-have (non-blocking) follow-ups

- Pin exact versions: 03 recommends `vscode-languageserver@^10` / `vscode-json-languageservice@5.7.x`;
  04 corroborates client `10.0.0`. 03 §3.1 notes yaml-language-server still ships on `@9` — fine, but
  confirm `10.x` server + `vscode-json-languageservice@5.7` interop (types alignment) on a spike.
- 05 §2.3 captured exact Hoverfly **warning strings** (BodyAndBodyFile, Content-Length, etc.) — a
  great source for parity diagnostics, but the team should decide which to mirror and whether
  Content-Length-mismatch (requires computing body length) is in initial scope.
- State cross-referencing (`requiresState` ↔ `transitionsState`, `sequence:` prefix) is well-described
  (01 §7, 05 §8.3) but its diagnostics are speculative ("warn about unreachable states") — scope it
  explicitly; it is value-add, not parity.
- `postServeAction` and faker types are both runtime/external — agree they are completion-only,
  never error-level (05 §3.4, §9 Q2 raises a user-configurable allowlist idea worth adopting).
- Schema-drift CI: 05 §7.2 / §9 Q4 recommend embedding the schema with a `SCHEMA_COMMIT=` constant +
  a drift-check CI job against `master`. Adopt; cheap insurance given Hoverfly's ~monthly cadence.
- `$schema` self-declaration + SchemaStore submission (04 §6, 05 §1.3/§8.2) is a clean zero-install
  win and has no competitor (05 §1 confirms the field is empty). Sequence it first per 04 §8.4.
