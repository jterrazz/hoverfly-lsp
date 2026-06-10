# Prior Art Survey: hoverfly-lsp

**Research date**: 2026-06-11  
**Hoverfly version surveyed**: v1.12.8 (latest release as of survey date)  
**Current default schemaVersion**: `v5.3`

---

## 1. Existing Hoverfly IDE Tooling — What Already Exists

### 1.1 VS Code Marketplace

A search of the Visual Studio Code Marketplace for "hoverfly" returns **zero dedicated Hoverfly extensions**. The closest results are unrelated extensions whose names contain the word "hover" (e.g., `kdheepak.hovercraft`, `go-flutter.hover`). No extension provides simulation-file awareness, schema validation, or completion for Hoverfly JSON.

### 1.2 npm Registry

- `hoverfly` (npm) — version 0.8.2, last published **10 years ago**. This is an unmaintained fork/binary wrapper, not an IDE tool.
- `@bwilczek/hoverfly-client` — a thin REST API client for Hoverfly's admin API, not an IDE tool.
- `SpectoLabs/hoverfly-npm` (GitHub) — contains a `bin/` folder; appears to be a binary installer helper. No releases published, no IDE tooling.

**Conclusion: no npm-distributed Hoverfly language tooling exists.**

### 1.3 SchemaStore.org

A programmatic search of the SchemaStore catalog (`src/api/json/catalog.json`, 10 369 entries) returned **zero matches** for "hoverfly". The simulation JSON schema is not registered with SchemaStore. This is a clear gap — registering there would give free IDE integration for any editor that ships with SchemaStore support (VS Code via the built-in JSON language server, JetBrains IDEs, etc.).

Related issue: GitHub issue #446 on `SpectoLabs/hoverfly` — "JSON Schema for simulation data files" — was filed in 2018, included a community-drafted JSON Schema Draft 4 attempt, and was closed with the label "awaiting-fix-release". The official schema was eventually added at `core/handlers/v2/schema.json` in the repository, but it was **never submitted to SchemaStore** and has **no `$schema` declaration** at its root. This means editors cannot auto-discover it via the standard `$schema` property mechanism.

### 1.4 Linters and CLI Validation

There is **no standalone Hoverfly simulation linter** as a separate tool. Validation occurs only at import time through the Hoverfly server or `hoverctl` (see Section 2).

### 1.5 Other IDE Plugins (IntelliJ, Zed, Helix, Neovim)

No Hoverfly-specific plugins exist for IntelliJ IDEA, Zed, Helix, or Neovim. The JetBrains plugin marketplace has zero results for "hoverfly".

**Summary: The field is completely empty. hoverfly-lsp has no competitor to worry about and no existing work to fork.**

---

## 2. How Hoverfly Validates Simulations

### 2.1 Validation Entry Point

Validation occurs in `core/handlers/v2/simulation_views.go` via the function `NewSimulationViewFromRequestBody`. It is triggered by:

1. `PUT /api/v2/simulation` (REST API)
2. `hoverctl simulation import <file>`
3. `hoverctl import <file>` (older alias)
4. Startup-time import via `--import` flag

There is **no `hoverctl simulation validate` subcommand** that validates without importing. Validation is inseparable from import.

### 2.2 Validation Logic

