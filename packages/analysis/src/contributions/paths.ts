// outside: the library hands completion the path of the object owning the property, its key apart,
// and hover the path of the hovered value, key included — so a matcher position is matched by its
// shape, the trailing `matcher` segment optional.

import type { JSONPath, Segment } from 'vscode-json-languageservice';

const DIRECT_MATCHER_FIELDS: ReadonlySet<string> = new Set([
    'body',
    'destination',
    'method',
    'path',
    'scheme',
]);

const NESTED_MATCHER_MAPS: ReadonlySet<string> = new Set(['headers', 'query']);

function isIndex(segment: Segment | undefined): segment is number {
    return typeof segment === 'number';
}

function isString(segment: Segment | undefined): segment is string {
    return typeof segment === 'string';
}

type MatcherPosition = {
    readonly field: string;
    readonly isBody: boolean;
};

function matchMatcherNamePosition(path: JSONPath): MatcherPosition | undefined {
    if (path.at(-1) !== 'matcher') {
        return undefined;
    }
    let trimmed = path.slice(0, -1);
    while (trimmed.at(-1) === 'doMatch') {
        trimmed = trimmed.slice(0, -1);
    }
    return classifyByField(isIndex(trimmed.at(-1)) ? trimmed.slice(0, -1) : trimmed);
}

function classifyByField(beforeIndex: JSONPath): MatcherPosition | undefined {
    const last = beforeIndex.at(-1);
    const prev = beforeIndex.at(-2);

    if (isString(last) && DIRECT_MATCHER_FIELDS.has(last) && prev === 'request') {
        return { field: last, isBody: last === 'body' };
    }

    const grand = beforeIndex.at(-3);
    if (isString(last) && isString(prev) && NESTED_MATCHER_MAPS.has(prev) && grand === 'request') {
        return { field: last, isBody: false };
    }

    return undefined;
}

/** True when the path identifies the `meta.schemaVersion` value (hover or value completion). */
function isSchemaVersionPosition(
    path: JSONPath,
    options: { readonly propertyKey?: string } = {},
): boolean {
    const last = path.at(-1);
    if (last === 'schemaVersion' && path.at(-2) === 'meta') {
        return true;
    }
    return options.propertyKey === 'schemaVersion' && last === 'meta';
}

function isRequiresStateKeyPosition(path: JSONPath): boolean {
    return path.at(-1) === 'requiresState' && path.at(-2) === 'request';
}

function isTransitionsStateKeyPosition(path: JSONPath): boolean {
    return path.at(-1) === 'transitionsState' && path.at(-2) === 'response';
}

/** The request fields whose matcher value is offered as an enumeration. */
type ValueField = 'method' | 'scheme';

function matchMethodSchemeValuePosition(
    path: JSONPath,
    options: { readonly propertyKey?: string } = {},
): undefined | ValueField {
    if (options.propertyKey !== 'value') {
        return undefined;
    }
    const field = path.at(-2);
    if (
        isIndex(path.at(-1)) &&
        (field === 'method' || field === 'scheme') &&
        path.at(-3) === 'request'
    ) {
        return field;
    }
    return undefined;
}

/** True when the path identifies a `response.postServeAction` value position. */
function isPostServeActionPosition(
    path: JSONPath,
    options: { readonly propertyKey?: string } = {},
): boolean {
    const last = path.at(-1);
    if (last === 'postServeAction' && path.at(-2) === 'response') {
        return true;
    }
    return options.propertyKey === 'postServeAction' && last === 'response';
}

export type { ValueField };
export {
    isPostServeActionPosition,
    isRequiresStateKeyPosition,
    isSchemaVersionPosition,
    isTransitionsStateKeyPosition,
    matchMatcherNamePosition,
    matchMethodSchemeValuePosition,
};
