/**
 * Authoritative templating-helper catalog (architect decision D8).
 *
 * Transcribed from `research/08-templating-spec.md`, verified against the SpectoLabs/hoverfly
 * Go source (`core/templating/templating.go` `helperMethodMap`, `template_helpers.go`) and the
 * SpectoLabs/raymond fork (`helper.go`). Engine = SpectoLabs/raymond (a Handlebars fork).
 *
 * Two universes:
 *   - 52 Hoverfly helpers registered in `helperMethodMap` (all inline) — see HOVERFLY_HELPERS.
 *   - 8 raymond built-ins (`if/unless/with/each/first/log/lookup/equal`) — see RAYMOND_BUILTINS.
 *     `first` and `equal` are SpectoLabs-fork additions a generic Handlebars LS would not know.
 *
 * `data.variables[].function` accepts ONLY the 52 Hoverfly helpers (built-ins are not in
 * `SupportedMethodMap`) — see VARIABLE_FUNCTION_NAMES.
 *
 * Arity notes (report 08 §1): a trailing `*raymond.Options` param is supplied by raymond and
 * is NOT a user-typed argument, so it is excluded from `args` here. raymond does not enforce
 * arity at call time, so the validators should warn (not hard-fail) on mismatch.
 *
 * This module is pure data + types; the HF5xx template validators consume it later.
 */

const DOCS_TEMPLATING =
  "https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html";
const DOCS_HANDLEBARS = "https://handlebarsjs.com/guide/builtin-helpers.html";

/** Argument value kind as Hoverfly's `callHelper` reflects it (report 08 §1.1). */
export type HelperArgType = "any" | "array" | "bool" | "float" | "int" | "string";

export type HelperArg = {
  name: string;
  type: HelperArgType;
  /** Whether the argument may be omitted. */
  optional: boolean;
};

export type HelperSpec = {
  /** Helper name as registered (case-sensitive). */
  name: string;
  /** Positional arguments (excluding raymond's auto-injected `options`). */
  args: HelperArg[];
  /** Whether the helper takes a variable number of trailing arguments. */
  variadic?: boolean;
  /** Whether the helper is a block helper (`{{#name}}…{{/name}}`). */
  block: boolean;
  /** True for raymond built-ins; false for Hoverfly-registered helpers. */
  builtin: boolean;
  /** Short description plus, where useful, a footgun note. */
  docs: string;
  /** A representative usage example. */
  example: string;
};

/**
 * The 52 Hoverfly helpers (verbatim from `helperMethodMap`, report 08 §1). All inline.
 * Arities from the Go signatures in `template_helpers.go`.
 */
