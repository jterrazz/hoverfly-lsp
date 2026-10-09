import { getLanguageService } from 'vscode-json-languageservice';
import type {
    CompletionsCollector,
    JSONPath,
    JSONWorkerContribution,
    MarkedString,
} from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
// outside: the enum values come from vscode-languageserver-types: under Node ESM, the CJS lexer
// cannot detect the names vscode-json-languageservice's CJS entry re-exports.
import { CompletionItemKind, InsertTextFormat, MarkupKind } from 'vscode-languageserver-types';
import type { CompletionItem } from 'vscode-languageserver-types';

import { HTTP_METHODS, URI_SCHEMES } from '../registry/http.js';
import { MATCHER_SPECS } from '../registry/matchers.js';
import type { MatcherSpec } from '../registry/matchers.js';
import { buildSimulationModel } from '../semantic/model.js';
import type { HoverflyServiceSettings, SimulationModel } from '../semantic/rule.js';
import { matcherDetail, matcherMarkdown } from './docs.js';
import {
    isPostServeActionPosition,
    isRequiresStateKeyPosition,
    isSchemaVersionPosition,
    isTransitionsStateKeyPosition,
    matchMatcherNamePosition,
    matchMethodSchemeValuePosition,
} from './paths.js';

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

function createHoverflyContribution(
    settings: HoverflyServiceSettings,
    resolveDocument: (uri: string) => TextDocument | undefined,
): JSONWorkerContribution {
    function model(uri: string): SimulationModel | undefined {
        const document = resolveDocument(uri);
        if (!document) {
            return undefined;
        }
        // outside: the contribution API hands a URI and a path, never the AST the service already
        // parsed, so the model is built from a re-parse.
        return buildSimulationModelFromText(document);
    }

    return {
        getInfoContribution(uri: string, location: JSONPath): PromiseLike<MarkedString[]> {
            const matcherPosition = matchMatcherNamePosition(location, { requireMatcherKey: true });
            if (!matcherPosition) {
                // outside: the library runs the schema hover only when the contribution answers no
                // promise (`if (promise)`); a resolved one would short-circuit it.
                return undefined as unknown as PromiseLike<MarkedString[]>;
            }
            // outside: the library passes no hovered value, so the matcher name is read back from
            // the document at this path.
            const name = matcherNameAt(uri, location, resolveDocument);
            const spec = name === undefined ? undefined : specForName(name, matcherPosition.isBody);
            if (!spec) {
                return undefined as unknown as PromiseLike<MarkedString[]>;
            }
            // outside: a bare Markdown string renders as Markdown; a { language, value } pair
            // renders as a fenced code block.
            const contents: MarkedString[] = [matcherMarkdown(spec)];
            return Promise.resolve(contents);
        },

        collectPropertyCompletions(
            uri: string,
            location: JSONPath,
            _currentWord: string,
            addValue: boolean,
            _isLast: boolean,
            result: CompletionsCollector,
        ): PromiseLike<unknown> {
            if (isRequiresStateKeyPosition(location)) {
                collectStateKeyCompletions(result, model(uri), addValue, { includeSequence: true });
            } else if (isTransitionsStateKeyPosition(location)) {
                collectStateKeyCompletions(result, model(uri), addValue, {
                    includeSequence: false,
                });
            }
            return Promise.resolve();
        },

        collectValueCompletions(
            uri: string,
            location: JSONPath,
            propertyKey: string,
            result: CompletionsCollector,
        ): PromiseLike<unknown> {
            if (propertyKey === 'matcher') {
                const position = matchMatcherNamePosition([...location, 'matcher'], {
                    requireMatcherKey: true,
                });
                if (position) {
                    collectMatcherNameCompletions(result, position.isBody);
                }
                return Promise.resolve();
            }
            const valueField = matchMethodSchemeValuePosition(location, { propertyKey });
            if (valueField && matcherIsExactOrDefault(uri, location, resolveDocument)) {
                collectMethodSchemeValueCompletions(result, valueField);
                return Promise.resolve();
            }
            if (isSchemaVersionPosition(location, { propertyKey })) {
                collectSchemaVersionCompletions(result);
                return Promise.resolve();
            }
            if (isPostServeActionPosition(location, { propertyKey })) {
                collectPostServeActionCompletions(result, settings);
                return Promise.resolve();
            }
            return Promise.resolve();
        },

        collectDefaultCompletions(): PromiseLike<unknown> {
            return Promise.resolve();
        },
    };
}

function collectMatcherNameCompletions(result: CompletionsCollector, isBody: boolean): void {
    for (const spec of MATCHER_SPECS) {
        if (spec.name === '') {
            continue;
        }
        if (spec.bodyOnly && !isBody) {
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
function collectMethodSchemeValueCompletions(result: CompletionsCollector, field: string): void {
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

function collectSchemaVersionCompletions(result: CompletionsCollector): void {
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
function collectStateKeyCompletions(
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

function collectPostServeActionCompletions(
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

function specForName(name: string, isBody: boolean): MatcherSpec | undefined {
    const lower = name.toLowerCase();
    for (const spec of MATCHER_SPECS) {
        if (spec.bodyOnly) {
            // outside: Hoverfly reads `form` case-sensitively, and on the request body only.
            if (spec.name === name && isBody) {
                return spec;
            }
            continue;
        }
        if (spec.name.toLowerCase() === lower) {
            return spec;
        }
    }
    return undefined;
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

function matcherNameAt(
    uri: string,
    location: JSONPath,
    resolveDocument: (uri: string) => TextDocument | undefined,
): string | undefined {
    const document = resolveDocument(uri);
    if (!document) {
        return undefined;
    }
    return readStringAtPath(document, location);
}

// invariant: method and scheme are an enum only under an exact or default matcher; a glob or regex
// value is a pattern, and nothing is offered there.
function matcherIsExactOrDefault(
    uri: string,
    location: JSONPath,
    resolveDocument: (uri: string) => TextDocument | undefined,
): boolean {
    const document = resolveDocument(uri);
    if (!document) {
        return false;
    }
    const matcher = readStringAtPath(document, [...location, 'matcher']);
    return matcher === undefined || matcher === '' || matcher.toLowerCase() === 'exact';
}

const parserOnly = getLanguageService({});

function buildSimulationModelFromText(document: TextDocument): SimulationModel {
    return buildSimulationModel(parserOnly.parseJSONDocument(document));
}

function readStringAtPath(document: TextDocument, path: JSONPath): string | undefined {
    const parsed = parserOnly.parseJSONDocument(document);
    let node = parsed.root;
    for (const segment of path) {
        if (!node) {
            return undefined;
        }
        if (typeof segment === 'number') {
            if (node.type !== 'array') {
                return undefined;
            }
            node = node.items[segment];
        } else {
            if (node.type !== 'object') {
                return undefined;
            }
            node = node.properties.find((p) => p.keyNode.value === segment)?.valueNode;
        }
    }
    return node?.type === 'string' ? node.value : undefined;
}

export { createHoverflyContribution };
