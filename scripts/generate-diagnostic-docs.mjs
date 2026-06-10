/**
 * Generates docs/diagnostics.md and docs/template-reference.md from the BUILT core package
 * (`@hoverfly-lsp/core` -> packages/core/dist). The catalog, helper, faker and matcher data
 * are the single source of truth; never hand-edit the generated files.
 *
 * The catalog object carries code/severity/message/href. The per-code Trigger and Range
 * prose lives in research/11-diagnostic-catalog.md (it is documentation, not runtime data),
 * so it is carried over here in DIAGNOSTIC_PROSE keyed by code. If a new code is added to the
 * catalog without a prose entry, generation FAILS loudly so the table can never silently
 * drift out of sync with the catalog.
 *
 * Usage:
 *   npm run docs:diagnostics            # regenerate both docs from the built core
 *
 * CI asserts the generated files are committed and up to date (see .github/workflows/validate.yml):
 *   npm run build && npm run docs:diagnostics && git diff --quiet docs/
 */

import {
  ALL_HELPERS,
  DIAGNOSTIC_CATALOG,
  FAKER_NAMES,
  GOFAKEIT_VERSION,
  HOVERFLY_HELPERS,
  NOW_FORMAT_NOTES,
  NOW_OFFSET_UNITS,
  RAYMOND_BUILTINS,
} from "@hoverfly-lsp/core";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, "..");
const DOCS_DIR = resolve(ROOT, "docs");

const GENERATED_NOTICE =
  "<!-- GENERATED FILE — do not edit by hand. Run `npm run docs:diagnostics` to regenerate. -->";

// LSP DiagnosticSeverity numeric values (vscode-languageserver-types): the catalog stores these.
const SEVERITY_LABEL = {
  1: "Error",
  2: "Warning",
  3: "Information",
  4: "Hint",
};

/**
 * Trigger + Range prose per diagnostic code, carried over verbatim from
 * research/11-diagnostic-catalog.md (the authored catalog spec). Keyed by code; every code in
 * DIAGNOSTIC_CATALOG must have an entry here or generation aborts.
 */
