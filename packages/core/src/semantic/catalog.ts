/**
 * The frozen HFxxx diagnostic catalog (single source of truth for severity, message
 * template, and docs href). Hand-transcribed EXACTLY from
 * `research/11-diagnostic-catalog.md`; codes are stable API once goldens exist.
 *
 * Rules MUST pull severity/message/href from here via {@link makeDiagnostic}
 * (see `diagnostics.ts`) — never inline a severity or message literal in a rule, so the
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
  | "HF301"
  | "HF302"
  | "HF303"
  | "HF304"
  | "HF305"
  | "HF306"
  | "HF307"
  | "HF401"
  | "HF402"
  | "HF403"
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
  | "HF601"
  | "HF602";

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
  // HF1xx — structure & meta.
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

  // HF2xx — request matchers.
  HF201: {
    code: "HF201",
    severity: E,
    href: href("HF201"),
    messageTemplate: 'Unknown matcher "{name}" — Hoverfly panics at match time on unknown matchers',
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
    messageTemplate: '"config" is only supported by the "array" matcher — Hoverfly panics on this',
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
    messageTemplate: "Config values must be booleans — Hoverfly panics on {type}",
  },
  HF207: {
    code: "HF207",
    severity: W,
    href: href("HF207"),
    messageTemplate:
      '"negate" with a non-string value always matches (vacuous true) — likely not what you want',
  },
  HF208: {
    code: "HF208",
    severity: E,
    href: href("HF208"),
    messageTemplate: '"form" is only valid on the body field — elsewhere Hoverfly panics',
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
      '"{name}" passes the same value through — this chain is an AND of matchers on one value',
  },
  HF211: {
    code: "HF211",
    severity: W,
    href: href("HF211"),
    messageTemplate: "Empty {name} value never matches",
  },

  // HF3xx — response.
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

  // HF4xx — state.
  HF401: {
    code: "HF401",
    severity: W,
    href: href("HF401"),
    messageTemplate:
      'State "{key}" is required but never set by any transitionsState — this pair can only match if the state is set externally',
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

  // HF5xx — templating.
  HF501: {
    code: "HF501",
    severity: W,
    href: href("HF501"),
    messageTemplate:
      'Body contains template syntax but "templated" is not true — it will be sent literally',
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
      'faker "{t}" requires arguments Hoverfly cannot pass — this panics at render time',
  },
  HF509: {
    code: "HF509",
    severity: I,
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

  // HF6xx — globalActions & misc.
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
};

/**
 * Substitute `{placeholder}` slots in a template from `args`. A missing arg leaves the
 * literal `{slot}` in place (defensive — never throws). All values are stringified.
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
