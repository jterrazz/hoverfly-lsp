// invariant: a string is templatable when it is a response body or header value and `templated` is
// true, or when it already holds `{{` — the author is mid-typing, and HF501 asks for `templated`.

import type {
    ASTNode,
    JSONDocument,
    ObjectASTNode,
    StringASTNode,
} from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { hasTemplateSyntax } from '../template/detect.js';
import { createStringSourceMap } from '../template/source-map.js';
import type { StringSourceMap } from '../template/source-map.js';

/** A located templatable string + the cursor mapped into its decoded content. */
type TemplateLocation = {
    /** The decoded template text (escapes resolved, no surrounding quotes). */
    readonly decoded: string;
    /** The cursor as a decoded-string offset. */
    readonly decodedCursor: number;
    /** Document↔decoded offset bridge for this string token. */
    readonly sourceMap: StringSourceMap;
    /** The string AST node the cursor sits in. */
    readonly node: StringASTNode;
    /** Whether `templated: true` was set on the enclosing response (drives diagnostics, not us). */
    readonly templatedEnabled: boolean;
};

function findTemplateLocation(
    document: TextDocument,
    jsonDocument: JSONDocument,
    offset: number,
): TemplateLocation | undefined {
    const root = asObject(jsonDocument.root);
    const dataNode = asObject(propValue(root, 'data'));
    const pairs = arrayItems(dataNode, 'pairs');

    for (const pairNode of pairs) {
        const pair = asObject(pairNode);
        const response = asObject(propValue(pair, 'response'));
        if (!response) {
            continue;
        }
        const located = locateInResponse(document, response, offset);
        if (located) {
            return located;
        }
    }
    return undefined;
}

function locateInResponse(
    document: TextDocument,
    response: ObjectASTNode,
    offset: number,
): TemplateLocation | undefined {
    const templatedEnabled = boolValue(propValue(response, 'templated')) === true;

    const bodyNode = propValue(response, 'body');
    if (isStringNode(bodyNode) && containsOffset(bodyNode, offset)) {
        return buildLocation(document, bodyNode, templatedEnabled, offset);
    }

    const headerValues = (asObject(propValue(response, 'headers'))?.properties ?? []).flatMap(
        ({ valueNode }) => (valueNode?.type === 'array' ? valueNode.items : []),
    );
    const header = headerValues.find(
        (item): item is StringASTNode => isStringNode(item) && containsOffset(item, offset),
    );
    if (header !== undefined) {
        return buildLocation(document, header, templatedEnabled, offset);
    }
    return undefined;
}

function buildLocation(
    document: TextDocument,
    node: StringASTNode,
    templatedEnabled: boolean,
    offset: number,
): TemplateLocation | undefined {
    const rawToken = document.getText().slice(node.offset, node.offset + node.length);
    const sourceMap = createStringSourceMap(rawToken, node.offset);

    if (!templatedEnabled && !hasTemplateSyntax(sourceMap.decoded)) {
        return undefined;
    }

    const decodedCursor = sourceMap.toDecodedOffset(offset);
    return {
        decoded: sourceMap.decoded,
        decodedCursor,
        sourceMap,
        node,
        templatedEnabled,
    };
}

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
    return node?.type === 'object' ? node : undefined;
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
    const value = propValue(node, key);
    return value?.type === 'array' ? value.items : [];
}

function boolValue(node: ASTNode | undefined): boolean | undefined {
    return node?.type === 'boolean' ? node.value : undefined;
}

function isStringNode(node: ASTNode | undefined): node is StringASTNode {
    return node?.type === 'string';
}

// invariant: a string node's offset and length cover its quotes; a cursor just inside either quote
// counts as inside the content.
function containsOffset(node: StringASTNode, offset: number): boolean {
    const start = node.offset + 1;
    const end = node.offset + node.length - 1;
    return offset >= start && offset <= end;
}

export { findTemplateLocation, type TemplateLocation };
