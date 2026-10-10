import { getLanguageService } from 'vscode-json-languageservice';
import type {
    CompletionsCollector,
    JSONPath,
    JSONWorkerContribution,
} from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { MATCHER_SPECS } from '../registry/matchers.js';
import type { MatcherSpec } from '../registry/matchers.js';
import { buildSimulationModel } from '../semantic/model.js';
import type { HoverflyServiceSettings, SimulationModel } from '../semantic/rule.js';
import { matcherMarkdown } from './docs.js';
import {
    isPostServeActionPosition,
    isRequiresStateKeyPosition,
    isSchemaVersionPosition,
    isTransitionsStateKeyPosition,
    matchMatcherNamePosition,
    matchMethodSchemeValuePosition,
} from './paths.js';
import {
    collectMatcherNameCompletions,
    collectMethodSchemeValueCompletions,
    collectPostServeActionCompletions,
    collectSchemaVersionCompletions,
    collectSequencePrefixCompletion,
    collectStateKeyCompletions,
} from './value-completions.js';

type Hover = ReturnType<JSONWorkerContribution['getInfoContribution']>;
type PropertyCompletionArguments = Parameters<JSONWorkerContribution['collectPropertyCompletions']>;
type ResolveDocument = (uri: string) => TextDocument | undefined;

// oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the library runs the schema hover only when a contribution answers no promise (`if (promise)`), which its own type does not admit
const NO_HOVER = undefined as unknown as Hover;

function modelOf(uri: string, resolveDocument: ResolveDocument): SimulationModel | undefined {
    const document = resolveDocument(uri);
    // outside: the contribution API hands a URI and a path, never the AST the service already
    // parsed, so the model is built from a re-parse.
    return document === undefined ? undefined : buildSimulationModelFromText(document);
}

// outside: the library passes no hovered value, so the matcher name is read back from the document
// at this path; a bare Markdown string renders as Markdown, a { language, value } pair as a fenced
// code block.
function matcherHover(uri: string, location: JSONPath, resolveDocument: ResolveDocument): Hover {
    const position = matchMatcherNamePosition(location);
    if (position === undefined) {
        return NO_HOVER;
    }
    const name = matcherNameAt(uri, location, resolveDocument);
    const spec = name === undefined ? undefined : specForName(name, position.isBody);
    return spec === undefined ? NO_HOVER : Promise.resolve([matcherMarkdown(spec)]);
}

function collectValueCompletions(
    { location, propertyKey, uri }: { location: JSONPath; propertyKey: string; uri: string },
    result: CompletionsCollector,
    {
        resolveDocument,
        settings,
    }: { resolveDocument: ResolveDocument; settings: HoverflyServiceSettings },
): void {
    if (propertyKey === 'matcher') {
        const position = matchMatcherNamePosition([...location, 'matcher']);
        if (position !== undefined) {
            collectMatcherNameCompletions(result, position.isBody);
        }
        return;
    }
    const valueField = matchMethodSchemeValuePosition(location, { propertyKey });
    if (valueField !== undefined && matcherIsExactOrDefault(uri, location, resolveDocument)) {
        collectMethodSchemeValueCompletions(result, valueField);
    } else if (isSchemaVersionPosition(location, { propertyKey })) {
        collectSchemaVersionCompletions(result);
    } else if (isPostServeActionPosition(location, { propertyKey })) {
        collectPostServeActionCompletions(result, settings);
    }
}

function createHoverflyContribution(
    settings: HoverflyServiceSettings,
    resolveDocument: ResolveDocument,
): JSONWorkerContribution {
    return {
        getInfoContribution: (uri, location) => matcherHover(uri, location, resolveDocument),
        collectPropertyCompletions: async (
            ...[uri, location, , addValue, , result]: PropertyCompletionArguments
        ) => {
            if (isRequiresStateKeyPosition(location)) {
                collectStateKeyCompletions(result, modelOf(uri, resolveDocument), addValue);
                collectSequencePrefixCompletion(result, addValue);
            } else if (isTransitionsStateKeyPosition(location)) {
                collectStateKeyCompletions(result, modelOf(uri, resolveDocument), addValue);
            }
        },
        collectValueCompletions: async (uri, location, propertyKey, result) => {
            collectValueCompletions({ location, propertyKey, uri }, result, {
                resolveDocument,
                settings,
            });
        },
        collectDefaultCompletions: async () => undefined,
    };
}

function specForName(name: string, isBody: boolean): MatcherSpec | undefined {
    const lower = name.toLowerCase();
    for (const spec of MATCHER_SPECS) {
        if (spec.bodyOnly === true) {
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
