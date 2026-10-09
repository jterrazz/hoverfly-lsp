// outside: the reference pages are generated from the built analysis package, the per-code trigger
// and range prose carried over from research/11-diagnostic-catalog.md; generation aborts on a
// catalog code with no prose, so the table never drifts.

import {
    ALL_HELPERS,
    DIAGNOSTIC_CATALOG,
    FAKER_NAMES,
    GOFAKEIT_VERSION,
    HOVERFLY_HELPERS,
    NOW_FORMAT_NOTES,
    NOW_OFFSET_UNITS,
    RAYMOND_BUILTINS,
} from '@hoverfly-lsp/analysis';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { DIAGNOSTIC_PROSE } from './diagnostic-prose.mjs';

const HERE = import.meta.dirname;
const ROOT = resolve(HERE, '..');
const DOCS_DIR = resolve(ROOT, 'docs/reference');

const GENERATED_NOTICE =
    '<!-- GENERATED FILE. Do not edit by hand. Run `npm run docs:diagnostics` to regenerate. -->';

// outside: the LSP DiagnosticSeverity values the catalog stores (vscode-languageserver-types).
const SEVERITY_LABEL = {
    1: 'Error',
    2: 'Warning',
    3: 'Information',
    4: 'Hint',
};

const FAMILIES = [
    {
        prefix: 'HF1',
        title: 'HF1xx: structure & meta',
        blurb: 'Document shape, schema validity, and `schemaVersion` handling.',
    },
    {
        prefix: 'HF2',
        title: 'HF2xx: request matchers',
        blurb: 'Matcher names, value types, `config`, the `form` pseudo-matcher, and `doMatch` chains.',
    },
    {
        prefix: 'HF3',
        title: 'HF3xx: response',
        blurb: 'Body/bodyFile, header parity, status range, encoding, and delays.',
    },
    {
        prefix: 'HF4',
        title: 'HF4xx: state',
        blurb: 'State-flow analysis across `requiresState` / `transitionsState` / `removesState`.',
    },
    {
        prefix: 'HF5',
        title: 'HF5xx: templating',
        blurb: 'Active when `templated: true` (HF501 is the exception). Parser errors, helpers, variables, faker, and `now` offsets.',
    },
    {
        prefix: 'HF6',
        title: 'HF6xx: globalActions & misc',
        blurb: 'Delay URL patterns and post-serve actions.',
    },
];

function mdEscape(text) {
    return String(text)
        .replaceAll('|', String.raw`\|`)
        .replaceAll('\n', ' ');
}

function assertProseComplete() {
    const missing = Object.keys(DIAGNOSTIC_CATALOG).filter((code) => !DIAGNOSTIC_PROSE[code]);
    if (missing.length > 0) {
        throw new Error(
            `Missing Trigger/Range prose for catalog code(s): ${missing.join(', ')}. ` +
                'Add an entry to DIAGNOSTIC_PROSE in scripts/generate-diagnostic-docs.mjs.',
        );
    }
    const stale = Object.keys(DIAGNOSTIC_PROSE).filter((code) => !DIAGNOSTIC_CATALOG[code]);
    if (stale.length > 0) {
        throw new Error(`Stale prose entries (no longer in the catalog): ${stale.join(', ')}.`);
    }
}

function messageOf(entry, passthrough) {
    return entry.messageTemplate === '{message}' || entry.messageTemplate === '{explain}'
        ? passthrough
        : `\`${entry.messageTemplate}\``;
}

function familyTable(family, codes) {
    const familyCodes = codes.filter((code) => code.startsWith(family.prefix));
    if (familyCodes.length === 0) {
        return [];
    }
    return [
        `## ${family.title}`,
        '',
        family.blurb,
        '',
        '| Code | Severity | Trigger | Range | Message |',
        '| --- | --- | --- | --- | --- |',
        ...familyCodes.map((code) => {
            const entry = DIAGNOSTIC_CATALOG[code];
            const prose = DIAGNOSTIC_PROSE[code];
            const message = messageOf(entry, '_(passthrough: supplied by the parser/schema)_');
            return (
                `| [${code}](#${code.toLowerCase()}) | ${SEVERITY_LABEL[entry.severity]} | ` +
                `${mdEscape(prose.trigger)} | ${mdEscape(prose.range)} | ${mdEscape(message)} |`
            );
        }),
        '',
    ];
}

