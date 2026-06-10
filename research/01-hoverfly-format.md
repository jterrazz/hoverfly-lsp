# Hoverfly JSON Simulation Format — Exhaustive Reference

> Research deliverable for the **hoverfly-lsp** project. Scope: the JSON simulation
> format only (request matchers, responses, global actions, meta, state, response
> templating) — everything needed for diagnostics, autocomplete, and hover docs.
>
> **Sources** (Hoverfly docs `latest` == release **v1.12.8**, schema version **v5.3**):
>
> - Simulation schema: https://docs.hoverfly.io/en/latest/pages/reference/simulationschema.html
> - Raw JSON Schema: https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/core/handlers/v2/schema.json
> - Request matchers: https://docs.hoverfly.io/en/latest/pages/reference/hoverfly/request_matchers.html
> - Simulations / Pairs: https://docs.hoverfly.io/en/latest/pages/keyconcepts/simulations/simulations.html , .../pairs.html
> - Templating: https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html
> - State: https://docs.hoverfly.io/en/latest/pages/keyconcepts/state/state.html (+ settingstate, requiringstate, sequences)
> - Matching: https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matching.html
> - REST API: https://docs.hoverfly.io/en/latest/pages/reference/api/api.html
> - Go source (authoritative): `core/handlers/v2/schema.json`, `core/handlers/v2/simulation_views.go`

---

## 0. TL;DR for the LSP implementer

- A simulation is a JSON object with exactly two top-level keys: **`data`** and **`meta`** (both **required**). The root schema sets `additionalProperties: false`, so any other top-level key is invalid.
- `meta.schemaVersion` is the **only required field anywhere** (besides `data`/`meta` themselves and the `request`/`response` pair). The current/latest version string is **`v5.3`**.
- **Version gating is loose**: Hoverfly's loader accepts any `schemaVersion` matching `strings.HasPrefix(schemaVersion, "v5")` and validates all of them against the _same_ single `schema.json`. So `v5`, `v5.0`, `v5.1`, `v5.2`, `v5.3` are all accepted and validated identically. v4/v3/v2/v1 are auto-upgraded (`upgradeV4/upgradeV2/upgradeV1`).
- The official JSON Schema is **permissive** (most fields optional, `value` is untyped `{}`). High-value LSP diagnostics therefore come from **semantic rules** (matcher-name enum, matcher value-type per matcher, template function validity, state key references) layered on top of the loose schema.

---

## 1. Top-level structure (root object)

The authoritative schema (`core/handlers/v2/schema.json`) for the root:

```json
{
  "additionalProperties": false,
  "required": ["data", "meta"],
  "type": "object",
  "properties": {
    "data": { ... },
    "meta": { "$ref": "#/definitions/meta" }
  }
}
```

| Field             | Type   | Required | Notes                                                    |
| ----------------- | ------ | -------- | -------------------------------------------------------- |
| `data`            | object | **yes**  | Container for pairs, globalActions, literals, variables. |
| `meta`            | object | **yes**  | Metadata incl. `schemaVersion`.                          |
| _(any other key)_ | —      | —        | **Invalid** — root has `additionalProperties: false`.    |

### 1.1 `data` object

`data` has `type: object` (note: **no** `additionalProperties:false` on `data`, so extra keys here are technically tolerated by the schema, but only these four are meaningful):

| Field           | Type   | Required | Since | Notes                                                                                              |
| --------------- | ------ | -------- | ----- | -------------------------------------------------------------------------------------------------- |
| `pairs`         | array  | no       | v5    | Array of request-response pairs (`#/definitions/request-response-pair`). The core of a simulation. |
| `globalActions` | object | no       | v5    | Global delays. Contains `delays` and `delaysLogNormal`.                                            |
| `literals`      | array  | no       | v5.x  | Global template constants (`#/definitions/literals`).                                              |
| `variables`     | array  | no       | v5.x  | Global template variables (`#/definitions/variables`).                                             |

### 1.2 `meta` object (`#/definitions/meta`)

```json
"meta": {
  "type": "object",
  "required": ["schemaVersion"],
  "properties": {
    "hoverflyVersion": { "type": "string" },
    "schemaVersion":   { "type": "string" },
    "timeExported":    { "type": "string" }
  }
}
```

| Field             | Type   | Required | Allowed values / format                                                      | Notes                                                                                                                               |
| ----------------- | ------ | -------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `schemaVersion`   | string | **yes**  | `"v5"`, `"v5.0"`, `"v5.1"`, `"v5.2"`, `"v5.3"` (anything starting with `v5`) | Latest emitted by Hoverfly = `v5.3`. Loader: `strings.HasPrefix(schemaVersion, "v5")`. Older `v1`–`v4` are auto-upgraded on import. |
| `hoverflyVersion` | string | no       | e.g. `"v1.0.0"`, `"v1.12.8"`                                                 | Hoverfly version that exported the sim.                                                                                             |
| `timeExported`    | string | no       | RFC3339, e.g. `"2019-05-30T22:14:24+01:00"`                                  | Export timestamp.                                                                                                                   |

