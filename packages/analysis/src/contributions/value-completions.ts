import type { CompletionsCollector } from 'vscode-json-languageservice';
// outside: the enum values come from vscode-languageserver-types: under Node ESM, the CJS lexer
// cannot detect the names vscode-json-languageservice's CJS entry re-exports.
import { CompletionItemKind, InsertTextFormat, MarkupKind } from 'vscode-languageserver-types';
import type { CompletionItem } from 'vscode-languageserver-types';

import { HTTP_METHODS, URI_SCHEMES } from '../registry/http.js';
import { MATCHER_SPECS } from '../registry/matchers.js';
import type { HoverflyServiceSettings, SimulationModel } from '../semantic/rule.js';
import { matcherDetail, matcherMarkdown } from './docs.js';

// outside: Hoverfly compares method and scheme verbatim (research/13 §3.1, §3.2), so these values
// are offered and never enforced.
const VALUE_ENUMS: Readonly<Record<string, { values: readonly string[]; detail: string }>> = {
    method: {
        values: HTTP_METHODS,
        detail: 'Standard HTTP method (custom verbs are also allowed)',
    },
    scheme: { values: URI_SCHEMES, detail: 'Common URI scheme (any scheme is allowed)' },
};

// value: v5.3 is Hoverfly's current default, so it is preselected and sorts first.
const SCHEMA_VERSIONS: readonly { value: string; preferred: boolean }[] = [
    { value: 'v5.3', preferred: true },
    { value: 'v5', preferred: false },
    { value: 'v5.1', preferred: false },
    { value: 'v5.2', preferred: false },
];

function jsonString(value: string): string {
    return JSON.stringify(value);
}

// hazard: built by concatenation — a literal `${…}` in a plain string reads as a botched template
// literal to no-template-curly-in-string.
function tabStop(index: number, placeholder?: string): string {
    const open = '$'.concat('{');
    return placeholder === undefined ? `$${index}` : `${open}${index}:${placeholder}}`;
}

export function collectMatcherNameCompletions(result: CompletionsCollector, isBody: boolean): void {
    for (const spec of MATCHER_SPECS) {
        if (spec.name === '') {
            continue;
        }
        if (spec.bodyOnly === true && !isBody) {
            continue;
        }
        result.add({
            label: spec.name,
            kind: CompletionItemKind.EnumMember,
            detail: matcherDetail(spec),
            documentation: { kind: MarkupKind.Markdown, value: matcherMarkdown(spec) },
            insertText: jsonString(spec.name),
            insertTextFormat: InsertTextFormat.PlainText,
        });
    }
}

// outside: the library strips the surrounding quotes when the cursor already sits inside a string
// literal, so a quoted insert text fits both positions.
export function collectMethodSchemeValueCompletions(
    result: CompletionsCollector,
    field: string,
): void {
    const enumeration = VALUE_ENUMS[field];
    if (!enumeration) {
        return;
    }
    for (const value of enumeration.values) {
        result.add({
            label: value,
            kind: CompletionItemKind.EnumMember,
            detail: enumeration.detail,
            insertText: jsonString(value),
            insertTextFormat: InsertTextFormat.PlainText,
        });
    }
}

export function collectSchemaVersionCompletions(result: CompletionsCollector): void {
    for (const [index, entry] of SCHEMA_VERSIONS.entries()) {
        const item: CompletionItem & { insertText: string } = {
            label: entry.value,
            kind: CompletionItemKind.EnumMember,
            detail: entry.preferred
                ? 'Hoverfly schema version (current default)'
                : 'Hoverfly schema version',
            documentation: {
                kind: MarkupKind.Markdown,
                value: entry.preferred
                    ? `\`${entry.value}\` — the current default schema version.`
                    : `\`${entry.value}\` — Hoverfly validates any \`v5.x\` against the same v5 schema.`,
            },
            insertText: jsonString(entry.value),
            insertTextFormat: InsertTextFormat.PlainText,
            sortText: entry.preferred ? '0' : `1-${index}`,
            preselect: entry.preferred,
        };
        result.add(item);
    }
}

// value: `addValue` mirrors the schema completion — `: "$1"` is appended at a bare `{`, never when
// the key already carries its value.
export function collectStateKeyCompletions(
    result: CompletionsCollector,
    simulation: SimulationModel | undefined,
    addValue: boolean,
    options: { includeSequence: boolean },
): void {
    const keys = collectStateKeys(simulation);
    for (const key of keys) {
        result.add({
            label: key,
            kind: CompletionItemKind.Property,
            detail: 'State key (declared in this simulation)',
            insertText: addValue ? `${jsonString(key)}: "${tabStop(1)}"` : jsonString(key),
            insertTextFormat: InsertTextFormat.Snippet,
        });
    }
    if (options.includeSequence) {
        const namePlaceholder = `sequence:${tabStop(1, 'name')}`;
        result.add({
            label: 'sequence:',
            kind: CompletionItemKind.Snippet,
            detail: 'Sequence-state key prefix (ordered sequence responses)',
            documentation: {
                kind: MarkupKind.Markdown,
                value: 'A `requiresState` key prefixed `sequence:` drives ordered sequence responses (Hoverfly increments the sequence as each pair is served).',
            },
            insertText: addValue
                ? `${jsonString(namePlaceholder)}: "${tabStop(2)}"`
                : namePlaceholder,
            insertTextFormat: InsertTextFormat.Snippet,
        });
    }
}

export function collectPostServeActionCompletions(
    result: CompletionsCollector,
    settings: HoverflyServiceSettings,
): void {
    for (const action of settings.registeredActions ?? []) {
        result.add({
            label: action,
            kind: CompletionItemKind.Value,
            detail: 'Registered post-serve action',
            insertText: jsonString(action),
            insertTextFormat: InsertTextFormat.PlainText,
        });
    }
}

// invariant: requiresState, transitionsState and removesState share one namespace — a key one pair
// sets is the key another requires, so all three feed the cross-reference.
function collectStateKeys(simulation: SimulationModel | undefined): string[] {
    if (!simulation) {
        return [];
    }
    const keys = new Set<string>();
    for (const pair of simulation.pairs) {
        for (const entry of pair.requiresState) {
            if (entry.key.length > 0) {
                keys.add(entry.key);
            }
        }
        for (const entry of pair.transitionsState) {
            if (entry.key.length > 0) {
                keys.add(entry.key);
            }
        }
        for (const entry of pair.removesState) {
            if (entry.key.length > 0) {
                keys.add(entry.key);
            }
        }
    }
    return [...keys].toSorted();
}
