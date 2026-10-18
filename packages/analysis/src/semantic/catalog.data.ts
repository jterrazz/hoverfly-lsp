// invariant: transcribed from research/11; a rule takes its severity and message from here
// through makeDiagnostic, never a literal of its own, and a code is a published API once its golden
// exists.

import { DiagnosticSeverity } from 'vscode-languageserver-types';

const E = DiagnosticSeverity.Error;
const W = DiagnosticSeverity.Warning;
const I = DiagnosticSeverity.Information;
const H = DiagnosticSeverity.Hint;

/** Every catalog code, including the HF5xx placeholders not yet implemented. */
export type DiagnosticCode =
    | 'HF101'
    | 'HF102'
    | 'HF103'
    | 'HF104'
    | 'HF201'
    | 'HF202'
    | 'HF203'
    | 'HF204'
    | 'HF205'
    | 'HF206'
    | 'HF207'
    | 'HF208'
    | 'HF209'
    | 'HF210'
    | 'HF211'
    | 'HF212'
    | 'HF213'
    | 'HF214'
    | 'HF215'
    | 'HF216'
    | 'HF230'
    | 'HF231'
    | 'HF232'
    | 'HF233'
    | 'HF234'
    | 'HF235'
    | 'HF236'
    | 'HF301'
    | 'HF302'
    | 'HF303'
    | 'HF304'
    | 'HF305'
    | 'HF306'
    | 'HF307'
    | 'HF308'
    | 'HF401'
    | 'HF402'
    | 'HF403'
    | 'HF404'
    | 'HF405'
    | 'HF501'
    | 'HF502'
    | 'HF503'
    | 'HF504'
    | 'HF505'
    | 'HF506'
    | 'HF507'
    | 'HF508'
    | 'HF509'
    | 'HF510'
    | 'HF511'
    | 'HF512'
    | 'HF601'
    | 'HF602'
    | 'HF603'
    | 'HF604';

export type CatalogEntry = {
    readonly code: DiagnosticCode;
    readonly severity: DiagnosticSeverity;
    /** The message, with `{placeholder}` slots; a passthrough code's template is the one slot its rule fills. */
    readonly messageTemplate: string;
};

/** `source` field stamped on every Hoverfly diagnostic. */
export const DIAGNOSTIC_SOURCE = 'hoverfly';

