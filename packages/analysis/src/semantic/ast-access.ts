import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';

/** The node as an object, or undefined. */
export function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
    return node?.type === 'object' ? node : undefined;
}

/** The value node of a key of an object, or undefined. */
export function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
    return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

/** The items of the array a key of an object holds, or none. */
export function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
    const value = propValue(node, key);
    return value?.type === 'array' ? value.items : [];
}