The code uses [gojsonschema](https://github.com/xeipuuv/gojsonschema) to validate the parsed JSON map against the embedded schema. The flow is:

```
1. json.Unmarshal → if fail → "Invalid JSON"
2. check jsonMap["meta"] == nil → "Invalid JSON, missing \"meta\" object"
3. check meta["schemaVersion"] == nil → "Invalid JSON, missing \"meta.schemaVersion\" string"
4. dispatch on schemaVersion:
   - HasPrefix("v5") → ValidateSimulationSchemaFromFile(jsonMap, SimulationViewV5Schema)
   - "v4" || "v3"   → ValidateSimulation(jsonMap, SimulationViewV4Schema) → upgrade to v5
   - "v2"           → ValidateSimulation(jsonMap, SimulationViewV2Schema) → upgrade to v5
   - "v1"           → ValidateSimulation(jsonMap, SimulationViewV1Schema) → upgrade to v5
   - otherwise      → fmt.Errorf("Invalid simulation: schema version %v is not supported...")
5. gojsonschema result → if !Valid():
   collect "Error for <%s>: %s" per field/description
   return "[Error for <field>: description; Error for <field2>: description2]"
```

HTTP responses:

- Parse failure → **HTTP 400** with error string
- Import/storage failure → **HTTP 500** with `"An error occurred: " + err.Error()`

### 2.3 Warning Messages (Exact Strings)

These warning messages are returned as part of `SimulationImportResult.WarningMessages` on a successful (HTTP 200) import. The LSP should mirror these as diagnostics:

```go
// Declared as constants in simulation_views.go:

ContentLengthAndTransferEncodingMessage =
  "Response contains both Content-Length and Transfer-Encoding headers on data.pairs[%v].response, please remove one of these headers"

BodyAndBodyFileMessage =
  "Response contains both `body` and `bodyFile` in data.pairs[%v].response, please remove one of them otherwise `body` is used if non empty"

ContentLengthMismatchMessage =
  "Response contains incorrect Content-Length header on data.pairs[%v].response, please correct or remove header"

pairIgnoredMessage =
  "data.pairs[%v] is not added due to a conflict with the existing simulation"
```

The warning struct also carries a `DocsLink` field (JSON: `"documentation"`) for linking to documentation.

### 2.4 Error Message Format to Mirror

For field-level schema violations, Hoverfly produces:

```
[Error for <json-path>: <description>; Error for <json-path2>: <description2>]
```

The LSP should use the same field path format (`data.pairs[0].response`, etc.) in diagnostic messages to maintain consistency with what users see when they run the import command.

---

## 3. Hoverfly Ecosystem Formats — What NOT to Confuse

### 3.1 The Target: Hoverfly Simulation JSON

The **single target format** is the Hoverfly simulation JSON file. Key identifier: the file has a top-level `{ "data": {...}, "meta": { "schemaVersion": "v5.x" } }` structure. Files typically use `.json` extension with no enforced naming convention (common names: `simulation.json`, `*.hoverfly.json`).

The official JSON schema lives at:

```
https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/core/handlers/v2/schema.json
```

It uses an internal draft (no `$schema` declaration), contains 300 lines, and defines all types via `$ref` definitions. Notable: the schema does **not** enumerate valid `matcher` string values as an enum — it accepts any string. Semantic validation of matcher type names (e.g., ensuring `"matcher": "exactt"` is flagged) must therefore be done by the LSP, not by the JSON schema alone.

### 3.2 Hoverfly-Java DSL (NOT a file format)

`SpectoLabs/hoverfly-java` (latest: v0.20.1, updated Oct 2025) provides a **fluent Java builder API** — it is purely a programmatic DSL in Java code, not a file format. It generates the same v5 simulation JSON internally and can export/import it, but users writing Java code get IDE support from standard Java tooling. The LSP does not need to support Java DSL syntax.

Example DSL (Java code, not a file):

```java
HoverflyDSL.service("api.example.com")
    .get("/api/books")
    .willReturn(ResponseCreators.success(json("{...}")));
```

### 3.3 Middleware

Hoverfly middleware is **not configured inside the simulation JSON file**. Middleware is set via:

- The `PUT /api/v2/hoverfly/middleware` endpoint (disabled by default)
- `hoverctl` CLI flags at startup

Middleware receives and returns JSON matching the simulation schema's pair structure (to allow in-flight transformation), but this is a runtime data pipe, not a file format the LSP needs to understand.

### 3.4 postServeAction

The `response.postServeAction` field in a simulation JSON is a **plain string** — it is just the registered action name. Registered actions are external to the simulation file (registered via API or CLI at runtime). The LSP cannot validate that the name references a real registered action (it is runtime-only), but it can provide completion for known action name patterns and hover docs explaining the field.

### 3.5 hoverfly-python (HoverPy), hoverfly-.NET, other bindings

All bindings ultimately produce or consume the same v5 simulation JSON. None define their own file formats that the LSP needs to support.

### 3.6 Hoverfly Cloud

Hoverfly Cloud is a SaaS built on top of open-source Hoverfly. It uses the same simulation JSON format (including support for OpenAPI/Postman imports as an additional ingestion path, but the exported simulation is still v5 JSON). The LSP targeting open-source Hoverfly simulation files will therefore be fully applicable to Hoverfly Cloud users as well.

---

## 4. The Hoverfly Simulation Schema — Complete Reference for LSP

### 4.1 Raw Schema (from `core/handlers/v2/schema.json`, master, June 2026)

```json
{
  "additionalProperties": false,
  "description": "Hoverfly simulation schema",
  "required": ["data", "meta"],
  "type": "object",
  "properties": {
    "data": {
      "type": "object",
      "properties": {
        "globalActions": {
          "type": "object",
          "properties": {
            "delays": { "type": "array", "items": { "$ref": "#/definitions/delay" } },
            "delaysLogNormal": {
              "type": "array",
              "items": { "$ref": "#/definitions/delay-log-normal" }
            }
          }
        },
        "literals": { "type": "array", "items": { "$ref": "#/definitions/literals" } },
        "pairs": { "type": "array", "items": { "$ref": "#/definitions/request-response-pair" } },
        "variables": { "type": "array", "items": { "$ref": "#/definitions/variables" } }
      }
    },
    "meta": { "$ref": "#/definitions/meta" }
  },
  "definitions": {
    "delay": {
      "type": "object",
      "properties": {
        "delay": { "type": "integer" },
        "httpMethod": { "type": "string" },
        "urlPattern": { "type": "string" }
      }
    },
    "delay-log-normal": {
      "type": "object",
      "properties": {
        "httpMethod": { "type": "string" },
        "max": { "type": "integer" },
        "mean": { "type": "integer" },
        "median": { "type": "integer" },
        "min": { "type": "integer" },
        "urlPattern": { "type": "string" }
      }
    },
    "field-matchers": {
      "type": "object",
      "properties": {
        "matcher": { "type": "string" },
        "value": {},
        "config": {
          "type": "object",
          "properties": {
            "ignoreUnknown": { "type": "boolean" },
            "ignoreOrder": { "type": "boolean" },
            "ignoreOccurrences": { "type": "boolean" }
          }
        },
        "doMatch": { "$ref": "#/definitions/field-matchers" }
      }
    },
    "headers": {
      "type": "object",
      "additionalProperties": { "type": "array", "items": { "type": "string" } }
    },
    "literals": {
      "type": "object",
      "required": ["name", "value"],
      "properties": {
        "name": { "type": "string" },
        "value": {}
      }
    },
    "meta": {
      "type": "object",
      "required": ["schemaVersion"],
      "properties": {
        "hoverflyVersion": { "type": "string" },
        "schemaVersion": { "type": "string" },
        "timeExported": { "type": "string" }
      }
    },
    "request": {
      "type": "object",
      "properties": {
        "body": { "type": "array", "items": { "$ref": "#/definitions/field-matchers" } },
        "destination": { "type": "array", "items": { "$ref": "#/definitions/field-matchers" } },
        "headers": { "$ref": "#/definitions/request-headers" },
        "path": { "type": "array", "items": { "$ref": "#/definitions/field-matchers" } },
        "query": { "$ref": "#/definitions/request-queries" },
        "requiresState": {
          "type": "object",
          "patternProperties": { ".{1,}": { "type": "string" } }
        },
        "scheme": { "type": "array", "items": { "$ref": "#/definitions/field-matchers" } }
      }
    },
    "request-headers": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": { "$ref": "#/definitions/field-matchers" }
      }
    },
    "request-queries": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": { "$ref": "#/definitions/field-matchers" }
      }
    },
    "request-response-pair": {
      "type": "object",
      "required": ["request", "response"],
      "properties": {
        "labels": { "type": "array", "items": { "type": "string" } },
        "request": { "$ref": "#/definitions/request" },
        "response": { "$ref": "#/definitions/response" }
      }
    },
    "response": {
      "type": "object",
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
          "type": "object",
          "patternProperties": { ".{1,}": { "type": "string" } }
        }
      }
    },
    "variables": {
      "type": "object",
      "required": ["name", "function"],
      "properties": {
        "name": { "type": "string" },
        "function": { "type": "string" },
        "arguments": { "type": "array" }
      }
    }
  }
}
```

### 4.2 Schema Version History

| schemaVersion string | Hoverfly era | Notes                                                      |
| -------------------- | ------------ | ---------------------------------------------------------- |
| `v1`                 | Pre-0.10     | Old flat format; auto-upgraded to v5 at import             |
| `v2`                 | ~0.10–0.11   | Introduced request matchers; auto-upgraded                 |
| `v3`                 | Transitional | Validated via V4 schema; auto-upgraded                     |
| `v4`                 | ~0.14–0.15   | Modern matcher structure; auto-upgraded                    |
| `v5.x` (e.g. `v5.3`) | Current      | Active; `HasPrefix("v5")` match; `v5.3` is current default |

The LSP should target `v5.x` as the canonical schema. Files with older versions are still valid (Hoverfly upgrades them transparently), so the LSP should accept them without hard errors.

### 4.3 Matcher Types (Semantic Validation — Not in JSON Schema)

The `matcher` field accepts any string in the JSON schema, but only the following values are semantically valid. The LSP must implement this as a semantic diagnostic and provide completion:

| Matcher value | Description                                                      |
| ------------- | ---------------------------------------------------------------- |
| `exact`       | Exact string equality (default for captured simulations)         |
| `negate`      | Inverse of exact                                                 |
| `glob`        | Wildcard with `*` (BASH-style)                                   |
| `regex`       | Full regular expression                                          |
| `json`        | Full JSON document equality                                      |
| `jsonPartial` | Subset JSON match (ignores absent fields)                        |
| `jsonpath`    | JSONPath expression match                                        |
| `xpath`       | XPath expression match                                           |
| `xml`         | Full XML document equality                                       |
| `array`       | Array containment (with `config` options)                        |
| `jwt`         | JWT token matching via JSON partial                              |
| `jwtjsonpath` | JSONPath executed against decoded JWT `{"header":…,"payload":…}` |
| `form`        | `application/x-www-form-urlencoded` form data matching           |

The `doMatch` field enables chaining — the output of one matcher is fed as input to another. This is a recursive `$ref` back to `field-matchers`.

---

## 5. Templating System — The Primary LSP Challenge

When `response.templated = true`, the `response.body` string is processed by a Handlebars engine (Go library: [raymond](https://github.com/aymerick/raymond)). The LSP must treat this string as an **embedded sub-language**.

### 5.1 Syntax Patterns

All template expressions use `{{ }}` delimiters (double-mustache). Block helpers use `{{#name}}…{{/name}}`.

### 5.2 Request Variables (`Request.*`)

```
{{ Request.Scheme }}                        — "http" or "https"
{{ Request.Method }}                        — GET, POST, etc.
{{ Request.Host }}                          — hostname
{{ Request.Path.[N] }}                      — Nth path segment (0-indexed)
{{ Request.QueryParam.NAME }}               — single query param
{{ Request.QueryParam.NAME.[N] }}           — Nth value of multi-value query param
{{ Request.Header.NAME }}                   — request header value
{{ Request.Header.NAME.[N] }}               — Nth value of multi-value header
{{ Request.Body 'jsonpath' '$.field' }}     — JSONPath extraction from JSON body
{{ Request.Body 'xpath' '//element' }}      — XPath extraction from XML body
{{ Request.FormData.FIELD }}                — form data field
{{ State.KEY }}                             — stateful key-value store access
{{ Literals.NAME }}                         — simulation-level literal
{{ Vars.NAME }}                             — simulation-level variable helper
```

### 5.3 Helper Functions

**Random data:**

```
{{ randomString }}
{{ randomStringLength N }}
{{ randomBoolean }}
{{ randomInteger }}
{{ randomIntegerRange MIN MAX }}
{{ randomFloat }}
{{ randomFloatRange MIN MAX }}
{{ randomEmail }}
{{ randomIPv4 }}
{{ randomIPv6 }}
{{ randomUuid }}
```

**Date/time:**

```
{{ now 'OFFSET' 'FORMAT' }}
```

- Offsets: `ns`, `us`, `ms`, `s`, `m`, `h`, `d`, `y` (prefix `-` to subtract)
- Formats: `unix`, `epoch`, or Go time layout strings like `2006-01-02T15:04:05Z`

**Faker:**

```
{{ faker 'TYPE' }}  — e.g., 'Name', 'Email', 'PhoneNumber'
```

**Math:**

```
{{ add NUM1 NUM2 'PRECISION' }}
{{ subtract NUM1 NUM2 'PRECISION' }}
{{ multiply NUM1 NUM2 'PRECISION' }}
{{ divide NUM1 NUM2 'PRECISION' }}
{{ sum ARRAY 'PRECISION' }}
```

**Validation helpers:**

```
{{ isNumeric VALUE }}
{{ isAlphanumeric VALUE }}
{{ isBool VALUE }}
{{ isGreater VAL1 VAL2 }}
{{ isLess VAL1 VAL2 }}
{{ isBetween VAL MIN MAX }}
{{ matchesRegex STRING 'PATTERN' }}
```

**Response control:**

```
{{ setStatusCode CODE }}
{{ setHeader "NAME" "VALUE" }}
```

**JWT:**

```
{{ jsonFromJWT '$.CLAIM' HEADER }}
```

**CSV data source:**

```
{{ csv 'SOURCE' 'COLUMN' 'VALUE' 'RETURN_COL' }}
{{ csvAsMap 'SOURCE' }}
{{ csvMatchingRows 'SOURCE' 'COL' 'VAL' }}
{{ csvAsArray 'SOURCE' }}
{{ csvSqlCommand 'SQL_QUERY' }}
{{ csvAddRow 'SOURCE' ARRAY }}
{{ csvDeleteRows 'SOURCE' 'COL' 'VAL' BOOLEAN }}
{{ csvCountRows 'SOURCE' }}
```

**Journal (replay/audit log):**

```
{{ journal "INDEX" "KEY" "request|response" "jsonpath|xpath" "QUERY" }}
{{ hasJournalKey "INDEX" "KEY" }}
```

**Key-value store (per-request-session):**

```
{{ putValue 'KEY' VALUE BOOLEAN }}
{{ getValue 'KEY' }}
{{ addToArray 'ARRAY' VALUE BOOLEAN }}
{{ getArray 'ARRAY' }}
{{ initArray 'ARRAY' }}
```

**Block helpers (Handlebars control flow):**

```
{{#if CONDITION}}…{{/if}}
{{#unless CONDITION}}…{{/unless}}
{{#each ARRAY}}…{{ this }}…{{/each}}
{{#equal VAL1 VAL2}}…{{else}}…{{/equal}}
{{#unless @last}},{{/unless}}           — loop metadata
```

### 5.4 Template Activation Rule

Templates are **only processed when `response.templated = true`**. The LSP should:

1. When `templated` is absent or `false`: treat `response.body` as a plain string (no template diagnostics).
2. When `templated` is `true`: parse the body string for `{{ }}` expressions and provide diagnostics + completion.

---

## 6. Comparable "JSON Dialect LSP" Projects

### 6.1 `microsoft/vscode-json-languageservice` (TypeScript, MIT)

**Repository**: https://github.com/microsoft/vscode-json-languageservice  
**npm**: `vscode-json-languageservice`  
**Role**: The foundational building block used by VS Code's built-in JSON support and by virtually every other JSON-based language service.

**Architecture**:

- Parses JSON text to an AST (`JSONDocument`) using `jsonc-parser`
- Central `LanguageService` facade with methods: `parseJSONDocument`, `doValidation`, `doComplete`, `doResolve`, `doHover`, `findDocumentSymbols`, `getMatchingSchemas`, `format`, `getFoldingRanges`, `getSelectionRanges`
- Schema management via `configure({ schemas: [...] })` and `resetSchema(uri)`
- Uses `vscode-languageserver-types` for LSP-compliant diagnostic/completion/hover types

**String template support**: None built-in. The service validates JSON structure and schema conformance only — it has no mechanism to parse inside string values. GitHub issue #59 ("how to leverage JSON validation and syntax highlight") and issue #124 ("Is custom JSON Schema Format Validation on the roadmap") both confirm that custom string-value validators are not supported in the base library. They must be layered on top.

**Key recommendation for hoverfly-lsp**: Use `vscode-json-languageservice` for the structural/schema layer, then add a custom pass over string-valued AST nodes where `templated=true` to perform template syntax parsing and completion. The `getMatchingSchemas` API can identify which AST nodes correspond to `response.body` fields, enabling targeted template injection.

### 6.2 `aws/amazon-states-language-service` (TypeScript, Apache-2.0)

**Repository**: https://github.com/aws/amazon-states-language-service  
**Role**: LSP for Amazon States Language (ASL), the JSON dialect used by AWS Step Functions.  
**Last release**: v1.7.0, May 2026.

**Why it is the closest analog**: ASL is a JSON file where certain string fields contain "intrinsic function" expressions like `States.Format('Hello {}', $.name)` and `States.JsonMerge($$, $$.context, false)` — these are structurally identical to Hoverfly's `{{ Request.Body 'jsonpath' '$.field' }}` embedded in `body` strings. Both are DSL-within-string-within-JSON.

**Architecture**:

- Wraps `vscode-json-languageservice` as a drop-in replacement: it extends the interface, adding ASL-specific validation and completion while delegating generic JSON operations to the base library
- Language: TypeScript (99.7%)
- Tooling: ESLint, Prettier, Jest, Babel

**How it handles intrinsic-function validation inside strings**:
The library maintains an ASL-aware validation pass that runs after JSON schema validation. When the schema check passes, it traverses the AST looking for nodes that should contain intrinsic functions (identified by field names and context). For those nodes, it:

1. Tokenizes the string value looking for `States.*` prefixes
2. Validates function names against a known list
3. Validates argument counts and types
4. Produces LSP diagnostics with precise character ranges inside the string

This is the pattern hoverfly-lsp should follow for `response.body` when `templated=true`.

**Known pain point**: GitHub issues #2938 and #3049 document that the extension incorrectly flagged valid intrinsic functions as errors. This was caused by the JSON schema validation (which marks string fields as invalid when they contain `States.UUID()` syntax) conflicting with the semantic layer. The fix was to suppress JSON-schema-level type errors for fields that undergo custom semantic validation. **hoverfly-lsp must implement the same suppression** to prevent the base JSON schema from flagging valid template strings.

**Key implementation lesson**: Do not rely on the JSON schema's `"type": "string"` validator to accept template expressions. Instead, suppress JSON-schema errors for `response.body` when `templated=true` and replace them with custom template-aware diagnostics.

### 6.3 `aws-cloudformation/cloudformation-languageserver` (TypeScript, Apache-2.0)

**Repository**: https://github.com/aws-cloudformation/cloudformation-languageserver  
**Last release**: v1.7.0, May 2026 (actively maintained)  
**Language**: TypeScript (96.9%)

**Why it is relevant**: CloudFormation templates are JSON/YAML where `Fn::Sub` takes a string with embedded `${VariableName}` interpolations, and `Ref` / `Fn::GetAtt` take string argument values that must resolve to existing resource logical IDs. This is analogous to Hoverfly's `{{ State.KEY }}` referencing state keys defined elsewhere in the simulation.

**Feature set**:

- Completion: resource types, properties, intrinsic function names with fuzzy matching
- Hover: documentation for resources, properties, functions
- Diagnostics: JSON schema + semantic validation (via `cfn-lint` Python integration) + AWS Guard policy checks
- Navigation: go-to-definition for `Ref` and `GetAtt` (jumps to the referenced resource)
- Refactoring: quick fixes, parameter extraction
- Architecture: tree-sitter for parsing (supports partial/incomplete documents), regional schema caching

**Template-in-string approach for `Fn::Sub`**:
The CloudFormation LSP parses `Fn::Sub` string values using a custom tokenizer that identifies `${...}` variable references. It then resolves those references against the template's `Parameters` and `Resources` sections. Completion inside `Fn::Sub` strings offers known parameter names and resource IDs.

**Key recommendation for hoverfly-lsp**: This "cross-reference within the document" pattern is directly applicable to Hoverfly's `{{ State.KEY }}` and `{{ Vars.NAME }}` — the LSP should resolve these against the simulation's `data.variables`, `data.literals`, and the aggregate of all `requiresState` / `transitionsState` key names found in the file.

### 6.4 `redhat-developer/yaml-language-server` (TypeScript, MIT)

**Repository**: https://github.com/redhat-developer/yaml-language-server  
**npm**: `yaml-language-server`  
**1489+ commits, actively maintained**

**Why it is relevant**: YAML-LS is the canonical example of wrapping `vscode-json-languageservice` for a different surface syntax while adding semantic smarts. It supports:

- JSON Schema drafts 04, 07, 2019-09, 2020-12
- SchemaStore integration (auto-fetches schemas)
- Custom schema associations (modeline, config, glob patterns)
- Multiple editors (VS Code, Neovim, IntelliJ via lsp4ij)

**Key lesson for hoverfly-lsp**: Its `CustomSchemaProvider` API and the modeline mechanism (a `# yaml-language-server: $schema=...` comment) can be adapted: for Hoverfly, the LSP should auto-activate when it detects `"schemaVersion": "v5.x"` in `meta`.

### 6.5 `Redocly/redocly-vs-code` (OpenAPI)

**Repository**: https://github.com/Redocly/redocly-vs-code  
**Feature set**: validation, `$ref` completion (context-aware: `$ref` inside `requestBody` only offers `components.requestBodies`), multi-file ref resolution, go-to-definition for `$ref`, inline preview, documentation preview

**Relevant pattern for hoverfly-lsp**: The "context-aware completion inside string value" approach — knowing that a specific string field (`$ref`) has constrained semantics — is exactly the pattern needed for Hoverfly's `matcher` field (only valid matcher type strings) and `response.body` (only valid template syntax when `templated=true`).

### 6.6 `well-ar.vscode-wiremock` (WireMock — closest competitor in domain)

**VS Code Marketplace**: https://marketplace.visualstudio.com/items?itemName=well-ar.vscode-wiremock  
**Features**: Start WireMock server, create stubs, auto-reload on file change, **JSON Schema validation**

WireMock is Hoverfly's primary competitor in the API mocking space. Its VS Code extension ships JSON schema validation as its primary IDE feature. This confirms market demand and sets the baseline: users of API mocking tools expect at minimum schema-validated JSON in their editor.

**Gap vs. hoverfly-lsp target**: The WireMock extension has no completion, no hover docs, no template-string awareness, and no semantic validation beyond the schema. hoverfly-lsp targets a substantially richer feature set.

---

## 7. Hoverfly Project Health

### 7.1 Release Cadence (GitHub API data, June 2026)

| Tag     | Release date |
| ------- | ------------ |
| v1.12.8 | 2026-05-31   |
| v1.12.7 | 2026-05-08   |
| v1.12.6 | 2026-04-07   |
| v1.12.5 | 2026-02-14   |
| v1.12.4 | 2025-12-19   |

**Assessment**: ~1 release per month throughout 2025–2026. The project is **actively maintained** by iOCO Solutions (who acquired it from SpectoLabs). The `hoverfly-github-action` was updated in February 2026; `hoverfly-java` docs PDF was regenerated in October 2025.

### 7.2 Schema Stability

The current simulation schema is `v5.3`. The `schemaVersion` field uses `strings.HasPrefix(schemaVersion, "v5")` matching, meaning any `v5.x` value is accepted. The JSON schema file (`core/handlers/v2/schema.json`) has been structurally stable for several years — field additions (not removals) is the observed pattern for v5.x revisions.

**Implication for hoverfly-lsp**: The LSP can safely pin to the `v5.x` schema as a stable foundation. Schema version bumps are expected to be additive. The LSP should:

1. Embed the schema as a bundled asset (not fetch at runtime).
2. Pin the schema commit hash in the LSP repository with a note to re-audit on each Hoverfly minor release.
3. Accept any `v5.x` string in `meta.schemaVersion` without hard errors.

### 7.3 Security Note

A Remote Code Execution vulnerability exists in Hoverfly via unsecured middleware execution. This is a runtime server concern and does not affect the LSP (which processes files statically). No LSP action required.

---

## 8. Recommendations for Implementation

Based on this prior-art survey, the following architectural decisions are recommended:

### 8.1 Foundation

- **Use `vscode-json-languageservice`** as the structural JSON layer. It is the de facto standard, battle-tested, and gives VS Code/Monaco/Zed compatibility for free.
- **Mirror `amazon-states-language-service`'s wrapper pattern**: implement `HoverflyLanguageService` that wraps `vscode-json-languageservice`, overrides `doValidation` to append semantic diagnostics, and overrides `doComplete` to inject template-aware completions.
- **TypeScript** is strongly indicated: all three closest analogs (amazon-states-language-service, cloudformation-languageserver, yaml-language-server) use TypeScript. The ecosystem of `vscode-languageserver` and `vscode-languageserver-node` is TypeScript-native.

### 8.2 Schema Registration

- **Submit the Hoverfly schema to SchemaStore** (https://github.com/SchemaStore/schemastore) as a separate contribution. File glob patterns: `*.hoverfly.json`, `hoverfly.json`, `simulation.json` (with `meta.schemaVersion` trigger). This gives free schema validation to all VS Code users with zero LSP install required, and complements the LSP for users who don't install it.
- Add `"$schema": "http://json-schema.org/draft-04/schema#"` to the submitted schema (the official schema lacks this).

### 8.3 Template-in-String Implementation

- **Auto-detect templating context**: traverse the AST, find `response` nodes that contain `"templated": true`, then apply template parsing to the sibling `body` field.
- **Suppress JSON schema errors** for `response.body` when `templated=true` (the schema defines `body` as `{ "type": "string" }`, but `{{ ... }}` syntax is valid — see ASL issue #3049 for the exact bug to avoid).
- **Parse `{{ }}` expressions** using a simple tokenizer (not a full Handlebars parser): the LSP needs to extract function names, `Request.*` paths, and `State.*` key names from the expression. A regex-based tokenizer scanning for `{{[^}]+}}` is sufficient.
- **Resolve `{{ State.KEY }}` and `{{ Vars.NAME }}`** against the simulation document's `data.variables`, `data.literals`, and the union of all `requiresState` / `transitionsState` keys present in `data.pairs[*].request` and `data.pairs[*].response`.

### 8.4 Semantic Validation Rules (Beyond Schema)

The JSON schema does not enforce these — the LSP must:

1. `matcher` field value must be one of the 13 known matcher types (error: `"Unknown matcher type 'exactt'. Valid types: exact, glob, regex, json, jsonPartial, jsonpath, xpath, xml, array, jwt, jwtjsonpath, form, negate"`)
2. `response.body` and `response.bodyFile` must not both be set (mirror: `BodyAndBodyFileMessage`)
3. `response.headers["Content-Length"]` + `response.headers["Transfer-Encoding"]` must not both be set (mirror: `ContentLengthAndTransferEncodingMessage`)
4. `response.headers["Content-Length"]` value should match actual body length when `encodedBody=false` (mirror: `ContentLengthMismatchMessage`)
5. `response.templated=true` without a `body` field is a warning (no body to template)
6. Template syntax errors inside `body` when `templated=true`: unmatched `{{`, unknown helper function names, `Request.Body` called without required arguments

### 8.5 File Identification Heuristic

No file extension is enforced. The LSP should activate on `.json` files where the root object contains both `"data"` and `"meta"` keys, and `meta.schemaVersion` starts with `"v"`. This is more reliable than filename matching.

---

## 9. Open Questions for the Architect

1. **Should the LSP activate only on explicitly named files** (e.g., `*.hoverfly.json`) or heuristically on any JSON file that looks like a simulation? Heuristic activation risks false positives on other JSON files.
2. **Can `postServeAction` completion be user-configurable?** The registered action names are runtime-only. The LSP could accept a workspace config (`hoverfly.registeredActions: ["myAction"]`) for completion.
3. **Should the LSP support older schema versions (v1–v4) beyond accepting them without errors?** Providing completion/hover for v4 structures is possible but adds implementation cost.
4. **Schema pinning strategy**: embed the schema bytes in the LSP binary (fast, no network dependency) vs. fetch from the Hoverfly GitHub raw URL at startup (always current, but requires network). Recommend embedding with a clear `SCHEMA_COMMIT=...` constant and a CI job to check for drift.
5. **Hoverfly Cloud compatibility**: Hoverfly Cloud adds features (AI simulation, OpenAPI import, Postman import) but the exported simulation JSON is still v5. No additional schema support should be needed, but this should be verified when Hoverfly Cloud publishes schema changes.

---

## Sources

- Hoverfly GitHub: https://github.com/SpectoLabs/hoverfly
- Hoverfly simulation schema (raw): https://raw.githubusercontent.com/SpectoLabs/hoverfly/master/core/handlers/v2/schema.json
- Hoverfly simulation schema docs: https://docs.hoverfly.io/en/latest/pages/reference/simulationschema.html
- Hoverfly templating docs: https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html
- Hoverfly request matchers docs: https://docs.hoverfly.io/en/latest/pages/reference/hoverfly/request_matchers.html
- Hoverfly simulation views source: https://github.com/SpectoLabs/hoverfly/blob/master/core/handlers/v2/simulation_views.go
- GitHub issue #446 (JSON Schema request): https://github.com/SpectoLabs/hoverfly/issues/446
- SchemaStore catalog: https://github.com/SchemaStore/schemastore/blob/master/src/api/json/catalog.json
- microsoft/vscode-json-languageservice: https://github.com/microsoft/vscode-json-languageservice
- aws/amazon-states-language-service: https://github.com/aws/amazon-states-language-service
- aws-cloudformation/cloudformation-languageserver: https://github.com/aws-cloudformation/cloudformation-languageserver
- redhat-developer/yaml-language-server: https://github.com/redhat-developer/yaml-language-server
- Redocly VS Code extension: https://github.com/Redocly/redocly-vs-code
- WireMock VS Code extension: https://marketplace.visualstudio.com/items?itemName=well-ar.vscode-wiremock
- armsnyder/openapi-language-server (Go): https://github.com/armsnyder/openapi-language-server
- vacuum OpenAPI LSP: https://quobix.com/vacuum/commands/language-server/
- Hoverfly-java DSL docs: https://docs.hoverfly.io/projects/hoverfly-java/en/latest/pages/corefunctionality/dsl.html
- Hoverfly postServeAction docs: https://docs.hoverfly.io/en/latest/pages/keyconcepts/postserveaction.html
- ASL intrinsic function false-positive issue: https://github.com/aws/aws-toolkit-vscode/issues/3049