function codeAnchor(code) {
    const entry = DIAGNOSTIC_CATALOG[code];
    const prose = DIAGNOSTIC_PROSE[code];
    return [
        `### ${code}`,
        '',
        `- **Severity:** ${SEVERITY_LABEL[entry.severity]}`,
        `- **Trigger:** ${prose.trigger}`,
        `- **Range:** ${prose.range}`,
        `- **Message:** ${messageOf(entry, 'passthrough (supplied by the parser/schema)')}`,
        '',
    ];
}

function renderDiagnosticsDoc() {
    const codes = Object.keys(DIAGNOSTIC_CATALOG).toSorted();
    const lines = [
        GENERATED_NOTICE,
        '',
        '# Diagnostic catalog',
        '',
        'Every diagnostic the Hoverfly LSP emits carries a stable `HFxxx` code, ' +
            '`source: "hoverfly"`, and a `codeDescription.href` pointing back at this page. ' +
            "Codes are **stable API**: once frozen, a code's meaning never changes (new codes may be " +
            'added; deprecated codes are never reused).',
        '',
        'Severity policy (architect decision D4): **Error** = Hoverfly would reject the import or the ' +
            'pair could silently never match; **Warning** = legal but almost certainly a mistake; ' +
            '**Information** = style/upgrade hints; **Hint** = optional niceties.',
        '',
        '> Generated from `packages/analysis/src/semantic/catalog.data.ts` (code, severity, message) plus the ' +
            'trigger/range prose from `research/11-diagnostic-catalog.md`. Regenerate with ' +
            '`npm run docs:diagnostics`.',
        '',
        `There are **${codes.length} codes** across ${FAMILIES.length} families.`,
        '',
        ...FAMILIES.flatMap((family) => familyTable(family, codes)),
        '## Per-code anchors',
        '',
        'The `codeDescription.href` for each diagnostic resolves to ' +
            '`https://hoverfly-lsp.dev/diagnostics/<code>`; the anchors below mirror that catalog.',
        '',
        ...codes.flatMap(codeAnchor),
    ];
    return `${lines.join('\n').trimEnd()}\n`;
}

function helperRow(spec) {
    const argList =
        spec.args.length === 0
            ? 'none'
            : spec.args
                  .map((arg) => `${arg.name}: ${arg.type}${arg.optional ? '?' : ''}`)
                  .join(', ') + (spec.variadic ? ', …' : '');
    const kind = spec.block ? 'block' : 'inline';
    // value: the registry ends every docs string with a link; the page links each entry itself.
    const doc = spec.docs.replace(/\s*https?:\/\/\S+\s*$/u, '').trim();
    return `| \`${spec.name}\` | ${kind} | ${mdEscape(argList)} | \`${mdEscape(spec.example)}\` | ${mdEscape(doc)} |`;
}

function helperSection(title, intro, specs) {
    return [
        `## ${title}`,
        '',
        intro,
        '',
        '| Helper | Kind | Arguments | Example | Notes |',
        '| --- | --- | --- | --- | --- |',
        ...specs.map(helperRow),
        '',
    ];
}