> **LSP note**: `meta` does NOT set `additionalProperties:false`, so unknown meta keys won't be schema errors — consider a _warning_-level lint for unknown meta keys.

---

## 2. Request-response pair (`#/definitions/request-response-pair`)

```json
{
  "type": "object",
  "required": ["request", "response"],
  "properties": {
    "labels": { "type": "array", "items": { "type": "string" } },
    "request": { "$ref": "#/definitions/request" },
    "response": { "$ref": "#/definitions/response" }
  }
}
```

| Field      | Type            | Required | Since                                                            | Notes                        |
| ---------- | --------------- | -------- | ---------------------------------------------------------------- | ---------------------------- |
| `request`  | object          | **yes**  | v5                                                               | Request matcher set.         |
| `response` | object          | **yes**  | v5                                                               | Mocked response.             |
| `labels`   | array\<string\> | no       | **v5.3** (Jul 2024 commit "Add labels to request response pair") | Free-form tags for the pair. |

---

## 3. Request matchers (`#/definitions/request`)

```json
"request": {
  "type": "object",
  "properties": {
    "body":        { "type": "array",  "items": { "$ref": "#/definitions/field-matchers" } },
    "destination": { "type": "array",  "items": { "$ref": "#/definitions/field-matchers" } },
    "path":        { "type": "array",  "items": { "$ref": "#/definitions/field-matchers" } },
    "scheme":      { "type": "array",  "items": { "$ref": "#/definitions/field-matchers" } },
    "headers":     { "$ref": "#/definitions/request-headers" },
    "query":       { "$ref": "#/definitions/request-queries" },
    "requiresState": {
      "type": "object",
      "patternProperties": { ".{1,}": { "type": "string" } }
    }
  }
}
```

### 3.1 Request fields table

| Field           | JSON shape                                       | Required | Since | Notes                                                                                                                                                                                                                                                                               |
| --------------- | ------------------------------------------------ | -------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `method`        | `array<field-matcher>`                           | no       | v5    | **Present in all examples & accepted at runtime**, but NOT explicitly listed in `schema.json`'s `request` definition. Treated as a field-matcher array (`[{"matcher":"exact","value":"GET"}]`). LSP should support/complete it. Values: GET/POST/PUT/DELETE/PATCH/HEAD/OPTIONS/etc. |
| `path`          | `array<field-matcher>`                           | no       | v5    | Matches URL path, e.g. `/api/v2/user`.                                                                                                                                                                                                                                              |
| `destination`   | `array<field-matcher>`                           | no       | v5    | Host (and optional port), e.g. `docs.hoverfly.io`, `localhost:8085`.                                                                                                                                                                                                                |
| `scheme`        | `array<field-matcher>`                           | no       | v5    | `http` / `https`.                                                                                                                                                                                                                                                                   |
| `body`          | `array<field-matcher>`                           | no       | v5    | Request body. The only field that supports the **`form`** matcher.                                                                                                                                                                                                                  |
| `query`         | object: `{ <paramName>: array<field-matcher> }`  | no       | v5.1+ | Per-query-parameter matcher arrays. (`#/definitions/request-queries`, `additionalProperties` → array of field-matchers.)                                                                                                                                                            |
| `headers`       | object: `{ <HeaderName>: array<field-matcher> }` | no       | v5    | Per-header matcher arrays. (`#/definitions/request-headers`.)                                                                                                                                                                                                                       |
| `requiresState` | object: `{ <key>: <string> }`                    | no       | v5    | Gates the match on Hoverfly state. Keys must be non-empty (`patternProperties: ".{1,}"`), values are strings. See §6.                                                                                                                                                               |

> **Important semantics:** Each request field is an **array of matchers**, ALL of which must pass for that field to match. If a field is **absent**, it is simply not evaluated (it does not block matching). An incoming request matches a pair only if **every** matcher present passes; otherwise the pair is "unmatched". See §7 (scoring).

> **`query` / `headers` shape:** these are objects keyed by the param/header name; each value is an array of field-matchers. Example:
>
> ```json
> "query": { "myParam": [ { "matcher": "exact", "value": "true" } ] },
> "headers": { "Authorization": [ { "matcher": "jwt", "value": "..." } ] }
> ```

### 3.2 Field-matcher object (`#/definitions/field-matchers`) — the core unit

```json
"field-matchers": {
  "type": "object",
  "properties": {
    "matcher": { "type": "string" },
    "value":   {},                       // untyped: string | object | array | number
    "config": {
      "type": "object",
      "properties": {
        "ignoreUnknown":     { "type": "boolean" },
        "ignoreOrder":       { "type": "boolean" },
        "ignoreOccurrences": { "type": "boolean" }
      }
    },
    "doMatch": { "$ref": "#/definitions/field-matchers" }   // recursive — matcher chaining
  }
}
```