const DIAGNOSTIC_PROSE = {
  HF101: {
    trigger:
      "File matches `*.hoverfly.json`/`hoverfly-simulation.json` but fails the content fingerprint (D3).",
    range: "root (first line)",
  },
  HF102: {
    trigger:
      "Schema violation (re-tagged from vscode-json-languageservice; noisy union messages are suppressed when a more specific HF2xx fires on the same node).",
    range: "as reported by the schema engine",
  },
  HF103: { trigger: "`schemaVersion` in v1–v4.", range: "the version string" },
  HF104: {
    trigger: "`schemaVersion` does not match `^v\\d+(\\.\\d+)?$`.",
    range: "the version string",
  },
  HF201: {
    trigger:
      "Matcher name not in the registry after lowercasing (and not the body-`form` pseudo-matcher).",
    range: "matcher name string",
  },
  HF202: {
    trigger: "Known matcher, non-canonical casing (registry lookup is case-insensitive).",
    range: "matcher name string",
  },
  HF203: {
    trigger:
      "Value type not in the matcher's accepted set (e.g. `array` with a string value, `exact` with an object).",
    range: "value node",
  },
  HF204: {
    trigger: "`config` present on any matcher except `array` (even `{}`).",
    range: "config node",
  },
  HF205: {
    trigger:
      "Unknown key inside `array` config (not `ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`).",
    range: "the key",
  },
  HF206: { trigger: "`array` config value is not a JSON boolean.", range: "the value" },
  HF207: { trigger: "`negate` with a non-string value.", range: "value node" },
  HF208: {
    trigger: "`form` matcher on any field other than `body`, or inside `doMatch`.",
    range: "matcher name string",
  },
  HF209: {
    trigger:
      "`Form`/`FORM`/any non-lowercase `form` (its handling is case-sensitive, unlike registry matchers).",
    range: "matcher name string",
  },
  HF210: {
    trigger:
      "`doMatch` chained after an identity matcher (everything except jsonpath/xpath/jwt/jwtjsonpath).",
    range: "doMatch key",
  },
  HF211: {
    trigger:
      "Empty-string matcher value where it can never match (`jwtjsonpath` rejects empty; empty `regex`/`glob` is suspicious).",
    range: "value node",
  },
  HF301: { trigger: "`body` and `bodyFile` both set.", range: "bodyFile key" },
  HF302: {
    trigger: "`Content-Length` and `Transfer-Encoding` headers both set.",
    range: "second header key",
  },
  HF303: {
    trigger:
      "`Content-Length` ≠ byte length of `body` (skipped when `templated`, `bodyFile`, or `encodedBody`).",
    range: "header value",
  },
  HF304: { trigger: "`status` outside 100–599.", range: "status value" },
  HF305: { trigger: "`encodedBody: true` but `body` is not valid base64.", range: "body value" },
  HF306: { trigger: "Negative `fixedDelay`.", range: "the value" },
  HF307: {
    trigger: "`logNormalDelay` constraint violation (min/max/mean/median sanity).",
    range: "offending field",
  },
  HF401: {
    trigger:
      "`requiresState` key (non-`sequence:`-prefixed) never set by any `transitionsState` in the file. A key set only by the same pair's own `transitionsState` still fires (the transition runs after the match).",
    range: "the key",
  },
  HF402: {
    trigger: "`transitionsState` key never required (and not `sequence:`).",
    range: "the key",
  },
  HF403: { trigger: "`removesState` entry never set anywhere.", range: "the entry" },
  HF501: {
    trigger: "`{{ ... }}` syntax in `body` while `templated` is absent/false.",
    range: "first mustache",
  },
  HF502: {
    trigger: "Template parse error (unclosed `{{`, unclosed block, mismatched `{{/x}}`).",
    range: "the offending token",
  },
  HF503: { trigger: "Unknown helper name (not in the 52+8 catalog).", range: "helper name" },
  HF504: { trigger: "Helper arity mismatch (per the helper registry).", range: "the call" },
  HF505: { trigger: "`Vars.X` unresolved against `data.variables[].name`.", range: "the path" },
  HF506: {
    trigger: "`Literals.X` unresolved against `data.literals[].name`.",
    range: "the path",
  },
  HF507: {
    trigger: "Unknown `faker '<Type>'` (not in the pinned 210-name list).",
    range: "the arg",
  },
  HF508: {
    trigger: "Parameterized gofakeit method (Number, Sentence, Password, Regex, …).",
    range: "the arg",
  },
  HF509: {
    trigger: "Invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y, e.g. `w`).",
    range: "the arg",
  },
  HF510: {
    trigger:
      "Raymond built-in (`if`/`unless`/`with`/`each`/`first`/`log`/`lookup`/`equal`) used in `data.variables[].function`.",
    range: "function value",
  },
  HF601: {
    trigger:
      "`globalActions.delays[].urlPattern` (or `delaysLogNormal[]`) is an invalid Go RE2 regex.",
    range: "the pattern",
  },
  HF602: {
    trigger:
      "`postServeAction` not in the user-configured `hoverfly.registeredActions` allowlist (only when the setting is non-empty).",
    range: "the value",
  },
};

const FAMILIES = [
  {
    prefix: "HF1",
    title: "HF1xx — structure & meta",
    blurb: "Document shape, schema validity, and `schemaVersion` handling.",
  },
  {
    prefix: "HF2",
    title: "HF2xx — request matchers",
    blurb: "Matcher names, value types, `config`, the `form` pseudo-matcher, and `doMatch` chains.",
  },
  {
    prefix: "HF3",
    title: "HF3xx — response",
    blurb: "Body/bodyFile, header parity, status range, encoding, and delays.",
  },
  {
    prefix: "HF4",
    title: "HF4xx — state",
    blurb: "State-flow analysis across `requiresState` / `transitionsState` / `removesState`.",
  },
  {
    prefix: "HF5",
    title: "HF5xx — templating",
    blurb:
      "Active when `templated: true` (HF501 is the exception). Parser errors, helpers, variables, faker, and `now` offsets.",
  },
  {
    prefix: "HF6",
    title: "HF6xx — globalActions & misc",
    blurb: "Delay URL patterns and post-serve actions.",
  },
];

function mdEscape(text) {
  return String(text)
    .replaceAll("|", String.raw`\|`)
    .replaceAll("\n", " ");
}

function assertProseComplete() {
  const missing = Object.keys(DIAGNOSTIC_CATALOG).filter((code) => !DIAGNOSTIC_PROSE[code]);
  if (missing.length > 0) {
    throw new Error(
      `Missing Trigger/Range prose for catalog code(s): ${missing.join(", ")}. ` +
        "Add an entry to DIAGNOSTIC_PROSE in scripts/generate-diagnostic-docs.mjs.",
    );
  }
  const stale = Object.keys(DIAGNOSTIC_PROSE).filter((code) => !DIAGNOSTIC_CATALOG[code]);
  if (stale.length > 0) {
    throw new Error(`Stale prose entries (no longer in the catalog): ${stale.join(", ")}.`);
  }
}

