# Hoverfly Source Truth — Authoritative Reference for the LSP

> Research target: `SpectoLabs/hoverfly` Go source, the v5 simulation JSON format, matcher
> registry, response templating helpers, schema version handling, and doc/source discrepancies.
> All findings below were extracted from the `master` branch raw source on GitHub unless noted.
> Latest released version: **v1.12.8** (published 2026-05-31). `master` is **10 commits ahead**
> of `v1.12.8` (CI/dependency/Go-version bumps only — no simulation-format changes; see §8).

---

## 0. Quick map of source files

| Concern                                             | File (path under repo root)                       |
| --------------------------------------------------- | ------------------------------------------------- |
| Top-level view structs + version routing/validation | `core/handlers/v2/simulation_views.go`            |
| V5 view structs (current format)                    | `core/handlers/v2/simulation_views_v5.go`         |
| V1/V2/V3/V4 legacy view structs                     | `core/handlers/v2/simulation_views_v{1,2,3,4}.go` |
| Upgrade functions (v1→v5, v2→v5, v4→v5)             | `core/handlers/v2/simulation_views_upgrade.go`    |
| Semantic validation (beyond JSON schema)            | `core/handlers/v2/simulation_views_validation.go` |
| Embedded JSON Schema (verbatim in §2)               | `core/handlers/v2/schema.json`                    |
| Matcher registry + dispatch                         | `core/matching/matchers/matchers.go`              |
| Individual matchers                                 | `core/matching/matchers/<name>_match.go`          |
| Templating engine + helper registration             | `core/templating/templating.go`                   |
| Helper implementations                              | `core/templating/template_helpers.go`             |
| Datasource (CSV / SQL-over-CSV) helpers             | `core/templating/datasource*.go`                  |
| Docs (reStructuredText)                             | `docs/pages/**`                                   |

Raw URL pattern used throughout:
`https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/<path>`

---

## 1. Simulation V5 view structs (the JSON shape)

Current schema version string emitted by Hoverfly: **`v5.3`** (set in `NewMetaView`).

### 1.1 Top-level

```go
// simulation_views_v5.go
type SimulationViewV5 struct {
    DataViewV5 `json:"data"`
    MetaView   `json:"meta"`
}

type DataViewV5 struct {
    RequestResponsePairs []RequestMatcherResponsePairViewV5 `json:"pairs"`
    GlobalActions        GlobalActionsView                  `json:"globalActions"`
    GlobalLiterals       []GlobalLiteralViewV5              `json:"literals,omitempty"`
    GlobalVariables      []GlobalVariableViewV5             `json:"variables,omitempty"`
}
```

Both embedded structs are **value (non-pointer)** anonymous fields, so JSON requires top-level
keys `data` and `meta` (both `required` in the schema).

### 1.2 Meta + global actions

```go
// simulation_views.go
type MetaView struct {
    SchemaVersion   string `json:"schemaVersion"`
    HoverflyVersion string `json:"hoverflyVersion"`
    TimeExported    string `json:"timeExported"`
}

func NewMetaView(version string) *MetaView {
    return &MetaView{
        HoverflyVersion: version,
        SchemaVersion:   "v5.3",
        TimeExported:    time.Now().Format(time.RFC3339),
    }
}

type GlobalActionsView struct {
    Delays          []v1.ResponseDelayView          `json:"delays"`
    DelaysLogNormal []v1.ResponseDelayLogNormalView `json:"delaysLogNormal"`
}
```

> NOTE: `MetaView` fields have **no `omitempty`** in the Go struct, but the JSON Schema only marks
> `schemaVersion` as `required` (so `hoverflyVersion`/`timeExported` are optional on input).

`ResponseDelayView` (delay) fields: `delay` (int), `httpMethod` (string), `urlPattern` (string).
`ResponseDelayLogNormalView` (delay-log-normal) fields: `min`, `max`, `mean`, `median` (all int),
`httpMethod` (string), `urlPattern` (string).

### 1.3 Pair / request matcher

