# 07 — Normative Matcher Value-Type Table (Gap B1)

**Status:** Authoritative. Verified directly against SpectoLabs/hoverfly Go source on `master`
(fetched from `raw.githubusercontent.com/SpectoLabs/hoverfly/master/...`), not docs.

**Date of verification:** 2026-06-11
**Upstream ref:** `master` branch. Notably includes PR #1210 (`jwtjsonpath` matcher), merged
2025-12-12 (`stuioco` / Tommy Situ) — so this is recent `master`, not an old tag.

---

## 0. Where the truth lives

| Concern                                            | File (permalink to `master`)                                                                                                                                |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Matcher name → function registry                   | [`core/matching/matchers/matchers.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/matching/matchers/matchers.go)                               |
| Matching engine (dispatch, chaining, case-folding) | [`core/matching/field_matcher.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/matching/field_matcher.go)                                       |
| Body / form dispatch                               | [`core/matching/body_formdata_matching.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/matching/body_formdata_matching.go)                     |
| Matcher model (Value/Config/DoMatch)               | [`core/models/request_matcher.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/models/request_matcher.go)                                       |
| Per-matcher implementations                        | `core/matching/matchers/*_match.go`                                                                                                                         |
| Value generators (chaining)                        | [`core/matching/matchers/matcher_value_generator.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/matching/matchers/matcher_value_generator.go) |
| `array` helpers                                    | [`core/util/util.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/util/util.go) (`GetStringArray`, `GetBoolOrDefault`)                          |
| `jwtjsonpath` helper                               | [`core/util/jwt.go`](https://github.com/SpectoLabs/hoverfly/blob/master/core/util/jwt.go) (`ParseJWTComposite`)                                             |

---

## 1. The registry — verbatim

`core/matching/matchers/matchers.go`:

```go
type MatcherFunc func(data interface{}, toMatch string) bool
type MatcherFuncWithConfig func(data interface{}, toMatch string, config map[string]interface{}) bool
type MatcherValueGenerator func(data interface{}, toMatch string) string

var Matchers = map[string]MatcherDetails{
	// Default matcher
	"":           {MatcherFunction: ExactMatch,        MatchValueGenerator: IdentityValueGenerator},
	Exact:        {MatcherFunction: ExactMatch,        MatchValueGenerator: IdentityValueGenerator},
	Glob:         {MatcherFunction: GlobMatch,         MatchValueGenerator: IdentityValueGenerator},
	Json:         {MatcherFunction: JsonMatch,         MatchValueGenerator: IdentityValueGenerator},
	JsonPath:     {MatcherFunction: JsonPathMatch,     MatchValueGenerator: JsonPathMatcherValueGenerator},
	JsonPartial:  {MatcherFunction: JsonPartialMatch,  MatchValueGenerator: IdentityValueGenerator},
	Regex:        {MatcherFunction: RegexMatch,        MatchValueGenerator: IdentityValueGenerator},
	Xml:          {MatcherFunction: XmlMatch,          MatchValueGenerator: IdentityValueGenerator},
	Xpath:        {MatcherFunction: XpathMatch,        MatchValueGenerator: XPathMatchValueGenerator},
	XmlTemplated: {MatcherFunction: XmlTemplatedMatch, MatchValueGenerator: IdentityValueGenerator},
	Array:        {MatcherFunction: ArrayMatchWithoutConfig, MatchValueGenerator: IdentityValueGenerator},
	JWT:          {MatcherFunction: JwtMatcher,        MatchValueGenerator: JwtMatchValueGenerator},
	JWTJsonPath:  {MatcherFunction: JwtJsonPathMatch,  MatchValueGenerator: JwtJsonPathMatchValueGenerator},
	Negation:     {MatcherFunction: NegationMatch,     MatchValueGenerator: IdentityValueGenerator},
}

var MatchersWithConfig = map[string]MatcherDetails{
	Array: {MatcherFunction: ArrayMatch, MatchValueGenerator: IdentityValueGenerator},
}
```

The string constants (defined in each matcher file):

| Go const       | Registry key (exact spelling, lowercase) |
| -------------- | ---------------------------------------- |
| `Exact`        | `exact`                                  |
| `Glob`         | `glob`                                   |
| `Json`         | `json`                                   |
| `JsonPath`     | `jsonpath`                               |
| `JsonPartial`  | `jsonpartial`                            |
| `Regex`        | `regex`                                  |
| `Xml`          | `xml`                                    |
| `Xpath`        | `xpath`                                  |
| `XmlTemplated` | `xmltemplated`                           |
| `Array`        | `array`                                  |
| `JWT`          | `jwt`                                    |
| `JWTJsonPath`  | `jwtjsonpath`                            |
| `Negation`     | `negate`                                 |
| (default)      | `""` (empty string)                      |

> **Note the spelling traps:** the _negate_ matcher's registry key is `negate`, **not** `negation`.
> The const is named `Negation` but its value is `"negate"`. `jsonpartial`, `jsonpath`,
> `jwtjsonpath`, `xmltemplated` are all **single-token, all-lowercase** — no camelCase, no
> separators.

---

## 2. The matching engine — how value/config/doMatch are dispatched

`core/matching/field_matcher.go`, function `isMatching`:

```go
func isMatching(field models.RequestFieldMatchers, toMatch string) bool {
	currentMatcher := field
	actual := toMatch
	result := false
	for {
		var matcherDetails matchers.MatcherDetails
		isMatched := false
		if currentMatcher.Config == nil {
			matcherDetails = matchers.Matchers[strings.ToLower(currentMatcher.Matcher)]
			isMatched = matcherDetails.MatcherFunction.(func(interface{}, string) bool)(currentMatcher.Value, actual)
		} else {
			matcherDetails = matchers.MatchersWithConfig[strings.ToLower(currentMatcher.Matcher)]
			isMatched = matcherDetails.MatcherFunction.(func(interface{}, string, map[string]interface{}) bool)(currentMatcher.Value, actual, currentMatcher.Config)
		}
		if !isMatched {
			return false
		}
		if currentMatcher.DoMatch == nil || matcherDetails.MatchValueGenerator == nil {
			result = isMatched
			break
		}
		actual = matcherDetails.MatchValueGenerator(currentMatcher.Value, actual)
		currentMatcher = *currentMatcher.DoMatch
	}
	return result
}
```

The model that feeds this (`core/models/request_matcher.go`):

```go
type RequestFieldMatchers struct {
	Matcher string
	Value   interface{}        // <-- whatever JSON the user put in "value", decoded by encoding/json
	Config  map[string]interface{}
	DoMatch *RequestFieldMatchers
}
```

### 2a. Case-sensitivity of matcher-name lookup — **CASE-INSENSITIVE**

Both branches look up with `strings.ToLower(currentMatcher.Matcher)`. So `"EXACT"`, `"Exact"`,
`"jSoNpAtH"` all resolve. The registry keys are stored lowercase, so lowercasing the user's
spelling before lookup makes the match work for any casing. **An LSP should still recommend the
canonical lowercase spelling**, but a non-canonical case is _not_ a runtime error.

### 2b. doMatch chaining — **GENERIC, not per-matcher**

Chaining is implemented entirely in the engine loop above, not inside any matcher. After a
successful match, if `DoMatch != nil` **and** the matcher's `MatchValueGenerator != nil`, the
engine computes `actual = MatchValueGenerator(value, actual)` and recurses into `DoMatch` with the
generated value as the new `toMatch`.

Every registered matcher has a **non-nil** `MatchValueGenerator` (most use
`IdentityValueGenerator`). Therefore:

- **Chaining is technically allowed after ANY registered matcher** (the `MatchValueGenerator == nil`
  break clause is effectively dead code today — no entry sets it to nil; the comment in the source
  anticipates nil generators but none exist).
- For matchers whose generator is `IdentityValueGenerator` (`exact`, `glob`, `json`, `jsonpartial`,
  `regex`, `xml`, `xmltemplated`, `array`, `negate`), the generator returns `toMatch` **unchanged**.
  Chaining there just re-runs the next matcher against the _same_ input value — useful for
  AND-combining matchers on one field (e.g. `glob` then `regex` on the same string), not for
  extraction.
- The matchers whose generator actually **transforms/extracts** a value to feed the next link are
  the ones with a non-identity generator:

  | Matcher       | Generator                        | What it feeds into `DoMatch`                                   |
  | ------------- | -------------------------------- | -------------------------------------------------------------- |
  | `jsonpath`    | `JsonPathMatcherValueGenerator`  | the JSONPath query result (string or JSON-marshalled)          |
  | `xpath`       | `XPathMatchValueGenerator`       | the XPath result `.String()`                                   |
  | `jwt`         | `JwtMatchValueGenerator`         | the decoded JWT as composite JSON `{"header":..,"payload":..}` |
  | `jwtjsonpath` | `JwtJsonPathMatchValueGenerator` | JSONPath result over the decoded JWT composite                 |

  These four are the matchers where `doMatch` is genuinely _meaningful as extraction_. The LSP can
  surface this distinction as a hint, but **doMatch is syntactically valid on every matcher**.

### 2c. Config dispatch — **ONLY `array` supports config**

If `Config != nil`, the engine looks up `MatchersWithConfig[lower(name)]`. Only `array` is present
there. For **any other matcher name** with a non-nil `Config`, `MatchersWithConfig[name]` returns a
**zero-value `MatcherDetails`** whose `MatcherFunction` is `nil` → the type assertion + call on line
47 **panics (nil pointer / invalid type assertion)** at request-matching time. This is a real
runtime crash path, not a graceful no-match.

> An empty JSON object `"config": {}` still produces a non-nil `map[string]interface{}{}` after JSON
> decode, so `Config == nil` is **false** — meaning `"config": {}` on a non-array matcher also takes
> the panic branch. The LSP should treat _presence of the `config` key on a non-`array` matcher_ as
> an error regardless of whether the object is empty.

### 2d. Unknown / misspelled matcher name — **runtime PANIC**

With `Config == nil` and an unknown name, `matchers.Matchers[lower(name)]` returns a zero-value
`MatcherDetails` with `MatcherFunction == nil`. Line 43 then does
`matcherDetails.MatcherFunction.(func(interface{}, string) bool)(...)` → nil interface type
assertion → **panic**. So a typo'd matcher name (e.g. `negation`, `jsonPartial` after lowercasing →
`jsonpartial` is fine, but `contains`, `equals`, `form` used as a body sub-matcher value, etc.) is a
hard crash, not a silent miss. **This makes "unknown matcher name" a high-severity LSP diagnostic.**

