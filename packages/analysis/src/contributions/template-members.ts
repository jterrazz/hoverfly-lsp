// outside: transcribed from Hoverfly's TemplatingData and Request Go structs (research/02 §4.2) and
// the Request.Body method-call form (research/08 §6).

const DOCS_TEMPLATING =
    'https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html';

type RequestMember = {
    readonly name: string;
    readonly methodCall: boolean;
    readonly indexed: boolean;
    readonly docs: string;
    readonly example: string;
};

// outside: Hoverfly's Request.Body is a function field invoked with a query type (jsonpath, xpath
// or jsonpathfromxml) and an expression; the other members are fields read by path.
const REQUEST_MEMBERS: readonly RequestMember[] = [
    {
        name: 'Scheme',
        methodCall: false,
        indexed: false,
        docs: `The request URL scheme (\`http\`/\`https\`). ${DOCS_TEMPLATING}`,
        example: '{{Request.Scheme}}',
    },
    {
        name: 'Method',
        methodCall: false,
        indexed: false,
        docs: `The HTTP method (\`GET\`, \`POST\` and the rest). ${DOCS_TEMPLATING}`,
        example: '{{Request.Method}}',
    },
    {
        name: 'Host',
        methodCall: false,
        indexed: false,
        docs: `The request host. ${DOCS_TEMPLATING}`,
        example: '{{Request.Host}}',
    },
    {
        name: 'Path',
        methodCall: false,
        indexed: true,
        docs: `The URL path segments (a \`[]string\`); index a segment with \`Request.Path.[n]\`. ${DOCS_TEMPLATING}`,
        example: '{{Request.Path.[0]}}',
    },
    {
        name: 'QueryParam',
        methodCall: false,
        indexed: true,
        docs: `Query parameters (\`map[string][]string\`): \`Request.QueryParam.<name>\` or \`.<name>.[i]\`. ${DOCS_TEMPLATING}`,
        example: '{{Request.QueryParam.id}}',
    },
    {
        name: 'Header',
        methodCall: false,
        indexed: true,
        docs: `Request headers (\`map[string][]string\`): \`Request.Header.<name>\` or \`.<name>.[i]\`. ${DOCS_TEMPLATING}`,
        example: '{{Request.Header.Authorization.[0]}}',
    },
    {
        name: 'FormData',
        methodCall: false,
        indexed: true,
        docs: `Posted form data (\`map[string][]string\`): \`Request.FormData.<field>\`. ${DOCS_TEMPLATING}`,
        example: '{{Request.FormData.username}}',
    },
    {
        name: 'Body',
        methodCall: true,
        indexed: false,
        docs:
            `Invoked as a function with two string args: \`Request.Body '<queryType>' '<query>'\`, ` +
            `where \`queryType\` ∈ {\`jsonpath\`, \`xpath\`, \`jsonpathfromxml\`} (equivalent to the ` +
            `\`requestBody\` helper). The JSONPath engine is **kubectl** (\`k8s.io/client-go/util/jsonpath\`), ` +
            `NOT Jayway/RFC9535; XPath is \`ChrisTrenkamp/xsel\` and returns a single string. ${
                DOCS_TEMPLATING
            }`,
        example: "{{Request.Body 'jsonpath' '$.id'}}",
    },
];

type PathRoot = {
    readonly name: string;
    readonly docs: string;
    readonly example: string;
};

const PATH_ROOTS: readonly PathRoot[] = [
    {
        name: 'Request',
        docs: `The incoming request (Scheme/Method/Host/Path/QueryParam/Header/FormData/Body). ${DOCS_TEMPLATING}`,
        example: '{{Request.Method}}',
    },
    {
        name: 'State',
        docs: `The request-state map: \`State.<key>\` (keys from \`requiresState\`/\`transitionsState\`). ${DOCS_TEMPLATING}`,
        example: '{{State.cart}}',
    },
    {
        name: 'Vars',
        docs: `Computed variables: \`Vars.<name>\` (declared in \`data.variables\`). ${DOCS_TEMPLATING}`,
        example: '{{Vars.token}}',
    },
    {
        name: 'Literals',
        docs: `Literal values: \`Literals.<name>\` (declared in \`data.literals\`). ${DOCS_TEMPLATING}`,
        example: '{{Literals.apiBase}}',
    },
];

type DataVariable = {
    readonly name: string;
    readonly docs: string;
};

const EACH_DATA_VARIABLES: readonly DataVariable[] = [
    { name: 'index', docs: 'The zero-based iteration index of the current `#each` element.' },
    { name: 'first', docs: 'Boolean: `true` on the first `#each` iteration.' },
    { name: 'last', docs: 'Boolean: `true` on the last `#each` iteration.' },
    { name: 'key', docs: 'The current key when iterating a map/object with `#each`.' },
];

export type { RequestMember };
export { EACH_DATA_VARIABLES, PATH_ROOTS, REQUEST_MEMBERS };
