/**
 * The Hoverfly `TemplatingData` member catalog — the `Request.*` accessors, the path roots
 * (`State`/`Vars`/`Literals`), and the `@`-data variables — used for path-continuation
 * completions and hover inside templates.
 *
 * Source of truth: `research/02-hoverfly-source-truth.md` §4.2 (the `TemplatingData`/`Request`
 * Go structs) and `research/08-templating-spec.md` §6 (the `Request.Body` method-call form and
 * the kubectl-JSONPath / xsel-XPath dialect note). This is template-LANGUAGE data, distinct from
 * the matcher/helper/faker registry (which this module does NOT touch).
 */

const DOCS_TEMPLATING =
  "https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html";

/** A `Request.<member>` accessor. */
interface RequestMember {
  /** The member name as written after `Request.` (`QueryParam`, `Path`, `Body`, …). */
  readonly name: string;
  /** Whether the accessor is invoked as a function (`Request.Body 'jsonpath' '$.x'`). */
  readonly methodCall: boolean;
  /** Whether further dotted access follows (`Request.QueryParam.<name>`, `Request.Header.<name>`). */
  readonly indexed: boolean;
  /** Short doc, including the typical access form. */
  readonly docs: string;
  /** A representative usage example. */
  readonly example: string;
}

/**
 * The `Request` accessor members (report 08 §6 + report 02 §4.2). `Body` is the func-typed field
 * invoked with two string args (`queryType` ∈ {jsonpath, xpath, jsonpathfromxml}); the rest are
 * scalar fields or string maps/slices accessed with dotted/indexed paths.
 */
const REQUEST_MEMBERS: readonly RequestMember[] = [
  {
    name: "Scheme",
    methodCall: false,
    indexed: false,
    docs: `The request URL scheme (\`http\`/\`https\`). ${DOCS_TEMPLATING}`,
    example: "{{Request.Scheme}}",
  },
  {
    name: "Method",
    methodCall: false,
    indexed: false,
    docs: `The HTTP method (\`GET\`, \`POST\`, …). ${DOCS_TEMPLATING}`,
    example: "{{Request.Method}}",
  },
  {
    name: "Host",
    methodCall: false,
    indexed: false,
    docs: `The request host. ${DOCS_TEMPLATING}`,
    example: "{{Request.Host}}",
  },
  {
    name: "Path",
    methodCall: false,
    indexed: true,
    docs: `The URL path segments (a \`[]string\`); index a segment with \`Request.Path.[n]\`. ${DOCS_TEMPLATING}`,
    example: "{{Request.Path.[0]}}",
  },
  {
    name: "QueryParam",
    methodCall: false,
    indexed: true,
    docs: `Query parameters (\`map[string][]string\`): \`Request.QueryParam.<name>\` or \`.<name>.[i]\`. ${DOCS_TEMPLATING}`,
    example: "{{Request.QueryParam.id}}",
  },
  {
    name: "Header",
    methodCall: false,
    indexed: true,
    docs: `Request headers (\`map[string][]string\`): \`Request.Header.<name>\` or \`.<name>.[i]\`. ${DOCS_TEMPLATING}`,
    example: "{{Request.Header.Authorization.[0]}}",
  },
  {
    name: "FormData",
    methodCall: false,
    indexed: true,
    docs: `Posted form data (\`map[string][]string\`): \`Request.FormData.<field>\`. ${DOCS_TEMPLATING}`,
    example: "{{Request.FormData.username}}",
  },
  {
    name: "Body",
    methodCall: true,
    indexed: false,
    docs:
      "Invoked as a function with two string args: `Request.Body '<queryType>' '<query>'`, " +
      "where `queryType` ∈ {`jsonpath`, `xpath`, `jsonpathfromxml`} (equivalent to the " +
      "`requestBody` helper). The JSONPath engine is **kubectl** (`k8s.io/client-go/util/jsonpath`), " +
      "NOT Jayway/RFC9535; XPath is `ChrisTrenkamp/xsel` and returns a single string. " +
      `${DOCS_TEMPLATING}`,
    example: "{{Request.Body 'jsonpath' '$.id'}}",
  },
];

/** The dotted path roots that begin a `TemplatingData` lookup (report 02 §4.2). */
interface PathRoot {
  readonly name: string;
  readonly docs: string;
  readonly example: string;
}

const PATH_ROOTS: readonly PathRoot[] = [
  {
    name: "Request",
    docs: `The incoming request (Scheme/Method/Host/Path/QueryParam/Header/FormData/Body). ${DOCS_TEMPLATING}`,
    example: "{{Request.Method}}",
  },
  {
    name: "State",
    docs: `The request-state map: \`State.<key>\` (keys from \`requiresState\`/\`transitionsState\`). ${DOCS_TEMPLATING}`,
    example: "{{State.cart}}",
  },
  {
    name: "Vars",
    docs: `Computed variables: \`Vars.<name>\` (declared in \`data.variables\`). ${DOCS_TEMPLATING}`,
    example: "{{Vars.token}}",
  },
  {
    name: "Literals",
    docs: `Literal values: \`Literals.<name>\` (declared in \`data.literals\`). ${DOCS_TEMPLATING}`,
    example: "{{Literals.apiBase}}",
  },
];

/** An `@`-data variable available inside `#each`/`#first` blocks. */
interface DataVariable {
  /** The name WITHOUT the leading `@` (`index`, `first`, `last`, `key`). */
  readonly name: string;
  readonly docs: string;
}

const EACH_DATA_VARIABLES: readonly DataVariable[] = [
  { name: "index", docs: "The zero-based iteration index of the current `#each` element." },
  { name: "first", docs: "Boolean: `true` on the first `#each` iteration." },
  { name: "last", docs: "Boolean: `true` on the last `#each` iteration." },
  { name: "key", docs: "The current key when iterating a map/object with `#each`." },
];

export { EACH_DATA_VARIABLES, PATH_ROOTS, REQUEST_MEMBERS };