---

## 3. Per-matcher value-type behaviour (from the `Match` func type switch)

Every simple matcher begins with the identical idiom:

```go
matchString, ok := match.(string)
if !ok {
	return false        // wrong type => NO MATCH (graceful), never a coercion
}
```

So for the string-only matchers, a non-string `value` (number/bool/object/array) is **not an error
and not a panic** — it simply causes the matcher to **always return false** (no match). There is
**no coercion** anywhere (no `fmt.Sprint`, no number→string). The exceptions are `array` (wants a
slice) and `form` (handled outside the registry, wants an object). Details:

### `exact` — `core/matching/matchers/exact_match.go`

```go
func ExactMatch(match interface{}, toMatch string) bool {
	matchString, ok := match.(string)
	if !ok { return false }
	return matchString == toMatch
}
```

**Value type:** string only. Non-string → no match.

### `glob` — `glob_match.go`

String only (`glob.Glob(matchString, toMatch)`). Non-string → no match.

### `regex` — `regex_match.go`

String only. `regexp.MatchString(matchString, toMatch)`; an **invalid regex** returns `err` → matcher
returns false (no match, no panic). So a bad regex pattern silently never matches.

### `json` — `json_match.go`

String only — the `value` must be a **string containing JSON text** (not a JSON object literal). It
fast-paths on raw string equality, else decodes both sides with `json.Decoder` + `UseNumber()` and
compares with `reflect.DeepEqual`. A non-string `value` → no match. A string that is invalid JSON →
decode error → no match.

