# 14 — Matcher Value-SYNTAX Validation Spec (Gap: value-syntax, not just value-type)

**Status:** Authoritative. Verified against SpectoLabs/hoverfly Go source on `master`
(via `raw.githubusercontent.com`) and the exact libraries pinned in its `go.mod`, plus a
ground-truth run against real Hoverfly **v1.12.8** (import + proxy match-time behaviour).

**Date:** 2026-06-11
**Builds on:** report 07 (value _types_ + Go citations), report 02 (registry), report 10 (D4
severity, D8/D9 corrections), report 11 (existing HF1xx–HF6xx codes), report 12 (ground-truth
import behaviour), report 08 (JSONPath/XPath dialect for templating).

## 0. The problem this report closes

Report 07 nails value **TYPE** rules (string vs array vs object → HF203). It does **not** cover
value **SYNTAX**: a value can be the right _type_ (a string) yet be garbage _content_ for that
matcher. The canonical bug (observed in Zed today):

```json
{ "matcher": "jwt", "value": "$.username" }
```

`"$.username"` is a string, so **HF203 passes** — but the `jwt` matcher requires its value to be
a **string of JSON text** describing a partial `{"header":…,"payload":…}` spec (e.g.
`'{"payload":{"username":"alice"}}'`). `"$.username"` is not valid JSON text → the matcher
**silently never matches**. Zero diagnostics today. This is the entire gap.

**The pattern is uniform** (confirmed below): Hoverfly validates value SYNTAX **nowhere at import**
— every malformed value imports HTTP 200 clean — and at match time every malformed value just
makes its matcher `return false` (graceful no-match, no panic). So malformed value syntax is an
**invisible, silent never-match**: strictly worse than a loud rejection, exactly the class the LSP
exists to catch.

**Codes proposed here are ADDITIVE and use a clearly distinct block: `HF230`–`HF236`.**
Report 11 already uses HF201–HF211 (HF2xx matchers), and a parallel in-flight stream is
proposing **HF212+**. To avoid any collision I deliberately start at **HF230** (leaving HF212–HF229
free for the other stream). These slot into the existing **HF2xx — request matchers** group.

---

## 1. Library ground truth (from Hoverfly `go.mod`, `go 1.26.4`)

| Concern              | Library (module path)                                                   | Version    |
| -------------------- | ----------------------------------------------------------------------- | ---------- |
| `regex`              | Go stdlib `regexp` (**RE2**, `regexp.MatchString`)                      | stdlib     |
| `glob`               | `github.com/ryanuber/go-glob`                                           | `v1.0.0`   |
| `json`/`jsonpartial` | Go stdlib `encoding/json` (`json.Decoder` + `UseNumber`)                | stdlib     |
| `jwt` decode         | `encoding/base64` + `encoding/json` (NOT golang-jwt for the match path) | stdlib     |
| `jwtjsonpath`        | `util.ParseJWTComposite` + JSONPath below                               | stdlib + ↓ |
| `jsonpath`           | `k8s.io/client-go/util/jsonpath` (**kubectl dialect**)                  | `v0.35.0`  |
| `xpath`              | `github.com/ChrisTrenkamp/xsel` (exec/grammar/parser)                   | `v0.9.16`  |
| `xml`/`xmltemplated` | `github.com/beevik/etree` (+ minify for `xml`)                          | `v1.6.0`   |

> `golang-jwt/jwt/v4 v4.5.2` is in go.mod but the **matcher** path (`jwt_match.go`) does the JWT
> split/base64/JSON decode by hand (`util/jwt.go`), it does **not** verify signatures. So `jwt`
> value validity = JSON-text validity, nothing crypto.

The JSONPath dialect is confirmed **kubectl** (`k8s.io/client-go/util/jsonpath`), consistent with
report 08 / D8 — NOT Jayway, NOT RFC 9535, NOT oliveagle. This matters: kubectl JSONPath is a
_template_ language (`{…}`-wrapped, supports `range/end`), with different rules than the JSONPath
most TS libraries implement. Source: `core/util/util.go`:

```go
// PrepareJsonPathQuery
if query[0:1] != "{" && query[len(query)-1:] != "}" {
    query = fmt.Sprintf("{%s}", query)        // bare $.foo -> {$.foo}
}
// JsonPathExecution
jsonPath := jsonpath.New("")
err := jsonPath.Parse(matchString)            // parse error -> log + return err
if err == nil { err = jsonPath.Execute(buf, data) }
```

---

## 2. Per-matcher source behaviour on malformed value (all `master`)

Every simple matcher begins `s, ok := match.(string); if !ok { return false }` (the type guard =
HF203 territory). What follows is the **syntax** handling. In all cases an _invalid_ value string
yields **`return false`** — a graceful no-match, **never** a panic, **never** an import error.

| Matcher               | Source file                 | Required value SYNTAX                               | On malformed value                                                      |
| --------------------- | --------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------- |
| `regex`               | `regex_match.go`            | a Go **RE2** pattern                                | `regexp.MatchString` returns `err` → `return false` (recompiled/call)   |
| `glob`                | `glob_match.go`             | a glob string (`*` wildcard only, ryanuber)         | **cannot be malformed** — go-glob never errors (see §3.2)               |
| `json`                | `json_match.go`             | string of **JSON text**                             | `json.Decoder.Decode` err → `return false`                              |
| `jsonpartial`         | `json_partial_match.go`     | string of **JSON text** (expected subset)           | decode err on either side → `return false`                              |
| `jwt`                 | `jwt_match.go`              | string of **JSON text** (partial `header/payload`)  | value→`JsonPartialMatch`; bad JSON → `return false` (**the bug**)       |
| `jwtjsonpath`         | `jwt_jsonpath_match.go`     | **non-empty** kubectl **JSONPath**                  | `path==""`→false; parse err in `JsonPathExecution` → `return false`     |
| `jsonpath`            | `json_path_match.go` + util | kubectl **JSONPath** expression                     | `jsonPath.Parse` err → log + `return false`                             |
| `xpath`               | `xpath_match.go` + util     | an **XPath** expression (xsel grammar)              | `XpathExecution` returns err → log + `return false`                     |
| `xml`                 | `xml_match.go`              | **well-formed XML** text                            | `util.MinifyXml` err → `return false`                                   |
| `xmltemplated`        | `xml_templated_match.go`    | well-formed XML + `{{ignore}}`/`{{regex:…}}` leaves | etree parse err → `return false`; bad leaf `{{regex:}}` → leaf no-match |
| `array`               | `array_match.go` + util     | JSON array of **strings** (see §3.8)                | non-slice → false (HF203); element types: see §3.8                      |
| `exact`,`negate`,`""` | exact/negation_match.go     | any string (no internal syntax)                     | n/a — no syntax to be malformed                                         |

Key code citations (verbatim, condensed):

```go
// regex_match.go
func RegexMatch(match interface{}, toMatch string) bool {
    s, ok := match.(string); if !ok { return false }
    matched, err := regexp.MatchString(s, toMatch)
    if err != nil { return false }          // invalid RE2 -> silent no-match
    return matched
}
// json_path_match.go
func JsonPathMatch(match interface{}, toMatch string) bool {
    s, ok := match.(string); if !ok { return false }
    r, err := util.JsonPathExecution(util.PrepareJsonPathQuery(s), toMatch)
    if err != nil { return false }          // invalid JSONPath -> silent no-match
    return r != s
}
// jwt_jsonpath_match.go
if !ok || path == "" { return false }       // empty JSONPath -> silent no-match (stricter)
```

---

## 3. Per-matcher SYNTAX detail + LSP validation strategy (the deliverable)

Pure-JS / zero-native-dep libraries only (D6 forbids native build deps in the bundle). The guiding
rule from D4: **error** = will never match / crashes; **warning** when we're confident it's a
mistake but a dialect edge could make us wrong; **stay silent** wherever a false positive is
plausible.

### 3.1 `regex` — RE2, NOT JavaScript RegExp (the hardest, highest-value check)

**Required syntax:** a Go **RE2** pattern (`regexp.MatchString`, recompiled per match call).
RE2 ≠ JS `RegExp`. The differences that matter:

| Construct                        | RE2 (Hoverfly)           | JS `RegExp`                        | Validation hazard                          |
| -------------------------------- | ------------------------ | ---------------------------------- | ------------------------------------------ |
| Lookahead `(?=)` `(?!)`          | **invalid**              | valid                              | JS-validate would miss it (false negative) |
| Lookbehind `(?<=)` `(?<!)`       | **invalid**              | valid (modern JS)                  | same                                       |
| Backreferences `\1`, `\k<n>`     | **invalid**              | valid                              | same                                       |
| Named group `(?P<name>…)`        | **valid** (Python-style) | **invalid** (JS uses `(?<name>…>`) | JS-validate would FALSE-POSITIVE here      |
| Named group `(?<name>…>`         | invalid                  | valid                              | RE2 rejects; JS accepts                    |
| Possessive `a++`, atomic `(?>…)` | invalid                  | invalid                            | both reject (safe to flag)                 |

So **validating a Hoverfly regex with JavaScript's `new RegExp()` is unsound in both directions**:
it accepts lookarounds/backrefs RE2 rejects, and it rejects `(?P<name>…)` RE2 accepts. A naive
`try { new RegExp(v) }` would emit **false positives** on perfectly valid Hoverfly patterns.

**Recommended strategy — validate with a real RE2 engine in pure JS:**

