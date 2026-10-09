import type { ASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { asObject } from '../ast-access.js';
import { makeDiagnostic } from '../diagnostics.js';
import type { RuleContext } from '../rule.js';

/** HF404 on every requiresState or transitionsState value that is no string. */
export function checkStateValues(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    for (const property of object.properties) {
        const value = property.valueNode;
        if (value && value.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF404', value));
        }
    }
}

/** HF308 on every response header that is no array of strings. */
export function checkResponseHeaders(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    const object = asObject(node);
    if (!object) {
        return;
    }
    for (const property of object.properties) {
        const value = property.valueNode;
        if (!value) {
            continue;
        }
        if (value.type !== 'array' || value.items.some((item) => item.type !== 'string')) {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF308', value));
        }
    }
}

/** HF405 on every removesState entry that is no string. */
export function checkRemovesState(
    context: RuleContext,
    node: ASTNode | undefined,
    diagnostics: Diagnostic[],
): void {
    if (node?.type !== 'array') {
        return;
    }
    for (const item of node.items) {
        if (item.type !== 'string') {
            diagnostics.push(makeDiagnostic(context.textDocument, 'HF405', item));
        }
    }
}