### `jsonpartial` (`jsonpartial`) — `json_partial_match.go`

String only — `value` is a **string of JSON text** representing the expected subset. Decodes with
`UseNumber()`. Walks all nodes of the actual body; returns true if expected map/array is contained.
Non-string `value` → no match; invalid-JSON string → no match.

### `jsonpath` — `json_path_match.go`

String only — `value` is a **JSONPath query string**. Runs `util.JsonPathExecution`; returns true
iff the path resolves to something other than the literal query (and no error). Non-string → no
match. **Has a non-identity value generator → meaningful `doMatch`.**

### `xml` — `xml_match.go`

String only — `value` is **XML text**. Both sides minified via `util.MinifyXml`, compared with
`reflect.DeepEqual`. Non-string → no match; un-minifiable XML → no match.

### `xpath` — `xpath_match.go`

String only — `value` is an **XPath expression**. `util.XpathExecution(...).Bool()`. Non-string → no
match; error → no match. **Non-identity value generator → meaningful `doMatch`.**

### `xmltemplated` (`xmltemplated`) — `xml_templated_match.go` — **CONFIRMED EXISTS**

String only — `value` is a **templated XML document**. Both expected and actual are parsed into
`etree` DOM trees and compared structurally (`compareTree`). Within leaf text, two template tokens
are honoured:

