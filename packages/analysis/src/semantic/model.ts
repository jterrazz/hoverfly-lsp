// invariant: never throws on bad input. Any shape may be wrong, and an absent or wrong-shaped node
// resolves to undefined or an empty list for the rules to skip.

import type {
    ASTNode,
    JSONDocument,
    ObjectASTNode,
    PropertyASTNode,
} from 'vscode-json-languageservice';

import type {
    DelayModel,
    FieldContainer,
    GlobalActionsModel,
    HeaderEntry,
    MatcherModel,
    MetaModel,
    PairModel,
    RemovesStateEntry,
    RequestField,
    RequestModel,
    ResponseField,
    ResponseModel,
    SimulationModel,
    StateEntry,
} from './rule.js';

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
    return node?.type === 'object' ? node : undefined;
}

function prop(node: ObjectASTNode | undefined, key: string): PropertyASTNode | undefined {
    if (!node) {
        return undefined;
    }
    return node.properties.find((p) => p.keyNode.value === key);
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return prop(node, key)?.valueNode;
}

function field(node: ObjectASTNode | undefined, key: string): ResponseField {
    const property = prop(node, key);
    return {
        propertyNode: property,
        keyNode: property?.keyNode,
        valueNode: property?.valueNode,
    };
}

function arrayItems(node: ObjectASTNode | undefined, key: string): ASTNode[] {
    const value = propValue(node, key);
    return value?.type === 'array' ? value.items : [];
}

function stringValue(node: ASTNode | undefined): string | undefined {
    return node?.type === 'string' ? node.value : undefined;
}

function buildMatcher(
    node: ASTNode | undefined,
    fieldName: string,
    container: FieldContainer,
): MatcherModel {
    const object = asObject(node);
    const matcherNode = propValue(object, 'matcher');
    return {
        node: object,
        matcherNode,
        matcherName: stringValue(matcherNode),
        valueNode: propValue(object, 'value'),
        configNode: propValue(object, 'config'),
        doMatchNode: propValue(object, 'doMatch'),
        parent: { fieldName, container },
    };
}

function buildMatcherField(
    property: PropertyASTNode,
    fieldName: string,
    container: FieldContainer,
): RequestField {
    const value = property.valueNode;
    const items = value?.type === 'array' ? value.items : [];
    return {
        fieldName,
        container,
        keyNode: property.keyNode,
        matchers: items.map((item) => buildMatcher(item, fieldName, container)),
    };
}

const NESTED_MATCHER_MAPS = new Set(['headers', 'query']);

function buildRequest(node: ASTNode | undefined): RequestModel {
    const object = asObject(node);
    if (!object) {
        return { node: undefined, fields: [] };
    }

    const fields: RequestField[] = [];
    for (const property of object.properties) {
        const name = property.keyNode.value;
        if (NESTED_MATCHER_MAPS.has(name)) {
            const inner = asObject(property.valueNode);
            const container: FieldContainer = name === 'headers' ? 'headers' : 'query';
            if (inner) {
                for (const innerProp of inner.properties) {
                    fields.push(buildMatcherField(innerProp, innerProp.keyNode.value, container));
                }
            }
            continue;
        }
        if (property.valueNode?.type === 'array') {
            fields.push(buildMatcherField(property, name, 'request'));
        }
    }

    return { node: object, fields };
}

function buildResponse(node: ASTNode | undefined): ResponseModel {
    const object = asObject(node);
    const headersNode = asObject(propValue(object, 'headers'));
    const headers: HeaderEntry[] = headersNode
        ? headersNode.properties.map((p) => ({
              name: p.keyNode.value,
              keyNode: p.keyNode,
              valueNode: p.valueNode,
          }))
        : [];

    return {
        node: object,
        status: field(object, 'status'),
        body: field(object, 'body'),
        bodyFile: field(object, 'bodyFile'),
        encodedBody: field(object, 'encodedBody'),
        templated: field(object, 'templated'),
        fixedDelay: field(object, 'fixedDelay'),
        logNormalDelay: field(object, 'logNormalDelay'),
        headersNode,
        headers,
    };
}

function buildStateEntries(node: ObjectASTNode | undefined, key: string): StateEntry[] {
    const map = asObject(propValue(node, key));
    if (!map) {
        return [];
    }
    return map.properties.map((p) => ({
        key: p.keyNode.value,
        keyNode: p.keyNode,
        valueNode: p.valueNode,
    }));
}

function buildRemovesState(node: ObjectASTNode | undefined): RemovesStateEntry[] {
    return arrayItems(node, 'removesState')
        .filter((item): item is ASTNode => item.type === 'string')
        .map((item) => ({ key: stringValue(item) ?? '', node: item }));
}

function buildPair(node: ASTNode | undefined): PairModel {
    const object = asObject(node);
    // outside: Hoverfly holds requiresState on the request (RequestMatcherViewV5), transitionsState
    // and removesState on the response (ResponseDetailsViewV5) (research/02).
    const requestNode = asObject(propValue(object, 'request'));
    const responseNode = asObject(propValue(object, 'response'));
    return {
        node: object,
        request: buildRequest(requestNode),
        response: buildResponse(responseNode),
        requiresState: buildStateEntries(requestNode, 'requiresState'),
        transitionsState: buildStateEntries(responseNode, 'transitionsState'),
        removesState: buildRemovesState(responseNode),
    };
}

function buildMeta(node: ObjectASTNode | undefined): MetaModel {
    const object = asObject(propValue(node, 'meta'));
    return {
        node: object,
        schemaVersion: field(object, 'schemaVersion'),
    };
}

function buildDelay(node: ASTNode | undefined): DelayModel {
    const object = asObject(node);
    const urlPatternNode = propValue(object, 'urlPattern');
    return {
        node: object,
        urlPatternNode,
        urlPattern: stringValue(urlPatternNode),
        delayNode: propValue(object, 'delay'),
    };
}

function buildGlobalActions(dataNode: ObjectASTNode | undefined): GlobalActionsModel {
    const object = asObject(propValue(dataNode, 'globalActions'));
    return {
        node: object,
        delays: arrayItems(object, 'delays').map(buildDelay),
        delaysLogNormal: arrayItems(object, 'delaysLogNormal').map(buildDelay),
    };
}

/** The typed view of a parsed simulation; a non-object root, a missing data or wrong-typed pairs degrade to empty. */
export function buildSimulationModel(jsonDocument: JSONDocument): SimulationModel {
    const root = asObject(jsonDocument.root);
    const dataNode = asObject(propValue(root, 'data'));

    return {
        root,
        dataNode,
        pairs: arrayItems(dataNode, 'pairs').map(buildPair),
        meta: buildMeta(root),
        globalActions: buildGlobalActions(dataNode),
    };
}