function fakerTable() {
    const columns = 6;
    const rows = [];
    for (let index = 0; index < FAKER_NAMES.length; index += columns) {
        const cells = Array.from({ length: columns }, (_, column) => FAKER_NAMES[index + column]);
        rows.push(
            `| ${cells.map((name) => (name === undefined ? '' : `\`${name}\``)).join(' | ')} |`,
        );
    }
    return ['| | | | | | |', '| --- | --- | --- | --- | --- | --- |', ...rows];
}

function fakerSection() {
    return [
        '## `faker` types',
        '',
        `Hoverfly's \`{{faker 'X'}}\` dispatches by reflection over \`*gofakeit.Faker\` (pinned to ` +
            `gofakeit **v${GOFAKEIT_VERSION}**). Only the **${FAKER_NAMES.length} zero-argument** method names ` +
            'below are valid, and they are **case-sensitive**. Parameterized methods (`Number`, ' +
            '`Sentence`, `Password`, `Regex`, …) panic at render time when called with no arguments; ' +
            'the LSP flags those (HF508). The authoritative list lives in ' +
            '[`packages/analysis/src/registry/faker.ts`](../../packages/analysis/src/registry/faker.ts).',
        '',
        `<details><summary>All ${FAKER_NAMES.length} faker type names</summary>`,
        '',
        ...fakerTable(),
        '',
        '</details>',
        '',
    ];
}

function renderTemplateReferenceDoc() {
    const lines = [
        GENERATED_NOTICE,
        '',
        '# Template reference',
        '',
        'Hoverfly response bodies marked `"templated": true` are rendered through ' +
            '[SpectoLabs/raymond](https://github.com/SpectoLabs/raymond) (a Handlebars fork). The LSP ' +
            'validates template syntax, helper names, helper arity, `Vars`/`Literals` resolution, ' +
            '`faker` types, and `now` offsets (see the HF5xx codes in ' +
            '[diagnostics.md](./diagnostics.md)).',
        '',
        '> Generated from `packages/analysis/src/registry/templating.data.ts` and `registry/faker.ts`. ' +
            'Regenerate with `npm run docs:diagnostics`.',
        '',
        `There are **${HOVERFLY_HELPERS.length} Hoverfly helpers** plus **${RAYMOND_BUILTINS.length} raymond ` +
            `built-ins** (${ALL_HELPERS.length} total).`,
        '',
        ...helperSection(
            'Hoverfly helpers',
            `The ${HOVERFLY_HELPERS.length} helpers registered in Hoverfly's \`helperMethodMap\`. These, and ` +
                '**only** these, are also valid in `data.variables[].function`.',
            HOVERFLY_HELPERS,
        ),
        ...helperSection(
            'Raymond built-ins',
            `The ${RAYMOND_BUILTINS.length} Handlebars built-ins usable in any templated body. ` +
                '`first` and `equal` are SpectoLabs-fork additions a generic Handlebars language server ' +
                'would not know. These are **not** valid in `data.variables[].function`.',
            RAYMOND_BUILTINS,
        ),
        '## `now` offsets and formats',
        '',
        `- ${NOW_FORMAT_NOTES.units}`,
        `- ${NOW_FORMAT_NOTES.formats}`,
        `- Accepted units: ${NOW_OFFSET_UNITS.map((u) => `\`${u}\``).join(', ')}.`,
        `- Offset pattern: \`${NOW_FORMAT_NOTES.offsetPattern}\`.`,
        '',
        ...fakerSection(),
        '## JSONPath / XPath dialects',
        '',
        "Hoverfly's JSONPath support uses the **kubectl** dialect " +
            '(`k8s.io/client-go/util/jsonpath`), **not** Jayway or RFC 9535. XPath is evaluated by ' +
            '`ChrisTrenkamp/xsel`. Expressions written for Jayway-style JSONPath (filters, recursive ' +
            'descent specifics) may not behave the same; author against the kubectl JSONPath syntax.',
        '',
    ];
    return `${lines.join('\n').trimEnd()}\n`;
}

async function main() {
    assertProseComplete();
    await mkdir(DOCS_DIR, { recursive: true });
    await writeFile(resolve(DOCS_DIR, 'diagnostics.md'), renderDiagnosticsDoc(), 'utf8');
    await writeFile(
        resolve(DOCS_DIR, 'template-reference.md'),
        renderTemplateReferenceDoc(),
        'utf8',
    );
    process.stdout.write(
        'Wrote docs/reference/diagnostics.md and docs/reference/template-reference.md\n',
    );
}

await main();