```go
type RequestMatcherResponsePairViewV5 struct {
    Labels         []string              `json:"labels,omitempty"`
    RequestMatcher RequestMatcherViewV5  `json:"request"`
    Response       ResponseDetailsViewV5 `json:"response"`
}

type RequestMatcherViewV5 struct {
    Path          []MatcherViewV5             `json:"path,omitempty"`
    Method        []MatcherViewV5             `json:"method,omitempty"`
    Destination   []MatcherViewV5             `json:"destination,omitempty"`
    Scheme        []MatcherViewV5             `json:"scheme,omitempty"`
    Body          []MatcherViewV5             `json:"body,omitempty"`
    Headers       map[string][]MatcherViewV5  `json:"headers,omitempty"`
    Query         *QueryMatcherViewV5         `json:"query,omitempty"`   // POINTER
    RequiresState map[string]string           `json:"requiresState,omitempty"`
}

type QueryMatcherViewV5 map[string][]MatcherViewV5
```

Field-level matcher object — this is the unit the LSP must validate/autocomplete most heavily:

```go
type MatcherViewV5 struct {
    Matcher string                 `json:"matcher"`           // required, registry name string
    Value   interface{}            `json:"value"`             // type depends on matcher (§3)
    Config  map[string]interface{} `json:"config,omitempty"`
    DoMatch *MatcherViewV5         `json:"doMatch,omitempty"` // POINTER — matcher chaining
}
```

Globals:

```go
type GlobalVariableViewV5 struct {
    Name      string        `json:"name"`
    Function  string        `json:"function"`            // a templating helper name (§4)
    Arguments []interface{} `json:"arguments,omitempty"`
}

type GlobalLiteralViewV5 struct {
    Name  string      `json:"name"`
    Value interface{} `json:"value"`
}
```

### 1.4 Response

```go
type ResponseDetailsViewV5 struct {
    Status           int                    `json:"status"`
    Body             string                 `json:"body"`
    BodyFile         string                 `json:"bodyFile,omitempty"`
    EncodedBody      bool                   `json:"encodedBody"`
    Headers          map[string][]string    `json:"headers,omitempty"`
    Templated        bool                   `json:"templated"`
    TransitionsState map[string]string      `json:"transitionsState,omitempty"`
    RemovesState     []string               `json:"removesState,omitempty"`
    FixedDelay       int                    `json:"fixedDelay,omitempty"`
    LogNormalDelay   *LogNormalDelayOptions `json:"logNormalDelay,omitempty"` // POINTER
    PostServeAction  string                 `json:"postServeAction,omitempty"`
}

type LogNormalDelayOptions struct {
    Min    int `json:"min"`
    Max    int `json:"max"`
    Mean   int `json:"mean"`
    Median int `json:"median"`
}
```