/** The catalog, by code; severities and messages mirror research/11-diagnostic-catalog.md verbatim. */
export const DIAGNOSTIC_CATALOG: Readonly<Record<DiagnosticCode, CatalogEntry>> = {
    HF101: {
        code: 'HF101',
        severity: W,
        messageTemplate:
            'This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")',
    },
    HF102: {
        code: 'HF102',
        severity: E,
        messageTemplate: '{message}',
    },
    HF103: {
        code: 'HF103',
        severity: I,
        messageTemplate:
            'Schema version {v} is legacy; Hoverfly auto-upgrades it on import (current: v5.3)',
    },
    HF104: {
        code: 'HF104',
        severity: E,
        messageTemplate: 'Unrecognized schema version "{v}"',
    },

    HF201: {
        code: 'HF201',
        severity: E,
        messageTemplate:
            'Unknown matcher "{name}": Hoverfly panics at match time on unknown matchers',
    },
    HF202: {
        code: 'HF202',
        severity: H,
        messageTemplate: 'Prefer canonical lowercase "{canonical}"',
    },
    HF203: {
        code: 'HF203',
        severity: E,
        messageTemplate: 'Matcher "{name}" expects {expected}; this pair will never match',
    },
    HF204: {
        code: 'HF204',
        severity: E,
        messageTemplate:
            '"config" is only supported by the "array" matcher; Hoverfly panics on this',
    },
    HF205: {
        code: 'HF205',
        severity: W,
        messageTemplate: 'Unknown config key "{key}" (ignored by Hoverfly)',
    },
    HF206: {
        code: 'HF206',
        severity: E,
        messageTemplate: 'Config values must be booleans; Hoverfly panics on {type}',
    },
    HF207: {
        code: 'HF207',
        severity: W,
        messageTemplate:
            '"negate" with a non-string value always matches (vacuous true); likely not what you want',
    },
    HF208: {
        code: 'HF208',
        severity: E,
        messageTemplate: '"form" is only valid on the body field; elsewhere Hoverfly panics',
    },
    HF209: {
        code: 'HF209',
        severity: E,
        messageTemplate: '"form" is case-sensitive; "{name}" hits the registry and panics Hoverfly',
    },
    HF210: {
        code: 'HF210',
        severity: H,
        messageTemplate:
            '"{name}" passes the same value through; this chain is an AND of matchers on one value',
    },
    HF211: {
        code: 'HF211',
        severity: W,
        messageTemplate: 'Empty {name} value never matches',
    },
    HF212: {
        code: 'HF212',
        severity: W,
        messageTemplate: 'Matcher has no "value"; it can never match (the value is nil)',
    },
    HF213: {
        code: 'HF213',
        severity: I,
        messageTemplate:
            'destination matches the request host only (host[:port]); "{v}" includes a scheme or path and will never match',
    },
    HF214: {
        code: 'HF214',
        severity: W,
        messageTemplate:
            'Name "{n}" contains a character that breaks "{{Literals.{n}}}" / "{{Vars.{n}}}" templating references',
    },
    // value: Hint only (D4). Hoverfly compares method and scheme verbatim and never validates them
    // (research/13 §3.1, §3.2), so only a near-miss of a standard value fires.
    HF215: {
        code: 'HF215',
        severity: H,
        messageTemplate: 'Unknown HTTP method "{value}"; did you mean "{suggestion}"?',
    },
    HF216: {
        code: 'HF216',
        severity: H,
        messageTemplate: 'Unknown URI scheme "{value}"; did you mean "{suggestion}"?',
    },
    HF230: {
        code: 'HF230',
        severity: E,
        messageTemplate: 'Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
    },
    HF231: {
        code: 'HF231',
        severity: E,
        messageTemplate:
            '"{name}" value must be JSON text; this is not valid JSON, so the pair never matches',
    },
    HF232: {
        code: 'HF232',
        severity: W,
        messageTemplate: 'JSONPath has unbalanced brackets or quotes',
    },
    HF233: {
        code: 'HF233',
        severity: W,
        messageTemplate: 'XPath has unbalanced brackets or quotes',
    },
    HF234: {
        code: 'HF234',
        severity: W,
        messageTemplate: '"{name}" value is not well-formed XML; this pair never matches',
    },
    HF235: {
        code: 'HF235',
        severity: W,
        messageTemplate:
            'jwt value should be a partial {"header":...,"payload":...} spec; key "{k}" can never match a JWT',
    },
    HF236: {
        code: 'HF236',
        severity: W,
        messageTemplate:
            'array element {i} is not a string; Hoverfly cannot match a non-string element as written',
    },

    HF301: {
        code: 'HF301',
        severity: W,
        // value: Hoverfly's own BodyAndBodyFileMessage wording (report 05 §2.3).
        messageTemplate:
            'Response contains both body and bodyFile; please remove one of them, otherwise body is used if non-empty',
    },
    HF302: {
        code: 'HF302',
        severity: W,
        // value: Hoverfly's own ContentLengthAndTransferEncodingMessage wording (report 05 §2.3).
        messageTemplate:
            'Response contains both Content-Length and Transfer-Encoding headers; please remove one of these headers',
    },
    HF303: {
        code: 'HF303',
        severity: W,
        messageTemplate: 'Content-Length {n} does not match body length {m}',
    },
    HF304: {
        code: 'HF304',
        severity: W,
        messageTemplate: 'Status {n} is outside the valid HTTP range',
    },
    HF305: {
        code: 'HF305',
        severity: W,
        messageTemplate: 'encodedBody is set but body is not valid base64',
    },
    HF306: {
        code: 'HF306',
        severity: W,
        messageTemplate: 'Negative delay is ignored',
    },
    HF307: {
        code: 'HF307',
        severity: W,
        messageTemplate: '{explain}',
    },
    HF308: {
        code: 'HF308',
        severity: E,
        messageTemplate: 'Response header values must be an array of strings; wrap it in [ ... ]',
    },

    HF401: {
        code: 'HF401',
        severity: W,
        messageTemplate:
            'State "{key}" is required but never set by any transitionsState; this pair can only match if the state is set externally',
    },
    HF402: {
        code: 'HF402',
        severity: I,
        messageTemplate: 'State "{key}" is set but never required in this simulation',
    },
    HF403: {
        code: 'HF403',
        severity: I,
        messageTemplate: 'State "{key}" is removed but never set',
    },
    HF404: {
        code: 'HF404',
        severity: E,
        messageTemplate: 'State values must be strings; Hoverfly rejects this at import',
    },
    HF405: {
        code: 'HF405',
        severity: E,
        messageTemplate: 'removesState entries must be strings; Hoverfly rejects this at import',
    },

    HF501: {
        code: 'HF501',
        severity: W,
        messageTemplate:
            'Body contains template syntax but "templated" is not true; it will be sent literally',
    },
    HF502: {
        code: 'HF502',
        severity: E,
        messageTemplate: '{message}',
    },
    HF503: {
        code: 'HF503',
        severity: E,
        messageTemplate: 'Unknown template helper "{name}"',
    },
    HF504: {
        code: 'HF504',
        severity: E,
        messageTemplate: '"{name}" expects {sig}, got {n} arguments',
    },
    HF505: {
        code: 'HF505',
        severity: E,
        messageTemplate: 'Variable "{x}" is not defined in data.variables',
    },
    HF506: {
        code: 'HF506',
        severity: E,
        messageTemplate: 'Literal "{x}" is not defined in data.literals',
    },
    HF507: {
        code: 'HF507',
        severity: I,
        messageTemplate: 'Unknown faker type "{t}" for gofakeit {version}',
    },
    HF508: {
        code: 'HF508',
        severity: W,
        messageTemplate:
            'faker "{t}" requires arguments Hoverfly cannot pass; this panics at render time',
    },
    HF509: {
        code: 'HF509',
        severity: W,
        messageTemplate:
            'Offset "{o}" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)',
    },
    HF510: {
        code: 'HF510',
        severity: E,
        messageTemplate:
            'data.variables only accepts Hoverfly helper functions, not block built-ins',
    },
    HF511: {
        code: 'HF511',
        severity: E,
        messageTemplate:
            'Unknown variable function "{name}"; Hoverfly rejects the import (only the 52 helper functions are valid)',
    },
    HF512: {
        code: 'HF512',
        severity: W,
        messageTemplate: '"{fn}" expects {sig} arguments, got {n}; the variable renders empty',
    },

    HF601: {
        code: 'HF601',
        severity: W,
        messageTemplate: 'Invalid pattern',
    },
    HF602: {
        code: 'HF602',
        severity: I,
        messageTemplate: 'Action "{a}" is not in your configured registeredActions',
    },
    // value: a Warning, since the document still imports, and the key is silently lost (report 13 §6).
    HF603: {
        code: 'HF603',
        severity: W,
        messageTemplate: 'Unknown key "{key}"{didYouMean}; silently ignored by Hoverfly',
    },
    HF604: {
        code: 'HF604',
        severity: I,
        messageTemplate:
            'Prefer canonical "{canonical}"; "{key}" works (Go matches case-insensitively) but is non-standard',
    },
};