- `{{ ignore }}` (regex `^\s*{{\s*ignore\s*}}\s*$`) → that leaf's text always matches.
- `{{ regex: PATTERN }}` (regex `^\s*{{\s*regex:(.*)}}\s*$`) → leaf text matched against `PATTERN`
  (compiled at match time; an uncompilable pattern → no match for that leaf).
- otherwise plain-text equality.

Child elements are matched order-independently (each expected child must find one actual child;
leftover actual children → no match). Non-string `value` → no match; unparseable XML on either side
→ no match. Uses `github.com/beevik/etree`.

### `negate` (`negate`) — `negation_match.go`

```go
func NegationMatch(match interface{}, toMatch string) bool {
	matchString, ok := match.(string)
	if ok { return matchString != toMatch }
	return true
}
```

**Asymmetric**: if `value` is a string → matches when `value != toMatch`. If `value` is **NOT** a
string → returns **true (always matches)**. So a non-string value here is not a no-match; it makes
the matcher vacuously pass. Worth a warning in the LSP because it's almost certainly a mistake.

### `array` — `array_match.go` + `util.GetStringArray` — **CONFIRMED dual string/array**

```go
func ArrayMatchWithoutConfig(match interface{}, toMatch string) bool {
	return ArrayMatch(match, toMatch, nil)
}
func ArrayMatch(match interface{}, toMatch string, config map[string]interface{}) bool {
	matchStringArr, ok := util.GetStringArray(match)   // <-- requires a SLICE
	if !ok { return false }
	toMatchArr := strings.Split(toMatch, ";")          // <-- ACTUAL side split on ';'
	ignoreUnknown := util.GetBoolOrDefault(config, "ignoreUnknown", false)
	ignoreOrder := util.GetBoolOrDefault(config, "ignoreOrder", false)
	ignoreOccurrences := util.GetBoolOrDefault(config, "ignoreOccurrences", false)
	return (ignoreUnknown || hasAllKnown(matchStringArr, toMatchArr)) &&
		(ignoreOccurrences || hasSameNoOfOccurrences(matchStringArr, toMatchArr)) &&
		(ignoreOrder || isInSameOrder(matchStringArr, toMatchArr))
}
```

**IMPORTANT CORRECTION to a common assumption.** The split-on-`;` applies to the **incoming request
value** (`toMatch`), **NOT** to the matcher's `value`. The matcher's `value` must be a **JSON array**
(`util.GetStringArray` requires `reflect.Slice`; a plain string is rejected → no match):