- Use **`re2js`** (`le0pard/re2js`, the JS port of Google's RE2J). **Pure JavaScript, no native
  build** (unlike `node-re2`/`uhop` which needs node-gyp, and unlike the C++ `re2` pkg). It is the
  RE2 syntax/semantics, so `RE2JS.compile(pattern)` throws iff RE2 would reject the pattern.
  → Wrap in `try { RE2JS.compile(value) } catch { emit HF230 }`. This gives **zero false positives**
  for the syntax question (it _is_ the same grammar Hoverfly uses).
- **Caveat to verify at implementation:** RE2J/`re2js` historically forbids lookbehind but newer
  re2js added captureless-lookbehind support — Go's `regexp` does **not** support lookbehind at all.
  If `re2js` ever _accepts_ a construct Go rejects, we'd get a false negative (miss), never a false
  positive. Acceptable. (Pin the `re2js` version and add a golden test asserting it rejects
  `(?<=x)y` and `(?=x)` and `\1`, and accepts `(?P<n>x)`.)
- **Fallback if we don't want the `re2js` dependency:** flag **only** patterns that are invalid in
  **both** dialects (compile-fails under `new RegExp` AND under a tiny RE2-construct denylist). Then
  separately, as a **warning** (not error), flag RE2-known-invalid constructs by regex-scan:
  lookahead `(?=`/`(?!`, lookbehind `(?<=`/`(?<!`, backref `\[1-9]` / `\k<`. This is more code and
  slightly less precise → prefer `re2js`.

**Diagnostic:** value compiles-fails under RE2 → **HF230 (Error)** "this matcher never matches".
**MUST stay silent on:** any pattern `re2js` accepts. Do **not** add JS-only "improvements". In the
fallback mode, **MUST NOT** flag `(?P<name>…)` (RE2-valid) and **MUST NOT** error on lookarounds —
warn at most, because a future Hoverfly could change engines (low risk, but warning is the honest
severity if we can't run a true RE2 checker).

Also relevant: **HF601** (report 11) already validates `globalActions.delays[].urlPattern` /
`delaysLogNormal[].urlPattern` as RE2 regex — the **same `re2js` validator should be reused there**
(report 11's HF601 note "Invalid pattern" can share this engine). One regex validator, two call
sites.

### 3.2 `glob` — ryanuber/go-glob, no invalid syntax exists

**Required syntax:** ryanuber `go-glob` is dead simple: only `*` is special (matches any run of
chars, including empty); everything else is literal. There are **no character classes, no `?`, no
`[...]`, no escaping** — `*` is the _only_ metacharacter, and `glob.Glob` is pure string scanning
that **cannot error or be malformed**. (Source: `glob_match.go` calls `glob.Glob(s, toMatch)`
which returns a single `bool`, no error.)

**LSP strategy:** **NO syntax diagnostic.** There is nothing to validate. (Optional **Hint** only:
if a value contains `?` / `[` / `\` the author may _think_ they're writing extended globs; those
are treated literally. This is low-value and could annoy — recommend **NOT shipping** it in v1.)

**MUST stay silent.** Shipping any "invalid glob" error here would be 100% false positives.

### 3.3 `json` & `jsonpartial` — value must be a JSON-text string

**Required syntax:** the _string_ `value` must itself parse as JSON. (`json.Decoder.Decode` /
`UseNumber()`.) Note the subtlety the JSON Language Service won't catch: `value` is a **JSON string
literal whose _contents_ are JSON** — e.g. `"value": "{\"a\":1}"`. The outer doc is valid JSON; the
_inner_ string is what must also be valid JSON, and the JSON LS does not look inside string values.

**LSP strategy:** `JSON.parse(value)` (the string contents). On throw → diagnostic. **Zero
false-positive risk** — `JSON.parse` is the same `encoding/json` grammar for the partial-spec use
(both are strict JSON). One nuance: Go's `UseNumber()` and JS `JSON.parse` agree on what _parses_;
they differ only on number representation, which doesn't affect parse-success. Safe.

**Diagnostic:** **HF231 (Error)** — `json`/`jsonpartial`/`jwt` value is not valid JSON text →
never matches.

### 3.4 `jwt` — THE MOTIVATING BUG — same JSON-text rule as jsonpartial

**Required syntax:** `value` is a **string of JSON text** representing a partial
`{"header":{…},"payload":{…}}` spec (delegated to `JsonPartialMatch` against the decoded JWT
composite — `jwt_match.go`). So the value validity check is **identical to `jsonpartial`**:
`JSON.parse(value)` must succeed.

`"$.username"` fails `JSON.parse` → it's the JSONPath-shaped mistake (the user wanted `jwtjsonpath`,
or wanted `{"payload":{"username":…}}`). **This is the case HF231 catches** and the whole reason
for this report.

**Extra warning (HF234):** even when the JSON parses, if the top-level object has keys **other than**
`header`/`payload`, the spec can't match a JWT composite (the composite only has those two keys). E.g.
`{"username":"alice"}` parses fine but will never match — it should be
`{"payload":{"username":"alice"}}`. Recommend a **Warning** (not error) because a user _could_
legitimately write `{}` (matches any JWT) and we don't want to over-constrain. (Source: composite is
exactly `{"header":…,"payload":…}` in `util/jwt.go`.)

**Ground truth (this run, Hoverfly v1.12.8):**

- `jwt` value `"$.username"` + a real JWT header `Authorization` → request returns **HTTP 502**
  ("Could not find a match…", closest-match diagnostic body says `did not match on … [headers]`).
  No crash; admin API stayed 200.
- `jwt` value `'{"payload":{"username":"alice"}}'` + same JWT → **HTTP 202** (matched).
  → Decisive: same input, valid spec matches, `$.username` silently doesn't. Exactly the bug.

### 3.5 `jsonpath` & `jwtjsonpath` — kubectl JSONPath, partial TS validation only

**Required syntax:** a **kubectl** JSONPath expression (`k8s.io/client-go/util/jsonpath`). Hoverfly
auto-wraps a bare query in `{…}` (`PrepareJsonPathQuery`). The kubectl dialect:

- `$` is **optional** (root assumed). `$.a.b`, `.a.b`, `{.a.b}` all legal.
- Supports `.field`, `['field']`, `[0]`, `[*]`, `[0:2]`, negative indices, `..recursive`,
  `[?(@.x=="y")]` filters, `{range .items[*]}…{end}` (range/end — irrelevant for matchers but
  parseable), `,`-unions.
- `jwtjsonpath` additionally: **value must be non-empty** (`path==""`→no-match), and the path is
  normalized so `$.foo` → `$.payload.foo` (payload default scope) — see report 07 §3 `jwtjsonpath`.

**LSP strategy — there is NO pure-JS kubectl-JSONPath parser.** The popular TS libs (`jsonpath`,
`jsonpath-plus`, `JSONPath`) implement Goessner/Jayway/RFC-9535 dialects, which **disagree** with
kubectl on several constructs (kubectl's `range/end`, its `{}` wrapping, `..` recursion edge cases,
filter syntax). Validating with any of them risks **false positives** (flagging kubectl-valid
queries the TS lib's grammar rejects, and vice-versa). **Do NOT run a full JSONPath parser.**

Recommended: a **conservative structural lint only**, emitting at **Warning** (or Information),
covering things that are _unambiguously_ broken in _every_ JSONPath dialect including kubectl:

- unbalanced `[` / `]`, `(` / `)`, `{` / `}`,
- unbalanced quotes (`'`/`"`) inside `[...]`,
- empty string value (for `jwtjsonpath` specifically — that's a guaranteed no-match → **Error**,
  and overlaps the existing **HF211** "empty value" from report 11; defer to HF211 there, don't
  double-flag).

**Diagnostic:** **HF232 (Warning)** — `jsonpath`/`jwtjsonpath` value has unbalanced brackets/quotes
(structurally invalid in any JSONPath dialect). Severity Warning, not Error, because our checker is
a heuristic subset, not the real kubectl grammar.

**MUST stay silent on:** anything with balanced delimiters. Do **not** attempt to validate
field/filter semantics, `range/end`, recursion, or dialect-specific operators — too high a
false-positive risk against the kubectl engine. (If a true pure-JS kubectl-JSONPath parser ever
appears, upgrade HF232 to Error. None exists today.)

### 3.6 `xpath` — xsel grammar, balance-only lint

**Required syntax:** an XPath expression parsed by `github.com/ChrisTrenkamp/xsel` (XPath 1.0-ish
grammar via its `grammar`/`parser` subpackages). Invalid expression → `XpathExecution` logs +
returns err → matcher `return false`.

**LSP strategy:** like JSONPath, **no lightweight pure-JS XPath _parser_ matches xsel's grammar
without risk.** `fontoxpath` is a full XPath 3.1 engine — **heavy** (large bundle) and a _different_
(newer) grammar than xsel's 1.0, so it would both miss xsel-invalid cases and reject xsel-valid
ones → false positives. **Do NOT bundle fontoxpath.**

Recommended: **balance-only sanity lint** at **Warning** — unbalanced `[`/`]`, `(`/`)`, unbalanced
`'`/`"`. Nothing semantic.

**Diagnostic:** **HF233 (Warning)** — `xpath` value has unbalanced brackets/quotes. Stay silent on
everything else.

### 3.7 `xml` & `xmltemplated` — well-formed XML, parseable in pure JS

**Required syntax:** `value` must be **well-formed XML** (beevik/etree parse; `xml` additionally
minifies). `xmltemplated` additionally honours two leaf tokens — `{{ ignore }}`
(regex `^\s*{{\s*ignore\s*}}\s*$`) and `{{ regex: PATTERN }}` (regex `^\s*{{\s*regex:(.*)}}\s*$`);
the `PATTERN` is compiled **at match time** (RE2) and an uncompilable pattern makes that leaf
never match (report 07 §3 `xmltemplated`).

**LSP strategy:** XML well-formedness **is** safely checkable in pure JS:

- Use a tolerant pure-JS XML parser such as **`fast-xml-parser`** (has a `XMLValidator.validate()`
  that returns structured errors; pure JS, no native deps) or `@xmldom/xmldom`'s error-collecting
  parse. Prefer `fast-xml-parser`'s validator (purpose-built for "is this well-formed?", returns
  `true` or an error object). **Low false-positive risk** — XML well-formedness is well-defined.
  - **For `xmltemplated`:** strip/neutralize the `{{ ignore }}` and `{{ regex: … }}` tokens **before**
    validating (replace them with a placeholder text node), because `{{` `}}` and unescaped regex
    chars (`<`, `&`) inside `{{ regex: … }}` could otherwise trip a strict XML validator. Validate
    the _XML skeleton_, not the template tokens. Then **additionally** RE2-validate each
    `{{ regex: PATTERN }}` PATTERN with the §3.1 `re2js` validator (reuse) → if PATTERN is invalid
    RE2, that leaf never matches → **HF230** (same code as regex; it _is_ a regex).
- Watch beevik/etree vs strict-XML edge cases: etree is fairly permissive. To avoid false positives,
  configure the validator to be **lenient** (don't enforce a single root if Hoverfly doesn't —
  verify; etree's `ReadFromString` does expect a document). Recommend shipping XML well-formedness as
  a **Warning** initially (not Error) until a golden corpus confirms etree and the JS validator agree
  on edge cases (DOCTYPE, namespaces, CDATA, processing instructions).

**Diagnostic:** **HF234 (Warning)** — `xml`/`xmltemplated` value is not well-formed XML →
never matches. (And reuse **HF230** for a bad `{{ regex: … }}` pattern inside `xmltemplated`.)

> Note: HF234 number is shared above between the jwt-extra-keys warning (§3.4) and XML; in the final
> table below they are split — **see §4 for the authoritative code→meaning assignment** (jwt extra
> keys = HF235; XML well-formedness = HF234).

### 3.8 `array` — element type, beyond HF203

**Required syntax:** `value` must be a JSON **array** (HF203 covers non-array). Per report 07,
elements are read via `reflect.Value.String()`: a **non-string element** (number/bool/null/object)
does **not** stringify to its literal — it yields Go junk like `"<float64 Value>"`, so the element
effectively never matches its intended token. So: array elements **should all be JSON strings**.

**LSP strategy:** walk the array; if any element is not a JSON string → diagnostic. Trivially
checkable on the AST, **zero false-positive risk** (it's a pure structural fact).

**Diagnostic:** **HF236 (Warning)** — `array` element {i} is not a string; Hoverfly stringifies it
to a non-literal and it will not match as written. Warning (not Error) because the array as a whole
_can_ still match its string elements; only the non-string element is dead. (This is a finer-grained
sibling of HF203, which only checks the top-level array-vs-not. If the team prefers, fold it into
HF203's message instead — but a distinct code keeps HF203 about the _container_ type and HF236 about
_element_ types.)

---

## 4. NORMATIVE TABLE — proposed diagnostics (additive, HF230–HF236)

All: `source:"hoverfly"`, `codeDescription.href: https://hoverfly-lsp.dev/diagnostics/hf23x`.
Range = the matcher's **value node** (smallest node the user must change), per report 11's targeting
rule. Severity per D4: **Error** = guaranteed silent never-match we can prove with zero false
positives; **Warning** = mistake but our checker is a heuristic / dialect uncertainty.

| Code  | Sev   | Matcher(s)                                                | Trigger (value SYNTAX)                                            | Validation lib / approach (pure-JS)              | FP risk  | Message draft                                                                                  |
| ----- | ----- | --------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------- |
| HF230 | **E** | `regex`, `xmltemplated` `{{regex:}}`, _(reuse for HF601)_ | Value is not a valid **RE2** pattern (RE2 ≠ JS RegExp)            | **`re2js`** `RE2JS.compile()` (true RE2 grammar) | **zero** | `Invalid RE2 regex — Hoverfly (Go regexp) silently never matches this`                         |
| HF231 | **E** | `json`, `jsonpartial`, `jwt`                              | Value string does not parse as JSON                               | `JSON.parse(value)` on the string contents       | zero     | `"{name}" value must be JSON text; this is not valid JSON, so the pair never matches`          |
| HF232 | **W** | `jsonpath`, `jwtjsonpath`                                 | Structurally broken JSONPath (unbalanced `[]`/`()`/`{}`/quotes)   | hand lint (balance check only — NO full parser)  | low      | `JSONPath has unbalanced brackets or quotes`                                                   |
| HF233 | **W** | `xpath`                                                   | Structurally broken XPath (unbalanced `[]`/`()`/quotes)           | hand lint (balance check only — NO fontoxpath)   | low      | `XPath has unbalanced brackets or quotes`                                                      |
| HF234 | **W** | `xml`, `xmltemplated`                                     | Value is not well-formed XML (after neutralizing template tokens) | **`fast-xml-parser`** `XMLValidator.validate()`  | low      | `"{name}" value is not well-formed XML; this pair never matches`                               |
| HF235 | **W** | `jwt`                                                     | JSON parses but top-level keys ∉ {`header`,`payload`}             | `JSON.parse` + key check                         | zero     | `jwt value should be a partial {"header":…,"payload":…} spec; key "{k}" can never match a JWT` |
| HF236 | **W** | `array`                                                   | An array element is not a JSON string                             | AST walk                                         | zero     | `array element {i} is not a string; Hoverfly cannot match a non-string element as written`     |

**Severity rationale (D4):** HF230/HF231 are **Error** — we can prove with **zero false positives**
(true RE2 engine; strict JSON parse) that the pair can **never** match. HF232/HF233 are **Warning**
because our bracket/quote lint is a heuristic subset of the real kubectl-JSONPath / xsel-XPath
grammars (we _cannot_ prove never-match without the real engine, and we must not false-positive).
HF234 starts **Warning** pending a golden corpus confirming the JS XML validator agrees with
beevik/etree on edge cases (CDATA/namespaces/PI/DOCTYPE), then can be promoted to Error.
HF235/HF236 are **Warning** (the matcher can still partially match; only some content is dead).

### Interplay with existing codes (no overlap)

- **HF203** (value _type_): fires first; HF23x only fire when the value is the correct _type_ (a
  string, or for `array` a JSON array). Suppress HF23x on a node already carrying HF203 (avoid
  double-flagging) — same "more specific wins" rule as HF102 suppression in report 11.
- **HF211** (empty value never matches): the empty-string case for `jwtjsonpath`/`regex`/`glob`
  is **already owned by HF211**. HF230/HF232 must **not** also fire on an empty string — defer to
  HF211.
- **HF601** (delay urlPattern regex): **reuse the HF230 `re2js` validator engine** — one regex
  checker, two surfaces (report 11 D9 confirmed both delay arrays use RE2).

---

## 5. Ground-truth run (real Hoverfly v1.12.8, this report)

Setup: `hoverfly` (admin :8888, proxy :8500), simulate mode, `matchingStrategy: strongest`. Each
malformed-value sim imported via `PUT /api/v2/simulation`; matches fired through the proxy.
**Cleanup done** (`pkill hoverfly` / `hoverctl stop`, tmp dir removed).

**Import phase — every malformed value imports HTTP 200 clean (no syntax validation at import):**

| Case                                                             | Import |
| ---------------------------------------------------------------- | ------ |
| `regex` value `"a(b"` (uncompilable)                             | 200    |
| `regex` value `"(?<=foo)bar"` (RE2-invalid lookbehind, JS-valid) | 200    |
| `jwt` value `"$.username"` (the bug)                             | 200    |
| `json` value `"{not valid json"`                                 | 200    |
| `jsonpath` value `"$$$[broken"`                                  | 200    |
| `xml` value `"<a><b></a>"` (malformed)                           | 200    |
| `xpath` value `"//[broken("`                                     | 200    |
| `jsonpartial` value `"{broken"`                                  | 200    |

→ Confirms: **value SYNTAX is validated nowhere at import.** (Consistent with report 12's finding
that HF201/HF203/HF211 are lint-only.)

**Match phase — decisive A/B (same request, valid vs malformed value):**

| Pair                                              | Request                         | Result                                        |
| ------------------------------------------------- | ------------------------------- | --------------------------------------------- |
| `regex` value `"^/aXb$"` (valid) on `path`        | GET `/aXb`                      | **200** `VALIDRX-MATCHED`                     |
| `regex` value `"^/a(b$"` (uncompilable) on `path` | GET `/a(b`                      | **502** no-match (closest-match body)         |
| `jwt` value `'{"payload":{"username":"alice"}}'`  | GET `/good` + JWT header        | **202** matched                               |
| `jwt` value `"$.username"`                        | GET `/broken` + same JWT header | **502** no-match (`did not match: [headers]`) |

In **every** malformed case: Hoverfly returns the proxy "no match found" **502** with a
_closest-match diagnostic_ body, the admin API stays **200**, and the **process never crashes**
(no panic, no 500-at-match). This nails the behaviour class: **malformed value SYNTAX → silent
graceful never-match.** Invisible to the user, invisible at import — precisely the gap HF230–HF236
fill.

> Tooling note for reproducers: this Hoverfly build returns "Empty reply"/connection-close for some
> `destination`- and `query`-matcher pairs under `curl -w` (a transport quirk, not a Hoverfly logic
> result). The `path`/`headers`-field A/B tests above are clean and decisive; rely on those.

---

## 6. Recommended libraries (pure-JS, zero native deps — D6 compliant)

| Purpose              | Library                                | Why                                                                           |
| -------------------- | -------------------------------------- | ----------------------------------------------------------------------------- |
| RE2 regex validation | **`re2js`** (`le0pard/re2js`)          | Pure-JS RE2J port = **the same grammar Hoverfly uses**; zero FP. No node-gyp. |
| JSON-text validation | **native `JSON.parse`**                | Same strict JSON grammar as `encoding/json` for parse-success. No dep.        |
| XML well-formedness  | **`fast-xml-parser`** (`XMLValidator`) | Pure-JS, purpose-built validator returning structured errors; no native deps. |
| JSONPath / XPath     | **none** (hand-rolled balance lint)    | No pure-JS lib matches kubectl-JSONPath or xsel-XPath grammar → would FP.     |

**Explicitly DO NOT ship / DO NOT bundle:**

- **`node-re2` / `re2` (C++)** — native build (node-gyp), breaks the single-bundle distribution (D7).
  Use `re2js` instead.
- **`new RegExp()` as the regex validator** — unsound for RE2 (false-positives `(?P<n>)`,
  false-negatives lookarounds/backrefs). Never use it to _validate_ Hoverfly regex.
- **`fontoxpath`** for XPath — heavy, wrong grammar version (3.1 vs xsel 1.0) → false positives.
- **Any Goessner/Jayway/RFC-9535 JSONPath lib** (`jsonpath`, `jsonpath-plus`) as a _validator_ — wrong
  dialect vs kubectl → false positives.

---

## 7. Checks recommended NOT to ship (false-positive risk) — explicit silence list

1. **Glob "invalid syntax"** — go-glob has no invalid syntax (only `*` is special). Any glob error
   would be 100% false positive. **No diagnostic.** (At most a low-value Hint about `?`/`[` being
   literal — recommend omitting in v1.)
2. **Full JSONPath semantic validation** — no pure-JS kubectl-dialect parser exists; full validation
   FPs against kubectl. Ship only the **balance lint (HF232, Warning)**, nothing semantic.
3. **Full XPath validation** — same reasoning; ship only **balance lint (HF233, Warning)**, never a
   full engine.
4. **Regex via `new RegExp`** — must use `re2js`, not JS RegExp. Without `re2js`, downgrade HF230 to
   "invalid in both dialects" + RE2-construct **warnings**, and **stay silent** on `(?P<name>…)` and
   on lookarounds-as-errors.
5. **XML strictness beyond well-formed** — do not enforce single-root/namespace/DTD rules Hoverfly
   (etree) doesn't; keep HF234 a **Warning** until a golden corpus confirms etree↔JS agreement.

---

## 8. Summary

- **Confirmed (Go source + go.mod + live v1.12.8):** Hoverfly validates matcher value **SYNTAX**
  nowhere at import; every malformed value is a **silent graceful never-match** at proxy time
  (502 "no match", no panic, process healthy). The `jwt` `$.username` case reproduces exactly.
- **7 additive diagnostics, HF230–HF236** (deliberately starting at HF230 to leave HF212–HF229 for
  the parallel HF212+ stream), slotting into the existing HF2xx matcher group.
- **Two Error-grade checks with zero false positives** (HF230 RE2 via `re2js`; HF231 JSON via
  `JSON.parse`), **five Warning-grade** (heuristic / dialect-uncertain / partially-dead-value).
- **Libs:** `re2js` (regex), native `JSON.parse` (json/jwt), `fast-xml-parser` (xml) — all pure-JS,
  no native deps. Reuse the `re2js` engine for HF601 and for `xmltemplated` `{{regex:}}` leaves.
- **Stay silent:** glob entirely; JSONPath/XPath beyond bracket/quote balance; never validate
  Hoverfly regex with `new RegExp`.