| Sub-field | Type          | Required            | Notes                                                                                                         |
| --------- | ------------- | ------------------- | ------------------------------------------------------------------------------------------------------------- |
| `matcher` | string        | (de facto required) | One of the matcher-type names in §4. Default when captured = `exact`.                                         |
| `value`   | any (`{}`)    | (de facto required) | Type depends on `matcher` (see §4 table).                                                                     |
| `config`  | object        | no                  | Only meaningful for the `array` matcher. Three booleans: `ignoreUnknown`, `ignoreOrder`, `ignoreOccurrences`. |
| `doMatch` | field-matcher | no                  | **Matcher chaining**: feed this matcher's result into another matcher. Recursive. See §5.                     |

> **LSP value-type checking**: the schema's `value:{}` means _any JSON_. Real type rules per matcher are in §4 — a strong source of semantic diagnostics (e.g. `array` matcher requires an array value; `form` requires an object-of-matcher-arrays; string matchers require a string).

---

## 4. Matcher types (the enum the LSP should know)

Every matcher's `value` is interpreted differently. Confirmed matcher names (exact JSON spelling):

| `matcher` (exact string) | `value` type                                    | Applies to                     | Since    | Description (verbatim from docs)                                                                                                                                                                                                                                                                         |
| ------------------------ | ----------------------------------------------- | ------------------------------ | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exact`                  | string                                          | all fields                     | v5       | "Evaluates the equality of the matcher value and the string to match. There are no transformations." **Default** matcher set on capture.                                                                                                                                                                 |
| `negate`                 | string                                          | all fields                     | v5.x     | "The opposite of the Exact matcher. This matcher will evaluate to true if the values being compared are not the same."                                                                                                                                                                                   |
| `glob`                   | string (with `*`)                               | all fields                     | v5       | "Allows wildcard matching (similar to BASH) using the `*` character."                                                                                                                                                                                                                                    |
| `regex`                  | string (regex)                                  | all fields                     | v5       | "Parses the matcher value as a regular expression which is then executed against the string to match. This will pass only if the regular expression successfully returns a result." (Go `regexp` / RE2 syntax.)                                                                                          |
| `xml`                    | XML string                                      | body/headers/etc               | v5       | "Transforms both the matcher value and string to match into XML objects and then evaluates their equality."                                                                                                                                                                                              |
| `xpath`                  | string (XPath expr)                             | body etc                       | v5       | "Parses the matcher value as an XPath expression, transforms the string to match into an XML object and then executes the expression against it. This will pass only if the expression successfully returns a result."                                                                                   |
| `json`                   | JSON (string-encoded or object)                 | body etc                       | v5       | "Transforms both the matcher value and string to match into JSON objects and then evaluates their equality."                                                                                                                                                                                             |
| `jsonPartial`            | JSON (string-encoded or object)                 | body etc                       | v5       | **Note camelCase capital P.** "Unlike a JSON matcher which does the full matching of two JSON documents, this matcher evaluates if the matcher value is a subset of the incoming JSON document. The matcher ignores any absent fields and lets you match only the part of JSON document you care about." |
| `jsonpath`               | string (JSONPath expr)                          | body etc                       | v5       | "Parses the matcher value as a JSONPath expression... executes the expression against it. This will pass only if the expression successfully returns a result." Note all-lowercase.                                                                                                                      |
| `array`                  | **array of strings**                            | query / headers (multi-value)  | **v5.2** | "Matches an array contains exactly the given values and nothing else. This can be used to match multi-value query param or header in the request data." Uses `config` (see below). Became the default for multi-value query/header captures in v5.2.                                                     |
| `jwt`                    | JSON string `{"header":{...},"payload":{...}}`  | headers (Authorization) / body | **v5.2** | "Converts base64 encoded JWT to JSON document `{\"header\": {}, \"payload\": \"\"}` and does JSON partial match with the matcher value. Matcher value contains only keys that they want to match in JWT."                                                                                                |
| `jwtjsonpath`            | string (JSONPath expr)                          | headers (Authorization) / body | v5.2     | "Parses the matcher value as a JSONPath expression and executes it against the decoded JWT header/payload." Shorthand `$.user_name` → `$.payload.user_name`; can also use `$.header.*` / `$.payload.*` explicitly. Typically used with `doMatch`.                                                        |
| `form`                   | **object**: `{ <param>: array<field-matcher> }` | **body only**                  | **v5.2** | "Matches form data posted in the request payload with content type `application/x-www-form-urlencoded`. You can match only the form params you are interested in regardless of the order. You can also leverage `jwt` or `jsonpath` matchers if your form params contains JWT tokens or JSON document."  |

### 4.1 `array` matcher `config` options

```json
{
  "matcher": "array",
  "config": {
    "ignoreUnknown": "<true/false>",
    "ignoreOrder": "<true/false>",
    "ignoreOccurrences": "<true/false>"
  },
  "value": ["access:vod", "order:latest", "profile:vd"]
}
```

| config key          | Type    | Effect                                                         |
| ------------------- | ------- | -------------------------------------------------------------- |
| `ignoreUnknown`     | boolean | Permit extra values in the incoming array beyond those listed. |
| `ignoreOrder`       | boolean | Ignore the order of values.                                    |
| `ignoreOccurrences` | boolean | Disregard duplicate occurrences / counts.                      |

> Docs sometimes show config values as the strings `"<true/false>"` placeholders, but they are **booleans** per the schema (`type: boolean`). LSP should flag string values here.

### 4.2 `jwt` matcher example

```json
{
  "matcher": "jwt",
  "value": "{\"header\":{\"alg\":\"HS256\"},\"payload\":{\"sub\":\"1234567890\",\"name\":\"John Doe\"}}"
}
```

### 4.3 `form` matcher example (body only)

```json
{
  "matcher": "form",
  "value": {
    "grant_type": [{ "matcher": "exact", "value": "authorization_code" }],
    "client_assertion": [
      {
        "matcher": "jwt",
        "value": "{\"header\":{\"alg\":\"HS256\"},\"payload\":{\"sub\":\"1234567890\",\"name\":\"John Doe\"}}"
      }
    ]
  }
}
```

---

## 5. Matcher chaining — `doMatch`

"Matcher chaining allows you to pass a matched value into another matcher to do further matching. It typically removes the stress of composing and testing complex expressions and make matchers more readable."

`doMatch` is recursive (`$ref` to `field-matchers`), so chains can nest arbitrarily.

```json
{
  "matcher": "jsonpath",
  "value": "$.user.id",
  "doMatch": { "matcher": "exact", "value": "1" }
}
```

JWT + chaining inside a header matcher:

```json
"headers": {
  "Authorization": [
    {
      "matcher": "jwtjsonpath",
      "value": "$.user_name",
      "doMatch": { "matcher": "regex", "value": "stuart.kelly" }
    }
  ]
}
```

---

## 6. Responses (`#/definitions/response`)

```json
"response": {
  "type": "object",
  "properties": {
    "status":       { "type": "integer" },
    "body":         { "type": "string" },
    "bodyFile":     { "type": "string" },
    "encodedBody":  { "type": "boolean" },
    "headers":      { "$ref": "#/definitions/headers" },
    "templated":    { "type": "boolean" },
    "fixedDelay":   { "type": "integer" },
    "logNormalDelay": {
      "properties": {
        "min":    { "type": "integer" },
        "max":    { "type": "integer" },
        "mean":   { "type": "integer" },
        "median": { "type": "integer" }
      }
    },
    "postServeAction":  { "type": "string" },
    "removesState":     { "type": "array" },
    "transitionsState": {
      "type": "object",
      "patternProperties": { ".{1,}": { "type": "string" } }
    }
  }
}
```

| Field              | Type                                | Required | Since                                                             | Allowed values / notes                                                                                                |
| ------------------ | ----------------------------------- | -------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `status`           | integer                             | no       | v5                                                                | HTTP status code (template setter range `100`–`599`).                                                                 |
| `body`             | string                              | no       | v5                                                                | Response body. If both `body` and `bodyFile` are present, **`body` takes precedence**.                                |
| `bodyFile`         | string                              | no       | v5                                                                | Path/URL to load body from on import. See §6.3.                                                                       |
| `encodedBody`      | boolean                             | no       | v5                                                                | `true` ⇒ `body` is base64. Set automatically for binary bodies on capture. See §6.2.                                  |
| `headers`          | object: `{ <Name>: array<string> }` | no       | v5                                                                | Response headers. Values are **string arrays**. (`#/definitions/headers`: `additionalProperties` → array of strings.) |
| `templated`        | boolean                             | no       | v5                                                                | `true` enables response templating (`{{ }}`) in `body`/`headers`. Default `false`. See §8.                            |
| `fixedDelay`       | integer                             | no       | v5                                                                | Per-response fixed delay in **milliseconds**.                                                                         |
| `logNormalDelay`   | object                              | no       | v5.x (`delaysLogNormal` family)                                   | Per-response log-normal delay. Fields: `min`, `max`, `mean`, `median` (all integers, ms).                             |
| `transitionsState` | object: `{ <key>: <string> }`       | no       | v5                                                                | Sets/updates state keys after this response. Keys non-empty, values strings. See §7.                                  |
| `removesState`     | array (of strings)                  | no       | v5                                                                | State keys to delete after this response. See §7.                                                                     |
| `postServeAction`  | string                              | no       | **v5.3** (Sep 2023 commit "change schema and add basic tutorial") | Name of a registered post-serve action to run after responding.                                                       |

### 6.1 Full minimal/typical response example

```json
"response": {
  "status": 200,
  "body": "Response from docs.hoverfly.io/pages/keyconcepts/templates.html",
  "encodedBody": false,
  "headers": { "Hoverfly": ["Was-Here"] },
  "templated": false,
  "bodyFile": "responses/200-success.json"
}
```

### 6.2 Binary data / `encodedBody`

"If a response body contains binary data (images, gzipped, etc), the response body will be base64 encoded and the `encodedBody` field set to true."

```json
{ "body": "YmFzZTY0IGVuY29kZWQ=", "encodedBody": true }
```

### 6.3 `bodyFile` semantics & restrictions

- Supports **local paths** — resolved against the `-response-body-files-path` flag (defaults to the current working directory).
- Supports **remote URLs** — requires the `-response-body-files-allow-origin` flag to be set (origin allow-list).
- **Read into memory only at simulation import time, NOT at runtime.** Changing the file after import has no effect until re-import.
- If both `body` and `bodyFile` are set, **`body` wins** (`bodyFile` ignored).

> **LSP note**: `bodyFile` path completion/validation is editor-relative + flag-dependent; offer path completion but treat "file not found" as a _warning_ (path resolution is runtime/flag-dependent, not statically certain).

---

## 7. State management

Hoverfly maintains "a map of keys and values which it uses to store its internal state." Three response/request fields manipulate or gate on it.

| Field (location)            | Type                       | Semantics                                                                                                                                                                     |
| --------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `request.requiresState`     | object `{key:stringValue}` | Match only succeeds when current state contains **all** listed key=value pairs. Extra state keys do NOT prevent matching; missing/mismatched required keys DO fail the match. |
| `response.transitionsState` | object `{key:stringValue}` | After serving, sets/updates these state keys (creates if absent, overwrites if present).                                                                                      |
| `response.removesState`     | array of strings           | After serving, deletes these state keys (no error if key absent).                                                                                                             |

### 7.1 Requiring state (request side)

```json
{
  "request": {
    "path": [{ "matcher": "exact", "value": "/basket" }],
    "requiresState": { "eggs": "present", "bacon": "large" }
  },
  "response": { "status": 200, "body": "eggs and large bacon" }
}
```

### 7.2 Setting/removing state (response side)

```json
{
  "request": { "path": [{ "matcher": "exact", "value": "/pay" }] },
  "response": {
    "status": 200,
    "body": "eggs and large bacon",
    "transitionsState": { "payment-flow": "complete" },
    "removesState": ["basket"]
  }
}
```

State is also manipulable at runtime via the REST API `/api/v2/state`:

```json
{ "state": { "page_state": "CHECKOUT" } }
```

### 7.3 Sequences (reserved `sequence:` key convention)

Sequences let identical requests return _different_ responses in order. Convention: prefix the state key with **`sequence:`**; Hoverfly tracks position. `transitionsState` advances the sequence; the final response keeps being returned once reached.

```json
{
  "data": {
    "pairs": [
      {
        "request": { "requiresState": { "sequence:1": "1" } },
        "response": {
          "status": 200,
          "body": "First response",
          "transitionsState": { "sequence:1": "2" }
        }
      },
      {
        "request": { "requiresState": { "sequence:1": "2" } },
        "response": { "status": 200, "body": "Second response" }
      }
    ]
  },
  "meta": { "schemaVersion": "v5.2" }
}
```

> **LSP semantic ideas**: cross-reference `requiresState` keys against `transitionsState` keys across pairs to warn about unreachable states / typos; recognize the `sequence:` prefix specially.

---

## 8. Global actions — delays (`data.globalActions`)

```json
"globalActions": {
  "delays":          [ /* #/definitions/delay */ ],
  "delaysLogNormal": [ /* #/definitions/delay-log-normal */ ]
}
```

### 8.1 `delays` item (`#/definitions/delay`)

```json
"delay": {
  "type": "object",
  "properties": {
    "delay":      { "type": "integer" },
    "httpMethod": { "type": "string" },
    "urlPattern": { "type": "string" }
  }
}
```

| Field        | Type    | Notes                                     |
| ------------ | ------- | ----------------------------------------- |
| `delay`      | integer | Fixed delay in **milliseconds**.          |
| `httpMethod` | string  | Optional HTTP method filter (e.g. `GET`). |
| `urlPattern` | string  | Regex URL pattern the delay applies to.   |

### 8.2 `delaysLogNormal` item (`#/definitions/delay-log-normal`)

```json
"delay-log-normal": {
  "type": "object",
  "properties": {
    "min":        { "type": "integer" },
    "max":        { "type": "integer" },
    "mean":       { "type": "integer" },
    "median":     { "type": "integer" },
    "httpMethod": { "type": "string" },
    "urlPattern": { "type": "string" }
  }
}
```

| Field        | Type    | Notes                   |
| ------------ | ------- | ----------------------- |
| `min`        | integer | Min delay (ms).         |
| `max`        | integer | Max delay (ms).         |
| `mean`       | integer | Log-normal mean (ms).   |
| `median`     | integer | Log-normal median (ms). |
| `httpMethod` | string  | Optional method filter. |
| `urlPattern` | string  | Regex URL pattern.      |

Empty arrays are common in exports:

```json
"globalActions": { "delays": [], "delaysLogNormal": [] }
```

---

## 9. Global literals & variables (template inputs)

### 9.1 `data.literals` (`#/definitions/literals`)

```json
"literals": [
  { "name": "literal1", "value": "value1" },
  { "name": "literal2", "value": ["v1", "v2"] }
]
```

| Field   | Type       | Required | Notes                                             |
| ------- | ---------- | -------- | ------------------------------------------------- |
| `name`  | string     | **yes**  | Reference in template as `{{ Literals.<name> }}`. |
| `value` | any (`{}`) | **yes**  | Constant value (string, array, object...).        |

### 9.2 `data.variables` (`#/definitions/variables`)

```json
"variables": [
  { "name": "varOne",     "function": "faker",       "arguments": ["Name"] },
  { "name": "idFromBody", "function": "requestBody",  "arguments": ["jsonpath", "$.id"] }
]
```

| Field       | Type   | Required | Notes                                                                      |
| ----------- | ------ | -------- | -------------------------------------------------------------------------- |
| `name`      | string | **yes**  | Reference in template as `{{ Vars.<name> }}`.                              |
| `function`  | string | **yes**  | A template helper name (e.g. `faker`, `requestBody`, `randomString`, ...). |
| `arguments` | array  | no       | Args passed to the function.                                               |

---

## 10. Response templating (for template-aware body validation/completion)

- **Engine**: Handlebars.js semantics via the Go `raymond` library (https://github.com/aymerick/raymond). Supports `{{#if}}…{{/if}}`, `{{#unless}}`, `{{#each array}}…{{/each}}`, `{{#equal}}…{{/equal}}`, `{{this}}`, `@index`, `@last`.
- **Enable** by setting `"templated": true` on the response. When `false`/absent, `{{ }}` is emitted literally.
- **Syntax**: everything inside `{{ … }}`. Helpers take space-separated positional args; string literals use single quotes (e.g. `'jsonpath'`).

### 10.1 Request data accessors

| Expression                                                        | Example input → result                   |
| ----------------------------------------------------------------- | ---------------------------------------- |
| `{{ Request.Scheme }}`                                            | `http://www.foo.com` → `http`            |
| `{{ Request.Method }}`                                            | `GET /...` → `GET`                       |
| `{{ Request.Host }}`                                              | `http://www.foo.com/...` → `www.foo.com` |
| `{{ Request.Path.[index] }}`                                      | `/zero/one/two`, index 1 → `one`         |
| `{{ Request.QueryParam.paramName }}`                              | `?myParam=bar` → `bar`                   |
| `{{ Request.QueryParam.paramName.[1] }}`                          | `?myParam=bar1&myParam=bar2` → `bar2`    |
| `{{ Request.Header.HeaderName }}`                                 | `X-Header-Id: ["bar"]` → `bar`           |
| `{{ Request.Header.HeaderName.[1] }}`                             | `["bar1","bar2"]` → `bar2`               |
| `{{ Request.Body 'jsonpath' '$.id' }}`                            | `{"id":123}` → `123`                     |
| `{{ Request.Body 'xpath' '/root/id' }}`                           | `<root><id>123</id></root>` → `123`      |
| `{{ Request.FormData.fieldName }}`                                | `email=foo@bar.com` → `foo@bar.com`      |
| `{{ State.keyName }}`                                             | state `{"basket":"eggs"}` → `eggs`       |
| `{{ jsonFromJWT '$.payload.id' (Request.Header.Authorization) }}` | Bearer token → claim value               |

> `Request.Body` signature: `Request.Body '<jsonpath|xpath>' '<expression>'`.

### 10.2 Date/time

`{{ now '<offset>' '<format>' }}`

- Offsets: `ns`, `us`/`µs`, `ms`, `s`, `m`, `h`, `d`, `y`; prefix `-` to subtract.
- Format: Go time layout (e.g. `2006-Jan-02`); empty = ISO 8601. Aliases: `unix` (seconds), `epoch` (milliseconds).
- Examples: `{{ now '1d' 'unix' }}`, `{{ now '' '' }}`, `{{ now '-1d' '2006-Jan-02' }}`.

### 10.3 Random generators

| Function                               | Output              |
| -------------------------------------- | ------------------- |
| `{{ randomString }}`                   | random alphanumeric |
| `{{ randomStringLength [n] }}`         | n random chars      |
| `{{ randomBoolean }}`                  | `true`/`false`      |
| `{{ randomInteger }}`                  | random int          |
| `{{ randomIntegerRange [min] [max] }}` | int in range        |
| `{{ randomFloat }}`                    | random float        |
| `{{ randomFloatRange [min] [max] }}`   | float in range      |
| `{{ randomEmail }}`                    | random email        |
| `{{ randomIPv4 }}`                     | random IPv4         |
| `{{ randomIPv6 }}`                     | random IPv6         |
| `{{ randomUuid }}`                     | random UUID v4      |

### 10.4 Faker (go-fakeit / brianvoe gofakeit)

`{{ faker '<Type>' }}` — e.g. `{{ faker 'Name' }}` → `John Smith`, `{{ faker 'Email' }}`.

- **Arguments are NOT supported** for faker functions (only the type name).
- The docs enumerate only examples (`Name`, `Email`); the full set is whatever go-fakeit exposes. Common type names worth completing: `Name`, `FirstName`, `LastName`, `Email`, `Phone`, `Address`, `City`, `State`, `Zip`, `Country`, `Company`, `JobTitle`, `URL`, `DomainName`, `IPv4Address`, `IPv6Address`, `UUID`, `CreditCardNumber`, `Word`, `Sentence`, `Paragraph`, `Color`, `HexColor`, `Currency`, `Price`, `Date`, `Username`, `Password`, `MacAddress`, `UserAgent`, `Latitude`, `Longitude`, `BeerName`, `CarMaker` (verify against the linked go-fakeit version before shipping completions as authoritative).

### 10.5 CSV data-source helpers

- `{{ csv '<source>' '<column>' '<value>' '<select-column>' }}`
- `{{ csvAsMap '<source>' }}` → array of maps
- `{{ csvMatchingRows '<source>' '<column>' '<value>' }}` → filtered array of maps
- `{{ csvAsArray '<source>' }}` → array of arrays
- `{{ csvCountRows '<source>' }}` → row count
- `{{ csvAddRow '<source>' (getArray 'arrayName') }}`
- `{{ csvDeleteRows '<source>' '<column>' '<value>' [output-bool] }}`
- `{{ csvSqlCommand '<SQL>' }}` — simplified SQL: `SELECT/UPDATE/DELETE`, ops `= > < >= <= !=`, chain only with `AND` (no `OR`), all values quoted, keywords capitalized.

### 10.6 Journal helpers

- `{{ journal '<index-name>' '<lookup-key>' '<request|response>' '<xpath|jsonpath>' '<query>' }}`
  - e.g. `{{ journal 'Request.QueryParam.id' '1' 'response' 'jsonpath' '$.name' }}`
- `{{ hasJournalKey '<index-name>' '<key-name>' }}` → boolean

### 10.7 Key-value store / array helpers (per-request scope, cleared after render)

- `{{ putValue '<key>' [value] [output-bool] }}` — e.g. `{{ putValue 'id' 123 true }}`
- `{{ getValue '<key>' }}` — e.g. `{{ getValue 'id' }}`
- `{{ addToArray '<array-name>' '<value>' [output-bool] }}` — e.g. `{{ addToArray 'names' 'John' true }}`
- `{{ getArray '<array-name>' }}` — e.g. `{{ getArray 'names' }}`
- `{{ initArray '<array-name>' }}` — clears/creates an array

### 10.8 Math helpers

`{{ <op> [num1] [num2] '<precision>' }}` where op ∈ `add | subtract | multiply | divide`.

- `{{ sum (getArray '<name>') '<format>' }}` — sum an array.
- Precision e.g. `'0.00'`; empty string = default.

### 10.9 Validation helpers (return boolean)

| Helper                                      | Returns |
| ------------------------------------------- | ------- |
| `{{ isNumeric '<value>' }}`                 | bool    |
| `{{ isAlphanumeric '<value>' }}`            | bool    |
| `{{ isBool [value] }}`                      | bool    |
| `{{ isGreater [v1] [v2] }}`                 | bool    |
| `{{ isLess [v1] [v2] }}`                    | bool    |
| `{{ isBetween [value] [min] [max] }}`       | bool    |
| `{{ matchesRegex '<string>' '<pattern>' }}` | bool    |

### 10.10 Response-property setters (no text output; mutate the response)

- `{{ setStatusCode [code] }}` — sets HTTP status (100–599).
- `{{ setHeader '<name>' '<value>' }}` — sets/overwrites a header.

### 10.11 Literal/variable references in templates

- `{{ Literals.<name> }}` — from `data.literals`.
- `{{ Vars.<name> }}` — from `data.variables`.
- JWT decode helper: `{{ jsonFromJWT '$.payload.<claim>' (Request.Header.Authorization) }}`.

---

## 11. Schema version history (what changed)

The loader validates ALL v5.x against ONE schema, so versions are documentation/intent markers more than enforced grammars. Best-effort timeline (from docs + git history of `core/handlers/v2/schema.json` and `simulation_views.go`):

| Version          | What it introduced / notable                                                                                                                                                                                                                                                                                                                                                            |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `v5` (base)      | The v5 simulation format: `data.pairs` (request matchers as arrays of field-matchers), `data.globalActions.delays`, `meta` block. Replaced v1–v4 (which are auto-upgraded).                                                                                                                                                                                                             |
| `v5.1`           | Query matching as an **object keyed by param name** (`request.query: { name: [matchers] }`) instead of a single string; richer per-field matcher arrays.                                                                                                                                                                                                                                |
| `v5.2`           | **Array matcher** (`array` + `config.ignoreUnknown/ignoreOrder/ignoreOccurrences`, default for multi-value query/header captures), **Form matcher**, **JWT matcher** (`jwt`, `jwtjsonpath`), **matcher chaining** (`doMatch`), and **log-normal delays** (`globalActions.delaysLogNormal` + per-response `logNormalDelay`). Commit "update v5.2 simulation schema file" (Jan 24, 2023). |
| `v5.3` (current) | **`postServeAction`** field on responses (Sep 2023, "change schema and add basic tutorial"); **`labels`** array on request-response pairs (Jul 2024, "Add labels to request response pair"). `SchemaVersion: "v5.3"` constant in `simulation_views.go`.                                                                                                                                 |

> The single maintained schema means: a `v5` file may legally contain `v5.3`-era fields and still validate. The LSP can optionally surface _informational_ hints when a field is used that postdates the declared `schemaVersion` (e.g. `labels` in a file declaring `v5`), but must NOT treat it as a hard error.

---

## 12. Matching algorithm (for "type-checking"/diagnostics context)

- Two strategies, set via CLI: `hoverctl mode simulate --matching-strategy=strongest` (default) or `=first`.
- **Strongest match (default)**: each passing field matcher = **+1**. If **any** matcher fails, the pair is unmatched regardless of score. Highest-scoring matching pair wins; on a tie, the **last** matching pair in the simulation is chosen.
- **First match (legacy/perf)**: returns the first pair whose matchers all pass; no scoring.
- Absent request fields are not evaluated (they don't reduce score or block).
- `requiresState` participates as a gate (all required key=value must be present in current state).

---

## 13. Canonical full example (v5)

```json
{
  "data": {
    "pairs": [
      {
        "request": {
          "path": [{ "matcher": "exact", "value": "/" }],
          "method": [{ "matcher": "exact", "value": "GET" }],
          "destination": [{ "matcher": "exact", "value": "myhost.io" }],
          "scheme": [{ "matcher": "exact", "value": "https" }],
          "body": [{ "matcher": "exact", "value": "" }],
          "headers": {},
          "query": {}
        },
        "response": {
          "status": 200,
          "body": "<h1>Matched on recording</h1>",
          "encodedBody": false,
          "headers": { "Content-Type": ["text/html; charset=utf-8"] },
          "templated": false
        }
      }
    ],
    "globalActions": { "delays": [], "delaysLogNormal": [] }
  },
  "meta": {
    "schemaVersion": "v5",
    "hoverflyVersion": "v1.0.0",
    "timeExported": "2019-05-30T22:14:24+01:00"
  }
}
```

---

## 14. LSP design recommendations (derived)

1. **Bundle the JSON Schema** (`core/handlers/v2/schema.json`) for baseline structural validation, but note it is permissive (`value:{}`, most fields optional).
2. **Matcher-name enum diagnostics**: validate `matcher` against the set in §4; offer completion. Unknown matcher = error.
3. **Per-matcher value-type checks** (the schema can't do these): `array`→array, `form`→object-of-matcher-arrays, string matchers→string, `json`/`jsonPartial`→valid JSON, `regex`→valid RE2, `jsonpath`/`xpath`→syntactically valid expression.
4. **`config` only valid on `array`**; flag `config` elsewhere; flag string `"true"`/`"false"` (should be boolean).
5. **`form` matcher only valid in `request.body`**; flag elsewhere.
6. **Template-aware validation** inside `body`/`headers` when `templated:true`: parse `{{ }}`, validate helper names against §10, validate `Vars.X`/`Literals.X` against `data.variables`/`data.literals`, complete helper signatures, hover docs.
7. **State cross-referencing**: complete/validate `requiresState` keys against `transitionsState` keys elsewhere; special-case `sequence:` prefix.
8. **`bodyFile`**: path completion; missing-file = warning (resolution is runtime/flag-dependent); note `body` overrides `bodyFile`.
9. **Version hints**: optional info diagnostic when a field postdates declared `schemaVersion` (§11) — never a hard error.
10. **Hover docs**: every field/matcher/helper here has a one-line description suitable for hover content.

```

```
