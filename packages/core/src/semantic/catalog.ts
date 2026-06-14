/**
 * The frozen HFxxx diagnostic catalog (single source of truth for severity, message
 * template, and docs href). Hand-transcribed EXACTLY from
 * `research/11-diagnostic-catalog.md`; codes are stable API once goldens exist.
 *
 * Rules MUST pull severity/message/href from here via {@link makeDiagnostic}
 * (see `diagnostics.ts`); never inline a severity or message literal in a rule, so the
 * golden snapshots stay stable and a code's meaning is defined in exactly one place.
 *
 * Message templates use `{name}`-style placeholders. {@link formatMessage} substitutes
 * them; placeholder names map to the `args` object passed by each rule.
 */

import { DiagnosticSeverity } from "vscode-languageserver-types";

const E = DiagnosticSeverity.Error;
const W = DiagnosticSeverity.Warning;
const I = DiagnosticSeverity.Information;
const H = DiagnosticSeverity.Hint;

function href(code: string): string {
  return `https://hoverfly-lsp.dev/diagnostics/${code.toLowerCase()}`;
}

/** Every catalog code, including the HF5xx placeholders not yet implemented. */
export type DiagnosticCode =
  | "HF101"
  | "HF102"
  | "HF103"
  | "HF104"
  | "HF201"
  | "HF202"
  | "HF203"
  | "HF204"
  | "HF205"
  | "HF206"
  | "HF207"
  | "HF208"
  | "HF209"
  | "HF210"
  | "HF211"
  | "HF212"
  | "HF213"
  | "HF214"
  | "HF215"
  | "HF216"
  | "HF230"
  | "HF231"
  | "HF232"
  | "HF233"
  | "HF234"
  | "HF235"
  | "HF236"
  | "HF301"
  | "HF302"
  | "HF303"
  | "HF304"
  | "HF305"
  | "HF306"
  | "HF307"
  | "HF308"
  | "HF401"
  | "HF402"
  | "HF403"
  | "HF404"
  | "HF405"
  | "HF501"
  | "HF502"
  | "HF503"
  | "HF504"
  | "HF505"
  | "HF506"
  | "HF507"
  | "HF508"
  | "HF509"
  | "HF510"
  | "HF511"
  | "HF512"
  | "HF601"
  | "HF602"
  | "HF603"
  | "HF604";

export interface CatalogEntry {
  readonly code: DiagnosticCode;
  readonly severity: DiagnosticSeverity;
  readonly href: string;
  /**
   * Message template with `{placeholder}` slots. For HF102/HF502/HF307 (`passthrough` /
   * parser-supplied wording), the template is the literal `{message}`/`{explain}` slot:
   * the rule supplies the full text via that arg.
   */
  readonly messageTemplate: string;
}

/** `source` field stamped on every Hoverfly diagnostic. */
export const DIAGNOSTIC_SOURCE = "hoverfly";

/**
 * The catalog table. Keyed by code for O(1) lookup. Severities/messages mirror
 * `11-diagnostic-catalog.md` verbatim; passthrough rows (HF102/HF307/HF502/HF504-ish)
 * carry a single-slot template the rule fills.
 */