**Pointer / optional summary** (important for the LSP's "field present vs absent" logic):

- Pointer fields (truly optional, distinguishable from zero): `RequestMatcherViewV5.Query`,
  `MatcherViewV5.DoMatch`, `ResponseDetailsViewV5.LogNormalDelay`.
- `status`, `body`, `encodedBody`, `templated` have **no `omitempty`** → always serialized
  (e.g. `"status": 0`, `"templated": false` appear even when unset). On input they are optional.
- Everything with `omitempty` is omitted when zero/empty on export.

### Import-result/warning structs (used by the API, not part of the file format)

```go
type SimulationImportResult struct {
    Err             error                     `json:"error,omitempty"`
    WarningMessages []SimulationImportWarning `json:"warnings,omitempty"`
}
type SimulationImportWarning struct {
    Message  string `json:"message,omitempty"`
    DocsLink string `json:"documentation,omitempty"`
}
```

---

## 2. Embedded JSON Schema (`core/handlers/v2/schema.json`) — VERBATIM

This is the schema Hoverfly validates uploaded **v5** simulations against, loaded via
`github.com/xeipuuv/gojsonschema` (`gojsonschema.NewBytesLoader(schema)`). The byte slice is
referenced as `SimulationViewV5Schema` in `simulation_views.go`.

```json
{
  "additionalProperties": false,
  "definitions": {
    "delay": {
      "properties": {
        "delay": { "type": "integer" },
        "httpMethod": { "type": "string" },
        "urlPattern": { "type": "string" }
      },
      "type": "object"
    },
    "delay-log-normal": {
      "properties": {
        "httpMethod": { "type": "string" },
        "max": { "type": "integer" },
        "mean": { "type": "integer" },
        "median": { "type": "integer" },
        "min": { "type": "integer" },
        "urlPattern": { "type": "string" }
      },
      "type": "object"
    },
    "field-matchers": {
      "properties": {
        "matcher": { "type": "string" },
        "value": {},
        "config": {
          "properties": {
            "ignoreUnknown": { "type": "boolean" },
            "ignoreOrder": { "type": "boolean" },
            "ignoreOccurrences": { "type": "boolean" }
          },
          "type": "object"
        },
        "doMatch": { "$ref": "#/definitions/field-matchers" }
      },
      "type": "object"
    },
    "headers": {
      "additionalProperties": { "items": { "type": "string" }, "type": "array" },
      "type": "object"
    },
    "literals": {
      "properties": { "name": { "type": "string" }, "value": {} },
      "required": ["name", "value"],
      "type": "object"
    },
    "meta": {
      "properties": {
        "hoverflyVersion": { "type": "string" },
        "schemaVersion": { "type": "string" },
        "timeExported": { "type": "string" }
      },
      "required": ["schemaVersion"],
      "type": "object"
    },
    "request": {
      "properties": {
        "body": { "items": { "$ref": "#/definitions/field-matchers" }, "type": "array" },
        "destination": { "items": { "$ref": "#/definitions/field-matchers" }, "type": "array" },
        "headers": { "$ref": "#/definitions/request-headers" },
        "path": { "items": { "$ref": "#/definitions/field-matchers" }, "type": "array" },
        "query": { "$ref": "#/definitions/request-queries" },
        "requiresState": {
          "patternProperties": { ".{1,}": { "type": "string" } },
          "type": "object"
        },
        "scheme": { "items": { "$ref": "#/definitions/field-matchers" }, "type": "array" }
      },
      "type": "object"
    },
    "request-headers": {
      "additionalProperties": {
        "items": { "$ref": "#/definitions/field-matchers" },
        "type": "array"
      },
      "type": "object"
    },
    "request-queries": {
      "additionalProperties": {
        "items": { "$ref": "#/definitions/field-matchers" },
        "type": "array"
      },
      "type": "object"
    },
    "request-response-pair": {
      "properties": {
        "labels": { "items": { "type": "string" }, "type": "array" },
        "request": { "$ref": "#/definitions/request" },
        "response": { "$ref": "#/definitions/response" }
      },
      "required": ["request", "response"],
      "type": "object"
    },
    "response": {
      "properties": {
        "body": { "type": "string" },
        "bodyFile": { "type": "string" },
        "encodedBody": { "type": "boolean" },
        "fixedDelay": { "type": "integer" },
        "headers": { "$ref": "#/definitions/headers" },
        "logNormalDelay": {
          "properties": {
            "max": { "type": "integer" },
            "mean": { "type": "integer" },
            "median": { "type": "integer" },
            "min": { "type": "integer" }
          }
        },
        "postServeAction": { "type": "string" },
        "removesState": { "type": "array" },
        "status": { "type": "integer" },
        "templated": { "type": "boolean" },
        "transitionsState": {
          "patternProperties": { ".{1,}": { "type": "string" } },
          "type": "object"
        }
      },
      "type": "object"
    },
    "variables": {
      "properties": {
        "name": { "type": "string" },
        "function": { "type": "string" },
        "arguments": { "type": "array" }
      },
      "required": ["name", "function"],
      "type": "object"
    }
  },
  "description": "Hoverfly simulation schema",
  "properties": {
    "data": {
      "properties": {
        "globalActions": {
          "properties": {
            "delays": { "items": { "$ref": "#/definitions/delay" }, "type": "array" },
            "delaysLogNormal": {
              "items": { "$ref": "#/definitions/delay-log-normal" },
              "type": "array"
            }
          },
          "type": "object"
        },
        "literals": { "items": { "$ref": "#/definitions/literals" }, "type": "array" },
        "pairs": { "items": { "$ref": "#/definitions/request-response-pair" }, "type": "array" },
        "variables": { "items": { "$ref": "#/definitions/variables" }, "type": "array" }
      },
      "type": "object"
    },
    "meta": { "$ref": "#/definitions/meta" }
  },
  "required": ["data", "meta"],
  "type": "object"
}
```

### Critical schema observations for the LSP

- **`additionalProperties: false` only at the root.** A typo at the very top level (e.g. `dat`)
  is caught by schema validation. But sub-objects (`data`, `request`, `response`, `field-matchers`,
  `meta`, etc.) do **NOT** set `additionalProperties: false`, so the embedded schema will **NOT**
  reject unknown keys like `response.staus` or `field-matchers.machter`. The LSP should add its own
  stricter "unknown field" diagnostics layer beyond what Hoverfly's schema does.
- **`matcher` is just `{"type":"string"}`** in the schema — the schema does NOT constrain it to the
  registered matcher names. Unknown matcher names (e.g. `"matcher": "exatc"`) pass schema validation
  and are only caught at match time (treated as no/failed match). The LSP should validate matcher
  names against the registry in §3 as a semantic diagnostic.
- **`value` is `{}`** (any type) in the schema. Type-correctness per matcher (§3) is NOT enforced by
  the schema — another LSP semantic-diagnostic opportunity.
- `config` only documents three boolean keys: `ignoreUnknown`, `ignoreOrder`, `ignoreOccurrences`
  (these are the Array/JSON-family config knobs). `config` itself has no `additionalProperties:false`.
- `requiresState` / `transitionsState` use `patternProperties: { ".{1,}": {"type":"string"} }`
  → any non-empty key, string values only.
- Headers/queries values are always **arrays** (`field-matchers[]` for request, `string[]` for
  response headers).

The schema is **only applied to the v5 branch**. Older versions are validated against their own
schema byte vars then upgraded (§5).

---

## 3. Matcher registry (`core/matching/matchers/matchers.go`)

### 3.1 Registry maps (verbatim)

```go
type MatcherValueGenerator func(data interface{}, toMatch string) string

type MatcherDetails struct {
    MatcherFunction     interface{}
    MatchValueGenerator MatcherValueGenerator
}

var Matchers = map[string]MatcherDetails{
    "":            {MatcherFunction: ExactMatch,        MatchValueGenerator: IdentityValueGenerator},
    Exact:         {MatcherFunction: ExactMatch,        MatchValueGenerator: IdentityValueGenerator},
    Glob:          {MatcherFunction: GlobMatch,         MatchValueGenerator: IdentityValueGenerator},
    Json:          {MatcherFunction: JsonMatch,         MatchValueGenerator: IdentityValueGenerator},
    JsonPath:      {MatcherFunction: JsonPathMatch,     MatchValueGenerator: JsonPathMatcherValueGenerator},
    JsonPartial:   {MatcherFunction: JsonPartialMatch,  MatchValueGenerator: IdentityValueGenerator},
    Regex:         {MatcherFunction: RegexMatch,        MatchValueGenerator: IdentityValueGenerator},
    Xml:           {MatcherFunction: XmlMatch,          MatchValueGenerator: IdentityValueGenerator},
    Xpath:         {MatcherFunction: XpathMatch,        MatchValueGenerator: XPathMatchValueGenerator},
    XmlTemplated:  {MatcherFunction: XmlTemplatedMatch, MatchValueGenerator: IdentityValueGenerator},
    Array:         {MatcherFunction: ArrayMatchWithoutConfig, MatchValueGenerator: IdentityValueGenerator},
    JWT:           {MatcherFunction: JwtMatcher,        MatchValueGenerator: JwtMatchValueGenerator},
    JWTJsonPath:   {MatcherFunction: JwtJsonPathMatch,  MatchValueGenerator: JwtJsonPathMatchValueGenerator},
    Negation:      {MatcherFunction: NegationMatch,     MatchValueGenerator: IdentityValueGenerator},
}

// Config-aware variants (used when a config block is present)
var MatchersWithConfig = map[string]MatcherDetails{
    Array: {MatcherFunction: ArrayMatch, MatchValueGenerator: IdentityValueGenerator},
}
```

Dispatch: when a `MatcherViewV5` has a non-empty `config`, Hoverfly looks the name up in
`MatchersWithConfig` (calling the `...config map[string]interface{})` variant); otherwise it uses
the plain `Matchers` map. Today only **`array`** has a config-aware variant. Signatures:

```go
func ArrayMatch(data interface{}, toMatch string, config map[string]interface{}) bool
func ArrayMatchWithoutConfig(data interface{}, toMatch string) bool
func ExactMatch(match interface{}, toMatch string) bool   // typical MatcherFunc shape
```

### 3.2 The name-string constants (THE values that go in the `"matcher"` field)

Each matcher file declares a package-level `var <Name> = "<lowercase>"`. **All registry names are
lowercase**, even though the Go identifiers are CamelCase:

| Go const       | JSON `matcher` string | Function                                 | Value type expected                                                  | Config keys                                                 |
| -------------- | --------------------- | ---------------------------------------- | -------------------------------------------------------------------- | ----------------------------------------------------------- |
| `Exact`        | `"exact"`             | `ExactMatch`                             | string (default when matcher omitted/empty)                          | —                                                           |
| `Glob`         | `"glob"`              | `GlobMatch`                              | string (BASH-style `*` wildcards)                                    | —                                                           |
| `Regex`        | `"regex"`             | `RegexMatch`                             | string (Go regexp)                                                   | —                                                           |
| `Json`         | `"json"`              | `JsonMatch`                              | string containing JSON (deep-equality)                               | —                                                           |
| `JsonPartial`  | `"jsonpartial"`       | `JsonPartialMatch`                       | string JSON (subset match)                                           | —                                                           |
| `JsonPath`     | `"jsonpath"`          | `JsonPathMatch`                          | string JSONPath expression                                           | —                                                           |
| `Xml`          | `"xml"`               | `XmlMatch`                               | string XML                                                           | —                                                           |
| `Xpath`        | `"xpath"`             | `XpathMatch`                             | string XPath expression                                              | —                                                           |
| `XmlTemplated` | `"xmltemplated"`      | `XmlTemplatedMatch`                      | string templated XML                                                 | —                                                           |
| `Array`        | `"array"`             | `ArrayMatch` / `ArrayMatchWithoutConfig` | string (semicolon-split) or string[]                                 | `ignoreUnknown`, `ignoreOrder`, `ignoreOccurrences` (bools) |
| `JWT`          | `"jwt"`               | `JwtMatcher`                             | string JSON of `{header,payload}` (token decoded then `jsonpartial`) | —                                                           |
| `JWTJsonPath`  | `"jwtjsonpath"`       | `JwtJsonPathMatch`                       | string JSONPath against decoded JWT                                  | —                                                           |
| `Negation`     | **`"negate"`**        | `NegationMatch`                          | string (NOT-equal to value)                                          | —                                                           |
| `""` (empty)   | `""`                  | `ExactMatch`                             | string — empty/missing matcher defaults to exact                     | —                                                           |

> GOTCHA #1: `Negation`'s string is **`"negate"`**, not `"negation"`. The Go identifier and the
> JSON value diverge here more than anywhere else.
> GOTCHA #2: matcher names are **lowercase** (`"jsonpath"`, `"jwtjsonpath"`, `"xmltemplated"`).
> Docs/examples sometimes use mixed case (`jsonPartial`) — see §6 discrepancies. In practice
> Hoverfly's lookup is exact/case-sensitive against these lowercase keys.

### 3.3 Value-type & config notes per matcher (from individual `*_match.go` files)

- **exact**: type-asserts value to `string`; compares equality to the field's string form.
- **glob/regex**: value is a string pattern; `RegexMatch` compiles it as a Go `regexp`.
- **json**: parses both value-string and incoming-string into JSON and uses reflect.DeepEqual.
- **jsonpartial**: value JSON must be a subset of incoming JSON.
- **jsonpath / jwtjsonpath**: value is a JSONPath expression string; the matcher's
  `MatchValueGenerator` (`JsonPathMatcherValueGenerator`/`JwtJsonPathMatchValueGenerator`) is used
  to chain a generated value into `doMatch`.
- **array**: value coerced via `util.GetStringArray()` (string split on `;`, or an actual array).
  Config booleans:
  - `ignoreOrder` — order of elements irrelevant.
  - `ignoreUnknown` — incoming may contain extra elements not in the matcher value.
  - `ignoreOccurrences` — duplicate counts irrelevant.
- **jwt**: `ParseJWT` splits the token on `.`, base64-decodes header + payload, builds
  `{"header":{...},"payload":{...}}` JSON, then delegates to `JsonPartialMatch`. Value should be a
  JSON document describing the expected header/payload subset.
- **negate**: inverse of exact.

### 3.4 `doMatch` chaining

`MatcherViewV5.DoMatch` (`*MatcherViewV5`) lets a matcher's `MatchValueGenerator` extract a value
(e.g. JSONPath result) and feed it into a nested matcher. The schema's `field-matchers.doMatch`
self-`$ref` confirms arbitrary nesting depth. The LSP should treat `doMatch` recursively (same
validation as the parent matcher object).

---

## 4. Response templating helpers (`core/templating/templating.go`)

**Engine:** `github.com/aymerick/raymond` (a Handlebars implementation). Syntax is
Handlebars: `{{ helper arg1 arg2 }}` and `{{ Object.field }}`. Templating only runs on a response
when `response.templated == true`.

### 4.1 Registered helper names (VERBATIM map from source — `helperMethodMap[...]`)

There are **52** registered helpers (the keys below are exactly the names usable in `{{ }}`):

```
now                    -> nowHelper
randomString           -> randomString
randomStringLength     -> randomStringLength
randomBoolean          -> randomBoolean
randomInteger          -> randomInteger
randomIntegerRange     -> randomIntegerRange
randomFloat            -> randomFloat
randomFloatRange       -> randomFloatRange
randomEmail            -> randomEmail
randomIPv4             -> randomIPv4
randomIPv6             -> randomIPv6
randomUuid             -> randomUuid
replace                -> replace
split                  -> split
concat                 -> concat
length                 -> length
substring              -> substring
rightmostCharacters    -> rightmostCharacters
isNumeric              -> isNumeric
isAlphanumeric         -> isAlphanumeric
isBool                 -> isBool
isGreaterThan          -> isGreaterThan
isGreaterThanOrEqual   -> isGreaterThanOrEqual
isLessThan             -> isLessThan
isLessThanOrEqual      -> isLessThanOrEqual
isBetween              -> isBetween
matchesRegex           -> matchesRegex
faker                  -> faker
requestBody            -> requestBody
csv                    -> fetchSingleFieldCsv
csvMatchingRows        -> fetchMatchingRowsCsv
csvAsArray             -> csvAsArray
csvAsMap               -> csvAsMap
csvAddRow              -> csvAddRow
csvDeleteRows          -> csvDeleteRows
csvCountRows           -> csvCountRows
csvSqlCommand          -> csvSqlCommand
journal                -> parseJournalBasedOnIndex
hasJournalKey          -> hasJournalKey
setStatusCode          -> setStatusCode
setHeader              -> setHeader
sum                    -> sum
add                    -> add
subtract               -> subtract
multiply               -> multiply
divide                 -> divide
initArray              -> initArray
addToArray             -> addToArray
getArray               -> getArray
putValue               -> putValue
getValue               -> getValue
jsonFromJWT            -> jsonFromJWT
```

> NOTE: The docs group comparison helpers under shortened names (`isGreater`, `isLess`) but the
> **actual registered names are the longer forms**: `isGreaterThan`, `isGreaterThanOrEqual`,
> `isLessThan`, `isLessThanOrEqual`. See §6. The LSP must autocomplete the long forms.

### 4.2 Built-in template variables (`TemplatingData` struct)

Top-level objects accessible inside `{{ }}`:

- **`Request`** — fields: `QueryParam` (map; `Request.QueryParam.<name>` and
  `Request.QueryParam.<name>.[index]`), `Header` (`Request.Header.<name>`, `.[index]`),
  `Path` (`Request.Path.[index]`), `Scheme`, `Method`, `Host`, `FormData` (`Request.FormData.<field>`),
  and `Body` invoked as a function: `{{ Request.Body 'jsonpath' '<expr>' }}` /
  `{{ Request.Body 'xpath' '<expr>' }}`.
- **`State`** — `{{ State.<key> }}` (the request-state map).
- **`Literals`** — `{{ Literals.<name> }}` (from `data.literals`).
- **`Vars`** — `{{ Vars.<name> }}` (from `data.variables`, computed via helper `function`).
- **`Kvs` / `InternalVars`** — backing stores for `putValue`/`getValue`/array helpers.
- **`CurrentDateTime`** — datetime helper support.
- **`jsonFromJWT`** is also used as a free helper: `{{ jsonFromJWT '<expr>' (Request.Header.Authorization) }}`.

> `data.variables[].function` (GlobalVariableViewV5.Function) must be one of the helper names in
> §4.1 — the LSP can validate/autocomplete that field against the same list.

---

## 5. Schema version handling & upgrading (`simulation_views.go` + `simulation_views_upgrade.go`)

### 5.1 Version detection / routing

`schemaVersion` is read from `meta.schemaVersion`, then routed (if/else chain):

```go
if strings.HasPrefix(schemaVersion, "v5") {        // v5, v5.0, v5.1, v5.2, v5.3
    // validate against SimulationViewV5Schema; no upgrade (already current)
} else if schemaVersion == "v4" || schemaVersion == "v3" {
    // validate against SimulationViewV4Schema; upgradeV4()
} else if schemaVersion == "v2" {
    // validate against SimulationViewV2Schema; upgradeV2()
} else if schemaVersion == "v1" {
    // validate against SimulationViewV1Schema; upgradeV1()
}
```

- **All `v5.x`** values are accepted via `strings.HasPrefix(schemaVersion, "v5")` — so `v5`, `v5.0`,
  `v5.1`, `v5.2`, `v5.3` all validate against the single `schema.json` (§2). The LSP can accept any
  `v5*` string and need not special-case the minor.
- **v3 shares the v4 schema and upgrade path** (no separate `upgradeV3`; v3→v4 is structurally
  compatible enough that `upgradeV4` covers it).
- Accepted input versions: **v1, v2, v3, v4, v5(.x)**. Unrecognized version → validation error.
- Output is always upgraded to **v5.3** and re-stamped by `NewMetaView`.

### 5.2 Upgrade functions

- `upgradeV1()`: SimulationViewV1 → V5. Recorded requests become `exact` matchers; non-recorded
  become `glob`. Query params are `url.QueryUnescape`-d.
- `upgradeV2()`: SimulationViewV2 → V5. Uses `v2GetMatchersFromRequestFieldMatchersView()` to map
  legacy field matchers; preserves `GlobalActions`; handles `ExactMatch`/`GlobMatch` query params.
- `upgradeV4()`: SimulationViewV4 (and V3) → V5. Most complete path: merges `HeadersWithMatchers`
  and `QueriesWithMatchers` into the unified v5 `headers`/`query` matcher maps; preserves
  `requiresState`, `transitionsState`, `removesState`, templating flags.
- `v2GetMatchersFromRequestFieldMatchersView()` supports legacy matcher kinds:
  Exact, Glob, Json, JsonPath, Regex, Xml, Xpath.

### 5.3 Schema byte variables

`simulation_views.go` references embedded schema vars: `SimulationViewV5Schema` (the §2 JSON,
used with `gojsonschema.NewBytesLoader`), plus `SimulationViewV4Schema`, `SimulationViewV2Schema`,
`SimulationViewV1Schema`. (Note: the older schemas may be expressed in code/maps; `schema.json` on
disk is the v5 one.) Validation entry point: `ValidateSimulationSchemaFromFile(json, schema []byte)`
→ `gojsonschema.NewBytesLoader(schema)` → `validateSimulation(...)`.

### 5.4 Beyond-schema semantic validation

`simulation_views_validation.go` exists for semantic checks (e.g. import warnings emitted as
`SimulationImportWarning{Message, DocsLink}`). The LSP should mirror this class of check
(deprecations, unknown matchers, etc.) as diagnostics.

---

## 6. Doc vs source discrepancies (explicit)

| #   | Doc says                                                                                                                                                                            | Source says                                                                                                                                                                                     | Impact on LSP                                                                                                                               |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Docs list a **`form`** matcher (`docs/.../request_matchers.rst`, "Matches form data posted in the request payload").                                                                | **No `form`/`Form` key** exists in `Matchers` or `MatchersWithConfig`. (Form data is handled via `Request.FormData` in _templating_, and a future/Java-side feature — not a core matcher name.) | Do NOT offer `form` as a `matcher` value for the Go (OSS core) target; it would be flagged invalid at match time. Treat as unknown matcher. |
| 2   | Docs/examples use **`jsonPartial`** (camelCase).                                                                                                                                    | Registry key is **`jsonpartial`** (all lowercase).                                                                                                                                              | Autocomplete/validate the lowercase `jsonpartial`; flag/repair camelCase.                                                                   |
| 3   | Docs collapse comparison helpers to **`isGreater`/`isLess`**.                                                                                                                       | Registered helper names are **`isGreaterThan`, `isGreaterThanOrEqual`, `isLessThan`, `isLessThanOrEqual`** (no `isGreater`/`isLess`).                                                           | Autocomplete the long forms only.                                                                                                           |
| 4   | Docs name the negation matcher **"Negate"**.                                                                                                                                        | Go identifier is `Negation` but the string value is **`"negate"`** (matches docs' lowercase form).                                                                                              | Use `"negate"`; the Go identifier name is a red herring.                                                                                    |
| 5   | Docs sometimes describe `config` generically.                                                                                                                                       | Schema only whitelists `ignoreUnknown`, `ignoreOrder`, `ignoreOccurrences`; only **`array`** has a config-aware matcher variant today.                                                          | Constrain `config` autocomplete to those 3 booleans; warn elsewhere.                                                                        |
| 6   | Docs version strings (e.g. "v1.12.6"/"v1.10.13" in doc titles) lag the code.                                                                                                        | `master`/release `NewMetaView` emits **`v5.3`**; latest release is **v1.12.8**.                                                                                                                 | Default new files to `schemaVersion: "v5.3"`. Doc page version in the URL ≠ simulation schema version.                                      |
| 7   | Embedded schema does **not** set `additionalProperties:false` on sub-objects, so unknown keys (typos) inside `request`/`response`/`field-matchers` are accepted by Hoverfly itself. | Same — confirmed in §2.                                                                                                                                                                         | The LSP should add **stricter** unknown-key diagnostics than Hoverfly's own validation (a value-add, not a parity feature).                 |

(Other doc references that DO match source: `exact, glob, regex, json, jsonpath, xml, xpath, array,
jwt, jwtjsonpath` and the `doMatch` chaining field — all consistent.)

---

## 7. LSP implementation cheat-sheet (derived)

- **Diagnostics layers:** (a) raw JSON well-formedness; (b) JSON-Schema validation using the §2
  schema for `v5*`; (c) semantic layer Hoverfly's schema misses: unknown `matcher` names, wrong
  `value` types per matcher (§3), `config` keys outside the 3 booleans, unknown templating helper
  names (when `templated:true` or in `variables[].function`), unknown top-level/nested keys.
- **Autocomplete sources:** matcher names = §3.2 lowercase list; templating helpers = §4.1 list (52);
  built-in template vars = §4.2; response/request field keys = §1 struct JSON tags; `config` keys =
  3 booleans.
- **Hover docs:** map each matcher (§3.2 table), each helper (§4.1), and each struct field (§1) to a
  short description + a docs URL.
- **Defaults for new files:** `meta.schemaVersion = "v5.3"`, `data.pairs = []`,
  `data.globalActions = {delays:[], delaysLogNormal:[]}`.
- **Required keys** (from schema): root `data` + `meta`; `meta.schemaVersion`; each pair needs
  `request` + `response`; `literals` need `name`+`value`; `variables` need `name`+`function`.

---

## 8. Versions

- **Latest released:** `v1.12.8`, name "v1.12.8", published **2026-05-31**. Notable fixes: "race in
  Diff mode crashes Hoverfly", "timeout remote post-serve HTTP client", plus capture-on-miss.
- **`master` vs `v1.12.8`:** master is **~10 commits ahead**, all CI/build/dependency bumps
  (Go → 1.26.4, Python doc-toolchain deps: requests 2.33.0, idna 3.15, pygments 2.20.0, shell-agnostic
  CI script, `go mod vendor`). **No simulation-format, matcher-registry, schema, or templating
  changes between v1.12.8 and master** — so the format truth captured here applies to both.
- **Simulation schema version (independent of app version):** **`v5.3`** is current; the file format
  shape has been stable across recent releases.

---

## 9. Exact source URLs used (for implementation agents to re-verify)

- `…/master/core/handlers/v2/simulation_views.go`
- `…/master/core/handlers/v2/simulation_views_v5.go`
- `…/master/core/handlers/v2/simulation_views_upgrade.go`
- `…/master/core/handlers/v2/schema.json`
- `…/master/core/matching/matchers/matchers.go`
- `…/master/core/matching/matchers/{exact,glob,regex,json,json_partial,json_path,xml,xpath,xml_templated,array,jwt,jwt_jsonpath,negation}_match.go`
- `…/master/core/templating/templating.go` and `template_helpers.go`
- `…/master/docs/pages/reference/hoverfly/request_matchers.rst`
- Release API: `https://api.github.com/repos/SpectoLabs/hoverfly/releases/latest`
- Compare: `https://github.com/SpectoLabs/hoverfly/compare/v1.12.8...master`

(`…` = `https://raw.githubusercontent.com/SpectoLabs/hoverfly`)