export const HOVERFLY_HELPERS: readonly HelperSpec[] = [
  {
    name: "now",
    args: [
      { name: "offset", type: "string", optional: true },
      { name: "format", type: "string", optional: true },
    ],
    block: false,
    builtin: false,
    docs: `Current time, optionally offset and formatted. format "" => RFC3339, "unix" => seconds, "epoch" => MILLISECONDS (misnamed), else a Go time layout. ${DOCS_TEMPLATING}`,
    example: "{{now '-1d' 'unix'}}",
  },
  {
    name: "randomString",
    args: [],
    block: false,
    builtin: false,
    docs: `Random string. ${DOCS_TEMPLATING}`,
    example: "{{randomString}}",
  },
  {
    name: "randomStringLength",
    args: [{ name: "length", type: "int", optional: false }],
    block: false,
    builtin: false,
    docs: `Random string of the given length. ${DOCS_TEMPLATING}`,
    example: "{{randomStringLength 10}}",
  },
  {
    name: "randomBoolean",
    args: [],
    block: false,
    builtin: false,
    docs: `Random boolean as the string "true"/"false". ${DOCS_TEMPLATING}`,
    example: "{{randomBoolean}}",
  },
  {
    name: "randomInteger",
    args: [],
    block: false,
    builtin: false,
    docs: `Random integer. ${DOCS_TEMPLATING}`,
    example: "{{randomInteger}}",
  },
  {
    name: "randomIntegerRange",
    args: [
      { name: "min", type: "int", optional: false },
      { name: "max", type: "int", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Random integer in [min, max]. ${DOCS_TEMPLATING}`,
    example: "{{randomIntegerRange 1 10}}",
  },
  {
    name: "randomFloat",
    args: [],
    block: false,
    builtin: false,
    docs: `Random float. ${DOCS_TEMPLATING}`,
    example: "{{randomFloat}}",
  },
  {
    name: "randomFloatRange",
    args: [
      { name: "min", type: "float", optional: false },
      { name: "max", type: "float", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Random float in [min, max]. ${DOCS_TEMPLATING}`,
    example: "{{randomFloatRange 1.0 2.0}}",
  },
  {
    name: "randomEmail",
    args: [],
    block: false,
    builtin: false,
    docs: `Random email (powered by icrowley/fake, NOT gofakeit). ${DOCS_TEMPLATING}`,
    example: "{{randomEmail}}",
  },
  {
    name: "randomIPv4",
    args: [],
    block: false,
    builtin: false,
    docs: `Random IPv4 address. ${DOCS_TEMPLATING}`,
    example: "{{randomIPv4}}",
  },
  {
    name: "randomIPv6",
    args: [],
    block: false,
    builtin: false,
    docs: `Random IPv6 address. ${DOCS_TEMPLATING}`,
    example: "{{randomIPv6}}",
  },
  {
    name: "randomUuid",
    args: [],
    block: false,
    builtin: false,
    docs: `Random UUID. ${DOCS_TEMPLATING}`,
    example: "{{randomUuid}}",
  },
  {
    name: "replace",
    args: [
      { name: "target", type: "string", optional: false },
      { name: "oldValue", type: "string", optional: false },
      { name: "newValue", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Replace all occurrences of oldValue with newValue in target. ${DOCS_TEMPLATING}`,
    example: "{{replace (Request.Body 'jsonpath' '$.x') 'a' 'b'}}",
  },
  {
    name: "split",
    args: [
      { name: "target", type: "string", optional: false },
      { name: "separator", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Split target into a []string by separator. ${DOCS_TEMPLATING}`,
    example: "{{split 'a,b,c' ','}}",
  },
  {
    name: "concat",
    args: [],
    variadic: true,
    block: false,
    builtin: false,
    docs: `Concatenate all arguments into one string; flattens any []interface{} argument. ${DOCS_TEMPLATING}`,
    example: "{{concat 'a' 'b' (getArray 'x')}}",
  },
  {
    name: "length",
    args: [{ name: "stringToCheck", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Length of the string, as a string. ${DOCS_TEMPLATING}`,
    example: "{{length 'hello'}}",
  },
  {
    name: "substring",
    args: [
      { name: "str", type: "string", optional: false },
      { name: "startStr", type: "string", optional: false },
      { name: "endStr", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Substring of str from start to end (indices passed as strings). ${DOCS_TEMPLATING}`,
    example: "{{substring 'hello' '0' '2'}}",
  },
  {
    name: "rightmostCharacters",
    args: [
      { name: "str", type: "string", optional: false },
      { name: "countStr", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `The rightmost N characters of str. ${DOCS_TEMPLATING}`,
    example: "{{rightmostCharacters '12345' '2'}}",
  },
  {
    name: "isNumeric",
    args: [{ name: "stringToCheck", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Returns bool — typically wrapped in #if. ${DOCS_TEMPLATING}`,
    example: "{{#if (isNumeric x)}}…{{/if}}",
  },
  {
    name: "isAlphanumeric",
    args: [{ name: "s", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Returns bool — alphanumeric check. ${DOCS_TEMPLATING}`,
    example: "{{isAlphanumeric x}}",
  },
  {
    name: "isBool",
    args: [{ name: "s", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Returns bool — boolean-string check. ${DOCS_TEMPLATING}`,
    example: "{{isBool x}}",
  },
  {
    name: "isGreaterThan",
    args: [
      { name: "value1", type: "string", optional: false },
      { name: "value2", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — value1 > value2. (Short form \`isGreater\` does NOT exist.) ${DOCS_TEMPLATING}`,
    example: "{{#if (isGreaterThan a b)}}…{{/if}}",
  },
  {
    name: "isGreaterThanOrEqual",
    args: [
      { name: "value1", type: "string", optional: false },
      { name: "value2", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — value1 >= value2. ${DOCS_TEMPLATING}`,
    example: "{{#if (isGreaterThanOrEqual a b)}}…{{/if}}",
  },
  {
    name: "isLessThan",
    args: [
      { name: "value1", type: "string", optional: false },
      { name: "value2", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — value1 < value2. (Short form \`isLess\` does NOT exist.) ${DOCS_TEMPLATING}`,
    example: "{{#if (isLessThan a b)}}…{{/if}}",
  },
  {
    name: "isLessThanOrEqual",
    args: [
      { name: "value1", type: "string", optional: false },
      { name: "value2", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — value1 <= value2. ${DOCS_TEMPLATING}`,
    example: "{{#if (isLessThanOrEqual a b)}}…{{/if}}",
  },
  {
    name: "isBetween",
    args: [
      { name: "value", type: "string", optional: false },
      { name: "min", type: "string", optional: false },
      { name: "max", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — min <= value <= max. ${DOCS_TEMPLATING}`,
    example: "{{isBetween x '1' '10'}}",
  },
  {
    name: "matchesRegex",
    args: [
      { name: "valueToCheck", type: "string", optional: false },
      { name: "pattern", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — value matches the regex pattern. ${DOCS_TEMPLATING}`,
    example: "{{matchesRegex x '^\\d+$'}}",
  },
  {
    name: "faker",
    args: [{ name: "fakerType", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Generate fake data via reflection over *gofakeit.Faker (v6.28.0). Only zero-arg method names are valid. ${DOCS_TEMPLATING}`,
    example: "{{faker 'Name'}}",
  },
  {
    name: "requestBody",
    args: [
      { name: "queryType", type: "string", optional: false },
      { name: "query", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Extract from the request body. queryType in {jsonpath, xpath, jsonpathfromxml}. Equivalent to the {{Request.Body ...}} method-call form. ${DOCS_TEMPLATING}`,
    example: "{{requestBody 'jsonpath' '$.x'}}",
  },
  {
    name: "csv",
    args: [
      { name: "dataSourceName", type: "string", optional: false },
      { name: "searchFieldName", type: "string", optional: false },
      { name: "searchFieldValue", type: "string", optional: false },
      { name: "returnFieldName", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Look up a single field in a CSV data source. ${DOCS_TEMPLATING}`,
    example: "{{csv 'pets' 'id' '1' 'name'}}",
  },
  {
    name: "csvMatchingRows",
    args: [
      { name: "dataSourceName", type: "string", optional: false },
      { name: "searchFieldName", type: "string", optional: false },
      { name: "searchFieldValue", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Return all matching CSV rows ([]RowMap) — iterate with #each. ${DOCS_TEMPLATING}`,
    example: "{{#each (csvMatchingRows 'pets' 'category' 'dogs')}}…{{/each}}",
  },
  {
    name: "csvAsArray",
    args: [{ name: "dataSourceName", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Return the CSV as [][]string — iterate with #each. ${DOCS_TEMPLATING}`,
    example: "{{#each (csvAsArray 'pets')}}…{{/each}}",
  },
  {
    name: "csvAsMap",
    args: [{ name: "dataSourceName", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Return the CSV as []RowMap — iterate with #each and access this.field. ${DOCS_TEMPLATING}`,
    example: "{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}",
  },
  {
    name: "csvAddRow",
    args: [
      { name: "dataSourceName", type: "string", optional: false },
      { name: "newRow", type: "array", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Append a row to a CSV data source (side effect). ${DOCS_TEMPLATING}`,
    example: "{{csvAddRow 'pets' (split 'a,b' ',')}}",
  },
  {
    name: "csvDeleteRows",
    args: [
      { name: "dataSourceName", type: "string", optional: false },
      { name: "searchFieldName", type: "string", optional: false },
      { name: "searchFieldValue", type: "string", optional: false },
      { name: "output", type: "bool", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Delete matching CSV rows; optionally output the deleted count. ${DOCS_TEMPLATING}`,
    example: "{{csvDeleteRows 'pets' 'category' 'cats' true}}",
  },
  {
    name: "csvCountRows",
    args: [{ name: "dataSourceName", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Count CSV rows, as a string. ${DOCS_TEMPLATING}`,
    example: "{{csvCountRows 'pets'}}",
  },
  {
    name: "csvSqlCommand",
    args: [{ name: "commandString", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Run a SQL command over CSV data sources; returns []RowMap — iterate with #each. ${DOCS_TEMPLATING}`,
    example: "{{#each (csvSqlCommand \"SELECT * FROM pets WHERE category='dogs'\")}}…{{/each}}",
  },
  {
    name: "journal",
    args: [
      { name: "indexName", type: "string", optional: false },
      { name: "keyValue", type: "string", optional: false },
      { name: "dataSource", type: "string", optional: false },
      { name: "queryType", type: "string", optional: false },
      { name: "lookupQuery", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Look up a value in the journal by index. ${DOCS_TEMPLATING}`,
    example: "{{journal 'orderId' '123' 'response' 'jsonpath' '$.status'}}",
  },
  {
    name: "hasJournalKey",
    args: [
      { name: "indexName", type: "string", optional: false },
      { name: "keyValue", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Returns bool — whether a journal index has the key. Typically wrapped in #if. ${DOCS_TEMPLATING}`,
    example: "{{#if (hasJournalKey 'orderId' '123')}}…{{/if}}",
  },
  {
    name: "setStatusCode",
    args: [{ name: "statusCode", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Override the response status (validated 100..599). Side effect; returns "". ${DOCS_TEMPLATING}`,
    example: "{{setStatusCode '404'}}",
  },
  {
    name: "setHeader",
    args: [
      { name: "headerName", type: "string", optional: false },
      { name: "headerValue", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Merge a response header. Side effect; returns "". ${DOCS_TEMPLATING}`,
    example: "{{setHeader 'X-Foo' 'bar'}}",
  },
  {
    name: "sum",
    args: [
      { name: "numbers", type: "array", optional: false },
      { name: "format", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Sum a []string of numbers, formatted. ${DOCS_TEMPLATING}`,
    example: "{{sum (getArray 'subtotal') '0.00'}}",
  },
  {
    name: "add",
    args: [
      { name: "val1", type: "string", optional: false },
      { name: "val2", type: "string", optional: false },
      { name: "format", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Add two numbers, formatted. ${DOCS_TEMPLATING}`,
    example: "{{add '1' '2' '0.00'}}",
  },
  {
    name: "subtract",
    args: [
      { name: "val1", type: "string", optional: false },
      { name: "val2", type: "string", optional: false },
      { name: "format", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Subtract val2 from val1, formatted. ${DOCS_TEMPLATING}`,
    example: "{{subtract '5' '2' ''}}",
  },
  {
    name: "multiply",
    args: [
      { name: "val1", type: "string", optional: false },
      { name: "val2", type: "string", optional: false },
      { name: "format", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Multiply two numbers, formatted. Commonly used as a subexpression. ${DOCS_TEMPLATING}`,
    example: "{{multiply (this.price) (this.qty) ''}}",
  },
  {
    name: "divide",
    args: [
      { name: "val1", type: "string", optional: false },
      { name: "val2", type: "string", optional: false },
      { name: "format", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Divide val1 by val2, formatted. ${DOCS_TEMPLATING}`,
    example: "{{divide '10' '4' '0.00'}}",
  },
  {
    name: "initArray",
    args: [{ name: "key", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Initialise a named array in the render context. Side effect; returns "". ${DOCS_TEMPLATING}`,
    example: "{{initArray 'subtotal'}}",
  },
  {
    name: "addToArray",
    args: [
      { name: "key", type: "string", optional: false },
      { name: "value", type: "string", optional: false },
      { name: "output", type: "bool", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Append to a named array; optionally output the value. ${DOCS_TEMPLATING}`,
    example: "{{addToArray 'subtotal' '5' false}}",
  },
  {
    name: "getArray",
    args: [{ name: "key", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Read a named array ([]string) from the render context. ${DOCS_TEMPLATING}`,
    example: "{{getArray 'subtotal'}}",
  },
  {
    name: "putValue",
    args: [
      { name: "key", type: "string", optional: false },
      { name: "value", type: "string", optional: false },
      { name: "output", type: "bool", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Store a named value; optionally output it. ${DOCS_TEMPLATING}`,
    example: "{{putValue 'k' 'v' false}}",
  },
  {
    name: "getValue",
    args: [{ name: "key", type: "string", optional: false }],
    block: false,
    builtin: false,
    docs: `Read a named value from the render context. ${DOCS_TEMPLATING}`,
    example: "{{getValue 'k'}}",
  },
  {
    name: "jsonFromJWT",
    args: [
      { name: "path", type: "string", optional: false },
      { name: "token", type: "string", optional: false },
    ],
    block: false,
    builtin: false,
    docs: `Extract a JSONPath value from a decoded JWT token. ${DOCS_TEMPLATING}`,
    example: "{{jsonFromJWT '$.payload.sub' (Request.Header.Authorization.[0])}}",
  },
];

/**
 * The 8 raymond built-in helpers (report 08 §4). NOT in `helperMethodMap`, but usable in any
 * templated body. `first` and `equal` are SpectoLabs-fork extras. These are NOT valid in
 * `data.variables[].function`.
 */
export const RAYMOND_BUILTINS: readonly HelperSpec[] = [
  {
    name: "if",
    args: [{ name: "condition", type: "any", optional: false }],
    block: true,
    builtin: true,
    docs: `Block: render the body when the condition is truthy; {{else}} otherwise. ${DOCS_HANDLEBARS}`,
    example: "{{#if cond}}…{{else}}…{{/if}}",
  },
  {
    name: "unless",
    args: [{ name: "condition", type: "any", optional: false }],
    block: true,
    builtin: true,
    docs: `Block: inverse of #if. ${DOCS_HANDLEBARS}`,
    example: "{{#unless cond}}…{{/unless}}",
  },
  {
    name: "with",
    args: [{ name: "context", type: "any", optional: false }],
    block: true,
    builtin: true,
    docs: `Block: rescope the context to the argument. ${DOCS_HANDLEBARS}`,
    example: "{{#with obj}}{{field}}{{/with}}",
  },
  {
    name: "each",
    args: [{ name: "iterable", type: "any", optional: false }],
    block: true,
    builtin: true,
    docs: `Block: iterate arrays/slices/maps/structs; sets @index/@key/@first/@last and this. ${DOCS_HANDLEBARS}`,
    example: "{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}",
  },
  {
    name: "first",
    args: [{ name: "iterable", type: "any", optional: false }],
    block: true,
    builtin: true,
    docs: `Block (SpectoLabs fork extra): render only for the first element. ${DOCS_HANDLEBARS}`,
    example: "{{#first items}}{{this}}{{/first}}",
  },
  {
    name: "log",
    args: [{ name: "value", type: "any", optional: false }],
    block: false,
    builtin: true,
    docs: `Inline: log a value, returns "". ${DOCS_HANDLEBARS}`,
    example: "{{log x}}",
  },
  {
    name: "lookup",
    args: [
      { name: "obj", type: "any", optional: false },
      { name: "field", type: "any", optional: false },
    ],
    block: false,
    builtin: true,
    docs: `Inline: dynamic property access — lookup obj 'field'. ${DOCS_HANDLEBARS}`,
    example: "{{lookup obj 'field'}}",
  },
  {
    name: "equal",
    args: [
      { name: "a", type: "any", optional: false },
      { name: "b", type: "any", optional: false },
    ],
    block: true,
    builtin: true,
    docs: `Block (SpectoLabs fork extra): render body when Str(a) == Str(b); {{else}} otherwise. ${DOCS_HANDLEBARS}`,
    example: "{{#equal a b}}…{{else}}…{{/equal}}",
  },
];

/** All recognised helper names — the 52 Hoverfly helpers plus the 8 raymond built-ins. */
export const ALL_HELPERS: readonly HelperSpec[] = [...HOVERFLY_HELPERS, ...RAYMOND_BUILTINS];

/**
 * The 52 helper names valid in `data.variables[].function` (the Hoverfly helpers ONLY;
 * raymond built-ins like `if`/`each` are not consulted by `SupportedMethodMap`).
 */
export const VARIABLE_FUNCTION_NAMES: readonly string[] = HOVERFLY_HELPERS.map(
  (helper) => helper.name,
);

/**
 * Accepted `now` offset units (report 08 §2, from `parse_duration.go` `unitMap`). Includes
 * both Unicode micro-symbol spellings (`µs` U+00B5, `μs` U+03BC). NO `w` (week), no `mo`/`M`.
 * Optional leading +/-; fractional values allowed; an invalid offset is silently ignored.
 */
export const NOW_OFFSET_UNITS: readonly string[] = [
  "ns",
  "us",
  "µs",
  "μs",
  "ms",
  "s",
  "m",
  "h",
  "d",
  "y",
];

/** Human-facing notes on the `now` offset/format behaviour (report 08 §2). */
export const NOW_FORMAT_NOTES = {
  /** Validates an offset literal (or empty string) against the supported units. */
  offsetPattern: "^[-+]?(\\d+(\\.\\d+)?(ns|us|µs|μs|ms|s|m|h|d|y))+$",
  /** `d` = 24h, `y` = 365d; `w`/`mo`/`M` are unsupported and silently ignored at render. */
  units:
    "Units: ns, us, µs, μs, ms, s, m, h, d (=24h), y (=365d). No w/mo/M. Invalid offsets are silently ignored.",
  /** The four `format` arg behaviours; `epoch` is milliseconds despite the name. */
  formats:
    'format: "" => RFC3339; "unix" => seconds; "epoch" => MILLISECONDS (misnamed footgun); else a Go time layout (e.g. "2006-01-02").',
} as const;