export const DIAGNOSTIC_CATALOG: Readonly<Record<DiagnosticCode, CatalogEntry>> = {
  // HF1xx: structure & meta.
  HF101: {
    code: "HF101",
    severity: W,
    href: href("HF101"),
    messageTemplate:
      'This file does not look like a Hoverfly simulation (expected root "data" and "meta" with a "schemaVersion")',
  },
  HF102: {
    code: "HF102",
    severity: E,
    href: href("HF102"),
    messageTemplate: "{message}",
  },
  HF103: {
    code: "HF103",
    severity: I,
    href: href("HF103"),
    messageTemplate:
      "Schema version {v} is legacy; Hoverfly auto-upgrades it on import (current: v5.3)",
  },
  HF104: {
    code: "HF104",
    severity: E,
    href: href("HF104"),
    messageTemplate: 'Unrecognized schema version "{v}"',
  },

  // HF2xx: request matchers.
  HF201: {
    code: "HF201",
    severity: E,
    href: href("HF201"),
    messageTemplate: 'Unknown matcher "{name}": Hoverfly panics at match time on unknown matchers',
  },
  HF202: {
    code: "HF202",
    severity: H,
    href: href("HF202"),
    messageTemplate: 'Prefer canonical lowercase "{canonical}"',
  },
  HF203: {
    code: "HF203",
    severity: E,
    href: href("HF203"),
    messageTemplate: 'Matcher "{name}" expects {expected}; this pair will never match',
  },
  HF204: {
    code: "HF204",
    severity: E,
    href: href("HF204"),
    messageTemplate: '"config" is only supported by the "array" matcher; Hoverfly panics on this',
  },
  HF205: {
    code: "HF205",
    severity: W,
    href: href("HF205"),
    messageTemplate: 'Unknown config key "{key}" (ignored by Hoverfly)',
  },
  HF206: {
    code: "HF206",
    severity: E,
    href: href("HF206"),
    messageTemplate: "Config values must be booleans; Hoverfly panics on {type}",
  },
  HF207: {
    code: "HF207",
    severity: W,
    href: href("HF207"),
    messageTemplate:
      '"negate" with a non-string value always matches (vacuous true); likely not what you want',
  },
  HF208: {
    code: "HF208",
    severity: E,
    href: href("HF208"),
    messageTemplate: '"form" is only valid on the body field; elsewhere Hoverfly panics',
  },
  HF209: {
    code: "HF209",
    severity: E,
    href: href("HF209"),
    messageTemplate: '"form" is case-sensitive; "{name}" hits the registry and panics Hoverfly',
  },
  HF210: {
    code: "HF210",
    severity: H,
    href: href("HF210"),
    messageTemplate:
      '"{name}" passes the same value through; this chain is an AND of matchers on one value',
  },
  HF211: {
    code: "HF211",
    severity: W,
    href: href("HF211"),
    messageTemplate: "Empty {name} value never matches",
  },
  // Additive: structural strictness (report 13 §6); value-syntax (report 14 §4).
  HF212: {
    code: "HF212",
    severity: W,
    href: href("HF212"),
    messageTemplate: 'Matcher has no "value"; it can never match (the value is nil)',
  },
  HF213: {
    code: "HF213",
    severity: I,
    href: href("HF213"),
    messageTemplate:
      'destination matches the request host only (host[:port]); "{v}" includes a scheme or path and will never match',
  },
  HF214: {
    code: "HF214",
    severity: W,
    href: href("HF214"),
    messageTemplate:
      'Name "{n}" contains a character that breaks "{{Literals.{n}}}" / "{{Vars.{n}}}" templating references',
  },
  /*
   * Method/scheme well-known-value did-you-mean. HINT-only (D4): both fields are OPEN sets that
   * Hoverfly compares verbatim and never validates (research/13 §3.1/§3.2, T19), so this can ONLY
   * fire on a near-miss against the standard set (a typo); a bespoke verb / custom scheme stays
   * silent. The `{value}`/`{suggestion}` slots are supplied by the rule. See registry/http.ts.
   */
  HF215: {
    code: "HF215",
    severity: H,
    href: href("HF215"),
    messageTemplate: 'Unknown HTTP method "{value}"; did you mean "{suggestion}"?',
  },
  HF216: {
    code: "HF216",
    severity: H,
    href: href("HF216"),
    messageTemplate: 'Unknown URI scheme "{value}"; did you mean "{suggestion}"?',
  },
  HF230: {
    code: "HF230",
    severity: E,
    href: href("HF230"),
    messageTemplate: "Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this",
  },
  HF231: {
    code: "HF231",
    severity: E,
    href: href("HF231"),
    messageTemplate:
      '"{name}" value must be JSON text; this is not valid JSON, so the pair never matches',
  },
  HF232: {
    code: "HF232",
    severity: W,
    href: href("HF232"),
    messageTemplate: "JSONPath has unbalanced brackets or quotes",
  },
  HF233: {
    code: "HF233",
    severity: W,
    href: href("HF233"),
    messageTemplate: "XPath has unbalanced brackets or quotes",
  },
  HF234: {
    code: "HF234",
    severity: W,
    href: href("HF234"),
    messageTemplate: '"{name}" value is not well-formed XML; this pair never matches',
  },
  HF235: {
    code: "HF235",
    severity: W,
    href: href("HF235"),
    messageTemplate:
      'jwt value should be a partial {"header":…,"payload":…} spec; key "{k}" can never match a JWT',
  },
  HF236: {
    code: "HF236",
    severity: W,
    href: href("HF236"),
    messageTemplate:
      "array element {i} is not a string; Hoverfly cannot match a non-string element as written",
  },

  // HF3xx: response.
  HF301: {
    code: "HF301",
    severity: W,
    href: href("HF301"),
    // Mirrors Hoverfly's BodyAndBodyFileMessage wording (report 05 §2.3).
    messageTemplate:
      "Response contains both body and bodyFile; please remove one of them, otherwise body is used if non-empty",
  },
  HF302: {
    code: "HF302",
    severity: W,
    href: href("HF302"),
    // Mirrors Hoverfly's ContentLengthAndTransferEncodingMessage wording (report 05 §2.3).
    messageTemplate:
      "Response contains both Content-Length and Transfer-Encoding headers; please remove one of these headers",
  },
  HF303: {
    code: "HF303",
    severity: W,
    href: href("HF303"),
    messageTemplate: "Content-Length {n} does not match body length {m}",
  },
  HF304: {
    code: "HF304",
    severity: W,
    href: href("HF304"),
    messageTemplate: "Status {n} is outside the valid HTTP range",
  },
  HF305: {
    code: "HF305",
    severity: W,
    href: href("HF305"),
    messageTemplate: "encodedBody is set but body is not valid base64",
  },
  HF306: {
    code: "HF306",
    severity: W,
    href: href("HF306"),
    messageTemplate: "Negative delay is ignored",
  },
  HF307: {
    code: "HF307",
    severity: W,
    href: href("HF307"),
    messageTemplate: "{explain}",
  },
  HF308: {
    code: "HF308",
    severity: E,
    href: href("HF308"),
    messageTemplate: "Response header values must be an array of strings; wrap it in [ … ]",
  },

  // HF4xx: state.
  HF401: {
    code: "HF401",
    severity: W,
    href: href("HF401"),
    messageTemplate:
      'State "{key}" is required but never set by any transitionsState; this pair can only match if the state is set externally',
  },
  HF402: {
    code: "HF402",
    severity: I,
    href: href("HF402"),
    messageTemplate: 'State "{key}" is set but never required in this simulation',
  },
  HF403: {
    code: "HF403",
    severity: I,
    href: href("HF403"),
    messageTemplate: 'State "{key}" is removed but never set',
  },
  HF404: {
    code: "HF404",
    severity: E,
    href: href("HF404"),
    messageTemplate: "State values must be strings; Hoverfly rejects this at import",
  },
  HF405: {
    code: "HF405",
    severity: E,
    href: href("HF405"),
    messageTemplate: "removesState entries must be strings; Hoverfly rejects this at import",
  },

  // HF5xx: templating.
  HF501: {
    code: "HF501",
    severity: W,
    href: href("HF501"),
    messageTemplate:
      'Body contains template syntax but "templated" is not true; it will be sent literally',
  },
  HF502: {
    code: "HF502",
    severity: E,
    href: href("HF502"),
    messageTemplate: "{message}",
  },
  HF503: {
    code: "HF503",
    severity: E,
    href: href("HF503"),
    messageTemplate: 'Unknown template helper "{name}"',
  },
  HF504: {
    code: "HF504",
    severity: E,
    href: href("HF504"),
    messageTemplate: '"{name}" expects {sig}, got {n} arguments',
  },
  HF505: {
    code: "HF505",
    severity: E,
    href: href("HF505"),
    messageTemplate: 'Variable "{x}" is not defined in data.variables',
  },
  HF506: {
    code: "HF506",
    severity: E,
    href: href("HF506"),
    messageTemplate: 'Literal "{x}" is not defined in data.literals',
  },
  HF507: {
    code: "HF507",
    severity: I,
    href: href("HF507"),
    messageTemplate: 'Unknown faker type "{t}" for gofakeit {version}',
  },
  HF508: {
    code: "HF508",
    severity: W,
    href: href("HF508"),
    messageTemplate:
      'faker "{t}" requires arguments Hoverfly cannot pass; this panics at render time',
  },
  HF509: {
    code: "HF509",
    severity: W,
    href: href("HF509"),
    messageTemplate:
      'Offset "{o}" is silently ignored by Hoverfly (valid units: ns, us, ms, s, m, h, d, y)',
  },
  HF510: {
    code: "HF510",
    severity: E,
    href: href("HF510"),
    messageTemplate: "data.variables only accepts Hoverfly helper functions, not block built-ins",
  },
  HF511: {
    code: "HF511",
    severity: E,
    href: href("HF511"),
    messageTemplate:
      'Unknown variable function "{name}"; Hoverfly rejects the import (only the 52 helper functions are valid)',
  },
  HF512: {
    code: "HF512",
    severity: W,
    href: href("HF512"),
    messageTemplate: '"{fn}" expects {sig} arguments, got {n}; the variable renders empty',
  },

  // HF6xx: globalActions & misc.
  HF601: {
    code: "HF601",
    severity: W,
    href: href("HF601"),
    messageTemplate: "Invalid pattern",
  },
  HF602: {
    code: "HF602",
    severity: I,
    href: href("HF602"),
    messageTemplate: 'Action "{a}" is not in your configured registeredActions',
  },
  /*
   * The unknown-key flagship. Severity is Warning because the doc still imports; it is a silent
   * feature loss, not a reject (report 13 §6 false-positive guard (d)). The `{didYouMean}` slot is a
   * a pre-formatted suffix the rule supplies (e.g. ` (did you mean "status"?)`) or the empty string.
   */
  HF603: {
    code: "HF603",
    severity: W,
    href: href("HF603"),
    messageTemplate: 'Unknown key "{key}"{didYouMean}; silently ignored by Hoverfly',
  },
  HF604: {
    code: "HF604",
    severity: I,
    href: href("HF604"),
    messageTemplate:
      'Prefer canonical "{canonical}"; "{key}" works (Go matches case-insensitively) but is non-standard',
  },
};

/**
 * Substitute `{placeholder}` slots in a template from `args`. A missing arg leaves the
 * literal `{slot}` in place (defensive; never throws). All values are stringified.
 */
export function formatMessage(
  template: string,
  args: Readonly<Record<string, unknown>> = {},
): string {
  return template.replace(/\{(?<key>\w+)\}/g, (match: string, key: string) => {
    if (Object.hasOwn(args, key)) {
      return String(args[key]);
    }
    return match;
  });
}