function renderDiagnosticsDoc() {
  const codes = Object.keys(DIAGNOSTIC_CATALOG).sort();
  const lines = [];
  lines.push(GENERATED_NOTICE);
  lines.push("");
  lines.push("# Diagnostic catalog");
  lines.push("");
  lines.push(
    "Every diagnostic the Hoverfly LSP emits carries a stable `HFxxx` code, " +
      '`source: "hoverfly"`, and a `codeDescription.href` pointing back at this page. ' +
      "Codes are **stable API**: once frozen, a code's meaning never changes (new codes may be " +
      "added; deprecated codes are never reused).",
  );
  lines.push("");
  lines.push(
    "Severity policy (architect decision D4): **Error** = Hoverfly would reject the import or the " +
      "pair could silently never match; **Warning** = legal but almost certainly a mistake; " +
      "**Information** = style/upgrade hints; **Hint** = optional niceties.",
  );
  lines.push("");
  lines.push(
    "> Generated from `packages/core/src/semantic/catalog.ts` (code, severity, message) plus the " +
      "trigger/range prose from `research/11-diagnostic-catalog.md`. Regenerate with " +
      "`npm run docs:diagnostics`.",
  );
  lines.push("");
  lines.push(`There are **${codes.length} codes** across ${FAMILIES.length} families.`);
  lines.push("");

  for (const family of FAMILIES) {
    const familyCodes = codes.filter((code) => code.startsWith(family.prefix));
    if (familyCodes.length === 0) {
      continue;
    }
    lines.push(`## ${family.title}`);
    lines.push("");
    lines.push(family.blurb);
    lines.push("");
    lines.push("| Code | Severity | Trigger | Range | Message |");
    lines.push("| --- | --- | --- | --- | --- |");
    for (const code of familyCodes) {
      const entry = DIAGNOSTIC_CATALOG[code];
      const prose = DIAGNOSTIC_PROSE[code];
      const message =
        entry.messageTemplate === "{message}" || entry.messageTemplate === "{explain}"
          ? "_(passthrough — supplied by the parser/schema)_"
          : `\`${entry.messageTemplate}\``;
      lines.push(
        `| [${code}](#${code.toLowerCase()}) | ${SEVERITY_LABEL[entry.severity]} | ` +
          `${mdEscape(prose.trigger)} | ${mdEscape(prose.range)} | ${mdEscape(message)} |`,
      );
    }
    lines.push("");
  }

  lines.push("## Per-code anchors");
  lines.push("");
  lines.push(
    "The `codeDescription.href` for each diagnostic resolves to " +
      "`https://hoverfly-lsp.dev/diagnostics/<code>`; the anchors below mirror that catalog.",
  );
  lines.push("");
  for (const code of codes) {
    const entry = DIAGNOSTIC_CATALOG[code];
    const prose = DIAGNOSTIC_PROSE[code];
    lines.push(`### ${code}`);
    lines.push("");
    lines.push(`- **Severity:** ${SEVERITY_LABEL[entry.severity]}`);
    lines.push(`- **Trigger:** ${prose.trigger}`);
    lines.push(`- **Range:** ${prose.range}`);
    const message =
      entry.messageTemplate === "{message}" || entry.messageTemplate === "{explain}"
        ? "passthrough (supplied by the parser/schema)"
        : `\`${entry.messageTemplate}\``;
    lines.push(`- **Message:** ${message}`);
    lines.push("");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

function helperRow(spec) {
  const argList =
    spec.args.length === 0
      ? "—"
      : spec.args.map((arg) => `${arg.name}: ${arg.type}${arg.optional ? "?" : ""}`).join(", ") +
        (spec.variadic ? ", …" : "");
  const kind = spec.block ? "block" : "inline";
  // Strip the trailing docs URL from the prose; the registry appends a link to every entry.
  const doc = spec.docs.replace(/\s*https?:\/\/\S+\s*$/, "").trim();
  return `| \`${spec.name}\` | ${kind} | ${mdEscape(argList)} | \`${mdEscape(spec.example)}\` | ${mdEscape(doc)} |`;
}

function renderTemplateReferenceDoc() {
  const lines = [];
  lines.push(GENERATED_NOTICE);
  lines.push("");
  lines.push("# Template reference");
  lines.push("");
  lines.push(
    'Hoverfly response bodies marked `"templated": true` are rendered through ' +
      "[SpectoLabs/raymond](https://github.com/SpectoLabs/raymond) (a Handlebars fork). The LSP " +
      "validates template syntax, helper names, helper arity, `Vars`/`Literals` resolution, " +
      "`faker` types, and `now` offsets (see the HF5xx codes in " +
      "[diagnostics.md](./diagnostics.md)).",
  );
  lines.push("");
  lines.push(
    "> Generated from `packages/core/src/registry/helpers.ts` and `registry/faker.ts`. " +
      "Regenerate with `npm run docs:diagnostics`.",
  );
  lines.push("");
  lines.push(
    `There are **${HOVERFLY_HELPERS.length} Hoverfly helpers** plus **${RAYMOND_BUILTINS.length} raymond ` +
      `built-ins** (${ALL_HELPERS.length} total).`,
  );
  lines.push("");

  lines.push("## Hoverfly helpers");
  lines.push("");
  lines.push(
    `The ${HOVERFLY_HELPERS.length} helpers registered in Hoverfly's \`helperMethodMap\`. These — and ` +
      "**only** these — are also valid in `data.variables[].function`.",
  );
  lines.push("");
  lines.push("| Helper | Kind | Arguments | Example | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const spec of HOVERFLY_HELPERS) {
    lines.push(helperRow(spec));
  }
  lines.push("");

  lines.push("## Raymond built-ins");
  lines.push("");
  lines.push(
    `The ${RAYMOND_BUILTINS.length} Handlebars built-ins usable in any templated body. ` +
      "`first` and `equal` are SpectoLabs-fork additions a generic Handlebars language server " +
      "would not know. These are **not** valid in `data.variables[].function`.",
  );
  lines.push("");
  lines.push("| Helper | Kind | Arguments | Example | Notes |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const spec of RAYMOND_BUILTINS) {
    lines.push(helperRow(spec));
  }
  lines.push("");

  lines.push("## `now` offsets and formats");
  lines.push("");
  lines.push(`- ${NOW_FORMAT_NOTES.units}`);
  lines.push(`- ${NOW_FORMAT_NOTES.formats}`);
  lines.push(`- Accepted units: ${NOW_OFFSET_UNITS.map((u) => `\`${u}\``).join(", ")}.`);
  lines.push(`- Offset pattern: \`${NOW_FORMAT_NOTES.offsetPattern}\`.`);
  lines.push("");

  lines.push("## `faker` types");
  lines.push("");
  lines.push(
    `Hoverfly's \`{{faker 'X'}}\` dispatches by reflection over \`*gofakeit.Faker\` (pinned to ` +
      `gofakeit **v${GOFAKEIT_VERSION}**). Only the **${FAKER_NAMES.length} zero-argument** method names ` +
      "below are valid, and they are **case-sensitive**. Parameterized methods (`Number`, " +
      "`Sentence`, `Password`, `Regex`, …) panic at render time when called with no arguments — " +
      "the LSP flags those (HF508). The authoritative list lives in " +
      "[`packages/core/src/registry/faker.ts`](../packages/core/src/registry/faker.ts).",
  );
  lines.push("");
  lines.push(`<details><summary>All ${FAKER_NAMES.length} faker type names</summary>`);
  lines.push("");
  // Chunk into rows of 6 for a readable table.
  const cols = 6;
  lines.push("| | | | | | |");
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (let i = 0; i < FAKER_NAMES.length; i += cols) {
    const row = FAKER_NAMES.slice(i, i + cols);
    while (row.length < cols) {
      row.push("");
    }
    lines.push(`| ${row.map((n) => (n ? `\`${n}\`` : "")).join(" | ")} |`);
  }
  lines.push("");
  lines.push("</details>");
  lines.push("");

  lines.push("## JSONPath / XPath dialects");
  lines.push("");
  lines.push(
    "Hoverfly's JSONPath support uses the **kubectl** dialect " +
      "(`k8s.io/client-go/util/jsonpath`), **not** Jayway or RFC 9535. XPath is evaluated by " +
      "`ChrisTrenkamp/xsel`. Expressions written for Jayway-style JSONPath (filters, recursive " +
      "descent specifics) may not behave the same — author against the kubectl JSONPath syntax.",
  );
  lines.push("");

  return `${lines.join("\n").trimEnd()}\n`;
}

async function main() {
  assertProseComplete();
  await mkdir(DOCS_DIR, { recursive: true });
  await writeFile(resolve(DOCS_DIR, "diagnostics.md"), renderDiagnosticsDoc(), "utf8");
  await writeFile(resolve(DOCS_DIR, "template-reference.md"), renderTemplateReferenceDoc(), "utf8");
  process.stdout.write("Wrote docs/diagnostics.md and docs/template-reference.md\n");
}

await main();
