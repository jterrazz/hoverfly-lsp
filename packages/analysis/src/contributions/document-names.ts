import type { ASTNode, JSONDocument } from 'vscode-json-languageservice';
import { CompletionItemKind, InsertTextFormat } from 'vscode-languageserver-types';
import type { CompletionItem } from 'vscode-languageserver-types';

import { arrayItems, asObject, propValue } from '../semantic/ast-access.js';

/** `State.<key>` completions: every requiresState and transitionsState key of the document. */
export function stateKeyItems(jsonDocument: JSONDocument): CompletionItem[] {
    const keys = collectStateKeys(jsonDocument);
    return [...keys].toSorted().map((key) => ({
        label: key,
        kind: CompletionItemKind.Variable,
        detail: 'State key (declared in this simulation)',
        insertText: key,
        insertTextFormat: InsertTextFormat.PlainText,
    }));
}

/** `Vars.<name>` and `Literals.<name>` completions: the names data declares. */
export function dataNameItems(
    jsonDocument: JSONDocument,
    dataKey: 'literals' | 'variables',
    detail: string,
): CompletionItem[] {
    const names = collectDataNames(jsonDocument, dataKey);
    return [...names].toSorted().map((name) => ({
        label: name,
        kind: CompletionItemKind.Variable,
        detail,
        insertText: name,
        insertTextFormat: InsertTextFormat.PlainText,
    }));
}

function collectStateKeys(jsonDocument: JSONDocument): Set<string> {
    const keys = new Set<string>();
    const root = asObject(jsonDocument.root);
    const data = asObject(propValue(root, 'data'));
    for (const pairNode of arrayItems(data, 'pairs')) {
        const pair = asObject(pairNode);
        const request = asObject(propValue(pair, 'request'));
        const response = asObject(propValue(pair, 'response'));
        addObjectKeys(propValue(request, 'requiresState'), keys);
        addObjectKeys(propValue(response, 'transitionsState'), keys);
    }
    return keys;
}

function collectDataNames(
    jsonDocument: JSONDocument,
    dataKey: 'literals' | 'variables',
): Set<string> {
    const names = new Set<string>();
    const root = asObject(jsonDocument.root);
    const data = asObject(propValue(root, 'data'));
    for (const entry of arrayItems(data, dataKey)) {
        const obj = asObject(entry);
        const nameNode = propValue(obj, 'name');
        if (nameNode?.type === 'string' && nameNode.value.length > 0) {
            names.add(nameNode.value);
        }
    }
    return names;
}

function addObjectKeys(node: ASTNode | undefined, into: Set<string>): void {
    const obj = asObject(node);
    if (!obj) {
        return;
    }
    for (const property of obj.properties) {
        const key = property.keyNode.value;
        if (key.length > 0) {
            into.add(key);
        }
    }
}
