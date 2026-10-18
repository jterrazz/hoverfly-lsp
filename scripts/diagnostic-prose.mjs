/** The trigger and range of each diagnostic code, carried over from research/11-diagnostic-catalog.md. */
export const DIAGNOSTIC_PROSE = {
    HF101: {
        trigger:
            'File matches `*.hoverfly.json`/`hoverfly-simulation.json` but fails the content fingerprint (D3).',
        range: 'root (first line)',
    },
    HF102: {
        trigger:
            'Schema violation (re-tagged from vscode-json-languageservice; noisy union messages are suppressed when a more specific HF2xx fires on the same node).',
        range: 'as reported by the schema engine',
    },
    HF103: { trigger: '`schemaVersion` in v1 to v4.', range: 'the version string' },
    HF104: {
        trigger: '`schemaVersion` does not match `^v\\d+(\\.\\d+)?$`.',
        range: 'the version string',
    },
    HF201: {
        trigger:
            'Matcher name not in the registry after lowercasing (and not the body-`form` pseudo-matcher).',
        range: 'matcher name string',
    },
    HF202: {
        trigger: 'Known matcher, non-canonical casing (registry lookup is case-insensitive).',
        range: 'matcher name string',
    },
    HF203: {
        trigger:
            "Value type not in the matcher's accepted set (e.g. `array` with a string value, `exact` with an object).",
        range: 'value node',
    },
    HF204: {
        trigger: '`config` present on any matcher except `array` (even `{}`).',
        range: 'config node',
    },
    HF205: {
        trigger:
            'Unknown key inside `array` config (not `ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`).',
        range: 'the key',
    },
    HF206: { trigger: '`array` config value is not a JSON boolean.', range: 'the value' },
    HF207: { trigger: '`negate` with a non-string value.', range: 'value node' },
    HF208: {
        trigger: '`form` matcher on any field other than `body`, or inside `doMatch`.',
        range: 'matcher name string',
    },
    HF209: {
        trigger:
            '`Form`/`FORM`/any non-lowercase `form` (its handling is case-sensitive, unlike registry matchers).',
        range: 'matcher name string',
    },
    HF210: {
        trigger:
            '`doMatch` chained after an identity matcher (everything except jsonpath/xpath/jwt/jwtjsonpath).',
        range: 'doMatch key',
    },
    HF211: {
        trigger:
            'Empty-string matcher value where it can never match (`jwtjsonpath` rejects empty; empty `regex`/`glob` is suspicious).',
        range: 'value node',
    },
    HF212: {
        trigger:
            'Field-matcher with a `matcher` (or empty/default) but no `value` key, or an empty `{}` (except when `matcher` is `negate` (HF207) or `form` (HF208)). The value is nil, so it can never match.',
        range: 'the matcher object (or its `matcher` key)',
    },
    HF213: {
        trigger:
            '`destination` matcher with an `exact`/empty matcher whose value contains `://` (a full URL pasted where a host[:port] is expected). Off by default: high false-positive caution.',
        range: 'value node',
    },
    HF214: {
        trigger:
            '`literals[].name` or `variables[].name` contains a character outside `[A-Za-z0-9_]`, making it un-referenceable via `{{Literals.x}}` / `{{Vars.x}}`.',
        range: 'the name value node',
    },
    HF215: {
        trigger:
            'A `method` value (under an `exact`/default matcher) that is a near-miss (Levenshtein ≤ 1) of a standard IANA HTTP method but is not itself one, i.e. a typo (`GT` for `GET`). Hint-only: the method field is an OPEN set Hoverfly compares verbatim, so a bespoke verb (`PURGE`, `PROPFIND`) far from every standard verb stays silent.',
        range: 'value node',
    },
    HF216: {
        trigger:
            'A `scheme` value (under an `exact`/default matcher) that is a near-miss (Levenshtein ≤ 1) of a common URI scheme (`http`/`https`/`ws`/`wss`) but is not itself one (`htttp` for `http`). Hint-only: scheme is string-compared verbatim, so a custom scheme (`ftp` and the like) stays silent.',
        range: 'value node',
    },
    HF230: {
        trigger:
            "A `regex` value (or an `xmltemplated` `{{regex:...}}` leaf) is not a valid Go RE2 pattern. Validated with a true RE2 engine (`re2js`), never `new RegExp`. Shared with HF601's urlPattern check.",
        range: 'value node',
    },
    HF231: {
        trigger:
            'A `json`, `jsonpartial`, or `jwt` value string does not parse as JSON text (e.g. the `jwt` `"$.username"` bug).',
        range: 'value node',
    },
    HF232: {
        trigger:
            'A `jsonpath`/`jwtjsonpath` value has unbalanced `[]`/`()`/`{}`/quotes (a structural lint only; no full kubectl-JSONPath parser, so heuristic and warning-level).',
        range: 'value node',
    },
    HF233: {
        trigger:
            'An `xpath` value has unbalanced `[]`/`()`/quotes (balance-only lint; no full XPath engine, so heuristic and warning-level).',
        range: 'value node',
    },
    HF234: {
        trigger:
            'An `xml`/`xmltemplated` value is not well-formed XML (after neutralizing `{{ignore}}`/`{{regex:...}}` template tokens). Validated with `fast-xml-parser`.',
        range: 'value node',
    },
    HF235: {
        trigger:
            'A `jwt` value parses as JSON but has a top-level key outside {`header`,`payload`}, so it can never match a JWT composite.',
        range: 'the offending key (value node)',
    },
    HF236: {
        trigger:
            'An `array` value element is not a JSON string; Hoverfly stringifies it to a non-literal and it will not match as written (finer-grained sibling of HF203).',
        range: 'the offending array element',
    },
    HF301: { trigger: '`body` and `bodyFile` both set.', range: 'bodyFile key' },
    HF302: {
        trigger: '`Content-Length` and `Transfer-Encoding` headers both set.',
        range: 'second header key',
    },
    HF303: {
        trigger:
            '`Content-Length` ≠ byte length of `body` (skipped when `templated`, `bodyFile`, or `encodedBody`).',
        range: 'header value',
    },
    HF304: { trigger: '`status` outside 100 to 599.', range: 'status value' },
    HF305: { trigger: '`encodedBody: true` but `body` is not valid base64.', range: 'body value' },
    HF306: { trigger: 'Negative `fixedDelay`.', range: 'the value' },
    HF307: {
        trigger: '`logNormalDelay` constraint violation (min/max/mean/median sanity).',
        range: 'offending field',
    },
    HF308: {
        trigger:
            'A `response.headers` value that is a plain string instead of an array of strings (Hoverfly rejects the import with HTTP 400).',
        range: 'the value node',
    },
    HF401: {
        trigger:
            "`requiresState` key (non-`sequence:`-prefixed) never set by any `transitionsState` in the file. A key set only by the same pair's own `transitionsState` still fires (the transition runs after the match).",
        range: 'the key',
    },
    HF402: {
        trigger: '`transitionsState` key never required (and not `sequence:`).',
        range: 'the key',
    },
    HF403: { trigger: '`removesState` entry never set anywhere.', range: 'the entry' },
    HF404: {
        trigger:
            'A `requiresState` or `transitionsState` value that is not a string (Hoverfly rejects the import with HTTP 400).',
        range: 'the offending value node',
    },
    HF405: {
        trigger:
            'A `removesState[]` entry that is not a string (Hoverfly rejects the import with HTTP 400, Go-unmarshal layer).',
        range: 'the offending array element',
    },
    HF501: {
        trigger: '`{{ ... }}` syntax in `body` while `templated` is absent/false.',
        range: 'first mustache',
    },
    HF502: {
        trigger: 'Template parse error (unclosed `{{`, unclosed block, mismatched `{{/x}}`).',
        range: 'the offending token',
    },
    HF503: { trigger: 'Unknown helper name (not in the 52+8 catalog).', range: 'helper name' },
    HF504: { trigger: 'Helper arity mismatch (per the helper registry).', range: 'the call' },
    HF505: { trigger: '`Vars.X` unresolved against `data.variables[].name`.', range: 'the path' },
    HF506: {
        trigger: '`Literals.X` unresolved against `data.literals[].name`.',
        range: 'the path',
    },
    HF507: {
        trigger: "Unknown `faker '<Type>'` (not in the pinned 210-name list).",
        range: 'the arg',
    },
    HF508: {
        trigger: 'Parameterized gofakeit method (Number, Sentence, Password, Regex and others).',
        range: 'the arg',
    },
    HF509: {
        trigger: 'Invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y, e.g. `w`).',
        range: 'the arg',
    },
    HF510: {
        trigger:
            'Raymond built-in (`if`/`unless`/`with`/`each`/`first`/`log`/`lookup`/`equal`) used in `data.variables[].function`.',
        range: 'function value',
    },
    HF511: {
        trigger:
            '`variables[].function` is a string that is NOT one of the 52 Hoverfly helpers and NOT one of the 8 built-ins (HF510 owns the built-in case). Hoverfly rejects the import with HTTP 500.',
        range: 'function value node',
    },
    HF512: {
        trigger:
            "`variables[].arguments` length ≠ the helper's arity (for a known-52 `function`; variadic enforces a minimum, `requestBody` exactly 2). The variable renders empty.",
        range: 'the `arguments` array node',
    },
    HF601: {
        trigger:
            '`globalActions.delays[].urlPattern` (or `delaysLogNormal[]`) is an invalid Go RE2 regex.',
        range: 'the pattern',
    },
    HF602: {
        trigger:
            '`postServeAction` not in the user-configured `hoverfly.registeredActions` allowlist (only when the setting is non-empty).',
        range: 'the value',
    },
    HF603: {
        trigger:
            'Unknown-key flagship: a key that does not (case-insensitively) match any allowed key for its object (`data`, `request`, `response`, field-matcher, `logNormalDelay`, `delays[]`, `delaysLogNormal[]`, `globalActions`, `literals[]`, `variables[]`, `meta`, pair). Silently dropped by Hoverfly. Skips the root (HF102), the user-keyed maps (`headers`/`query`/`requiresState`/`transitionsState`), and `request.method` (D5).',
        range: 'the unknown key',
    },
    HF604: {
        trigger:
            'A key that is a case-only variant of an allowed key. Go binds it case-insensitively, but it is non-canonical.',
        range: 'the key',
    },
};