```go
func GetStringArray(data interface{}) ([]string, bool) {
	val := reflect.ValueOf(data)
	if val.Kind() != reflect.Slice { return nil, false }   // string => NOT a slice => false
	var dataArr []string
	for i := 0; i < val.Len(); i++ {
		currentValue := val.Index(i)
		if currentValue.Kind() == reflect.Interface {
			dataArr = append(dataArr, currentValue.Elem().String())
		} else {
			dataArr = append(dataArr, currentValue.String())
		}
	}
	return dataArr, true
}
```

So, precisely:

- `array` matcher **value MUST be a JSON array** (e.g. `["a","b","c"]`). A scalar **string** value is
  **rejected → no match** (it is _not_ accepted as a `;`-delimited string — that earlier belief is
  wrong; the `;`-split is on the request side only). Each array element is read via
  `reflect.Value.String()`: non-string elements (numbers/bools) yield `"<int Value>"`-style junk
  rather than the literal, so arrays should contain strings.
- The **request/actual** value is what gets `strings.Split(toMatch, ";")` — i.e. the incoming header
  or query that Hoverfly compares is treated as a `;`-delimited list.

**Config options** (`util.GetBoolOrDefault`, all default `false`; key absent → default; non-bool
value → `genericValue.(bool)` **panics**):

- `ignoreUnknown` — when true, skip the `hasAllKnown` check (actual may contain values not in the
  expected array).
- `ignoreOrder` — when true, skip `isInSameOrder` (order need not match).
- `ignoreOccurrences` — when true, skip `hasSameNoOfOccurrences` (multiplicity need not match).

`array` is the **only** matcher in `MatchersWithConfig`, so it is the only one whose `config` is
honoured. Without config (or `config == nil`) it behaves as all-three-checks-enabled (exact
multiset + order + no-unknowns). Note the scoring quirk: `FieldMatcher` gives `array` **2 points**
(like `exact`) **only when `Config == nil`**; with config it scores 1.

> Config value type trap: `GetBoolOrDefault` does `genericValue.(bool)` with **no `ok` guard**. A
> config like `{"ignoreOrder": "true"}` (string) or `{"ignoreOrder": 1}` (number) **panics** at
> match time. The LSP should require config values to be JSON booleans.

### `jwt` — `jwt_match.go`

String only — `value` is a **string of JSON text** describing the expected `{"header":...,
"payload":...}` subset. The matcher parses the **actual request value** as a JWT (`ParseJWT`: splits
on `.`, requires exactly 3 segments, base64-RawURL-decodes header & payload into a composite JSON
string) and then delegates to `JsonPartialMatch(data, jwt)`. So `value` follows the same rules as
`jsonpartial`: a JSON-text string representing a partial object, e.g.
`'{"payload":{"sub":"1234"}}'`. Non-string value → no match. If the actual value is not a valid
3-part JWT → no match (logged). **Non-identity generator → meaningful `doMatch`** (feeds composite
JSON onward).

### `jwtjsonpath` — `jwt_jsonpath_match.go` (PR #1210) — **CONFIRMED EXISTS**

```go
func JwtJsonPathMatch(match interface{}, toMatch string) bool {
	path, ok := match.(string)
	if !ok || path == "" { return false }
	composite, err := util.ParseJWTComposite(toMatch)
	if err != nil { return false }
	norm := normalizeJWTJsonPath(path)
	norm = util.PrepareJsonPathQuery(norm)
	out, err := util.JsonPathExecution(norm, composite)
	if err != nil || out == norm { return false }
	return true
}
```

**Value type:** string only, AND **must be non-empty** (`path == ""` → no match — stricter than
other string matchers which accept `""`). The `value` is a **JSONPath query**. The actual request
value is decoded by `util.ParseJWTComposite` (3-segment JWT, strips a leading `bearer ` prefix
case-insensitively, base64-RawURL decode of header+payload into `{"header":..,"payload":..}`; bad
token → no match). Path normalisation (`normalizeJWTJsonPath`):

- `$.payload.…` or `$.header.…` → used as-is.
- `$.foo` → rewritten to `$.payload.foo` (payload is the default scope).
- `.foo` → `$.payload.foo`.
- anything else → used verbatim.

**Non-identity generator → meaningful `doMatch`** (feeds JSONPath result onward).

### `form` — **CONFIRMED: NOT in the matcher registry**

`"form"` does **not** appear in `Matchers` or `MatchersWithConfig`. It is a **pseudo-matcher handled
at the body-matching layer**, not via `FieldMatcher`/the registry:

- `core/models/request_matcher.go` `getValueFromMatcherView`: when `matcher.Matcher == "form"`
  (literal, **case-sensitive** comparison), the `value` is interpreted as a
  `map[string]interface{}` where each key is a form-field name and each value is a list of normal
  matcher views; it is re-marshalled into `map[string][]RequestFieldMatchers`.
- `core/matching/body_formdata_matching.go` `BodyMatching`: iterates body fields; if any field has
  `Matcher == "form"`, it calls `processFormMatcher(formMatchers, req.FormData)` — running the
  sub-matchers against the parsed form data per field — and **does not** route to `FieldMatcher`.

Consequences for the LSP:

- `form` is **valid only on the request `body`** matcher list, and **only as a top-level matcher**
  (not inside `doMatch`, not in headers/query/path).
- Its `value` is a **JSON object** (`{ "fieldName": [ {matcher...}, ... ], ... }`), **not** a string.
  Each inner entry is itself a full matcher object (recursively the same value-type rules apply).
- `form` is **case-sensitive**: only the literal lowercase `"form"` is recognised
  (`getValueFromMatcherView`/`BodyMatching` use `==`, not lowercasing — unlike registry lookup). A
  capitalised `"Form"` would fall through to the registry path and **panic** as an unknown matcher.
- If `form` is ever sent on a non-body field, it reaches `FieldMatcher` → registry lookup → unknown →
  **panic**.

---

## 4. NORMATIVE TABLE

`value` "JSON type" = the JSON type the matcher's Go `value` field must have. "Wrong-type behaviour"
= what happens at request-matching runtime when the value is the wrong JSON type. **Recommended
severity** = what an LSP should emit for a _wrong value type_ on that matcher.

| Matcher (registry key)   | Accepted JSON type for `value`           | `config`?                                                             | `doMatch`?               | Wrong-type runtime behaviour                                                                                         | LSP severity (wrong type)                                      |
| ------------------------ | ---------------------------------------- | --------------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `""` (empty / default)   | string (JSON text only if used as exact) | no                                                                    | yes (identity)           | non-string → **no match**                                                                                            | Warning                                                        |
| `exact`                  | string                                   | no                                                                    | yes (identity)           | non-string → **no match**                                                                                            | Warning                                                        |
| `glob`                   | string                                   | no                                                                    | yes (identity)           | non-string → **no match**                                                                                            | Warning                                                        |
| `json`                   | string (containing JSON)                 | no                                                                    | yes (identity)           | non-string → no match; invalid-JSON string → no match                                                                | Warning (type); Hint (invalid JSON)                            |
| `jsonpath`               | string (JSONPath query)                  | no                                                                    | **yes (extracts)**       | non-string → no match                                                                                                | Warning                                                        |
| `jsonpartial`            | string (containing JSON)                 | no                                                                    | yes (identity)           | non-string → no match; invalid-JSON → no match                                                                       | Warning                                                        |
| `regex`                  | string (regex)                           | no                                                                    | yes (identity)           | non-string → no match; invalid regex → no match                                                                      | Warning (type); Warning (invalid regex)                        |
| `xml`                    | string (XML)                             | no                                                                    | yes (identity)           | non-string → no match; bad XML → no match                                                                            | Warning                                                        |
| `xpath`                  | string (XPath)                           | no                                                                    | **yes (extracts)**       | non-string → no match                                                                                                | Warning                                                        |
| `xmltemplated`           | string (templated XML)                   | no                                                                    | yes (identity)           | non-string → no match; bad XML → no match                                                                            | Warning                                                        |
| `array`                  | **array** (JSON array of strings)        | **YES** (`ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`, all bool) | yes (identity)           | non-slice → **no match**; non-bool config value → **PANIC**                                                          | **Error** (non-array value); **Error** (non-bool config value) |
| `jwt`                    | string (JSON text, partial spec)         | no                                                                    | **yes (extracts)**       | non-string → no match; non-JWT actual → no match                                                                     | Warning                                                        |
| `jwtjsonpath`            | string (JSONPath), **non-empty**         | no                                                                    | **yes (extracts)**       | non-string OR empty string → no match; non-JWT actual → no match                                                     | Warning (type); **Error** (empty string)                       |
| `negate`                 | string                                   | no                                                                    | yes (identity)           | non-string → **always matches** (vacuous true)                                                                       | **Error/Warning** (non-string silently inverts logic)          |
| `form` (NOT in registry) | **object** `{field: [matchers...]}`      | no (sub-matchers may)                                                 | no (top-level body only) | wrong field/non-body usage → registry miss → **PANIC**; non-object value → falls back to raw value (likely no match) | **Error** (non-object value; non-body placement)               |

### Cross-cutting LSP diagnostics (independent of the per-matcher type)

| Condition                                                                 | Runtime effect                                     | Recommended severity                                                               |
| ------------------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------- |
| Unknown / misspelled matcher name (e.g. `contains`, `equals`, `negation`) | nil func assertion → **PANIC**                     | **Error**                                                                          |
| `config` key present on any matcher other than `array`                    | `MatchersWithConfig` miss → **PANIC**              | **Error**                                                                          |
| `config` value that is not a JSON boolean (on `array`)                    | `genericValue.(bool)` → **PANIC**                  | **Error**                                                                          |
| Non-canonical case in matcher name (e.g. `Exact`, `JSONPATH`)             | works (engine lowercases)                          | **Info/Hint** (suggest canonical spelling) — except `form` which is case-sensitive |
| `form` written as `Form`/`FORM`                                           | not recognised as form → registry miss → **PANIC** | **Error**                                                                          |
| `doMatch` after an identity-generator matcher                             | works, but re-tests same value (AND semantics)     | **Info** (intentional?) — not an error                                             |
| Empty `value` (`""`) on `jwtjsonpath`                                     | no match                                           | **Error**                                                                          |

---

## 5. Key corrections vs. prior assumptions / docs

1. **`array` does NOT accept a `;`-delimited string in `value`.** `util.GetStringArray` rejects
   non-slices. The `;`-split happens on the **incoming request value** (`toMatch`), not the matcher
   value. The matcher value must be a JSON array. (Source: `array_match.go` line 27 +
   `util.GetStringArray`.)
2. **`form` is not a registry matcher** — it's a body-layer pseudo-matcher, value is an object,
   body-only, case-sensitive literal `"form"`. (Source: `request_matcher.go`,
   `body_formdata_matching.go`.)
3. **`xmltemplated` exists** and supports `{{ ignore }}` and `{{ regex: ... }}` leaf templates with
   order-independent child matching. (Source: `xml_templated_match.go`.)
4. **`jwtjsonpath` exists** (recent, PR #1210) — value is a non-empty JSONPath; defaults to
   `$.payload` scope; strips `bearer ` prefix on the actual token. (Source:
   `jwt_jsonpath_match.go`, `util/jwt.go`.)
5. **Matcher-name lookup is case-insensitive** (engine lowercases). The registry key for the
   negation matcher is **`negate`**, not `negation`.
6. **doMatch chaining is generic**, driven by the engine + each matcher's `MatchValueGenerator`; the
   four extracting matchers are `jsonpath`, `xpath`, `jwt`, `jwtjsonpath`. The "break when generator
   is nil" path is effectively dead code (no registered matcher has a nil generator).
7. **Wrong-type values are mostly graceful no-matches** (string matchers) — but `array` non-bool
   config, unknown matcher names, and `config` on non-array matchers are **hard panics**, and
   `negate` with a non-string value **silently always matches**. These deserve the strongest LSP
   severities.
