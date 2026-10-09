// outside: Hoverfly discards a base64 decode error (core/models/payload.go), ignores a fixedDelay
// that is not positive (core/hoverfly.go applyResponseDelay), and fails the whole import on a
// logNormalDelay it refuses — HF307 stays a Warning because the catalog pins every severity.

import type { ASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import type { ResponseModel, RuleContext, SemanticRule } from '../rule.js';
import { logNormalDelayViolation } from './log-normal-delay.js';

// value: Hoverfly treats 100–599 as in range, both ends included.
const MIN_HTTP_STATUS = 100;
const MAX_HTTP_STATUS = 599;

// outside: Go's base64.StdEncoding — no URL-safe character, padding required.
const BASE64_STD_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u;

const CONTENT_LENGTH = 'content-length';
const TRANSFER_ENCODING = 'transfer-encoding';

function isTrue(node: ASTNode | undefined): boolean {
    return node?.type === 'boolean' && node.value;
}

function numberValue(node: ASTNode | undefined): number | undefined {
    return node?.type === 'number' ? node.value : undefined;
}

// value: Content-Length counts UTF-8 bytes, never UTF-16 code units.
const UTF8 = new TextEncoder();
function byteLength(text: string): number {
    return UTF8.encode(text).length;
}

function hf301(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const { body, bodyFile } = response;
    if (body.propertyNode && bodyFile.propertyNode && bodyFile.keyNode) {
        return [makeDiagnostic(context.textDocument, 'HF301', bodyFile.keyNode)];
    }
    return [];
}

// value: the warning lands on whichever of the two headers comes second, the one to remove.
function hf302(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const seen = new Set<string>();
    for (const header of response.headers) {
        const name = header.name.toLowerCase();
        if (name === CONTENT_LENGTH || name === TRANSFER_ENCODING) {
            seen.add(name);
            if (seen.size === 2) {
                return [makeDiagnostic(context.textDocument, 'HF302', header.keyNode)];
            }
        }
    }
    return [];
}

function firstHeaderValue(valueNode: ASTNode | undefined): ASTNode | undefined {
    return valueNode?.type === 'array' ? valueNode.items[0] : valueNode;
}

function hf303(response: ResponseModel, context: RuleContext): Diagnostic[] {
    if (
        isTrue(response.templated.valueNode) ||
        isTrue(response.encodedBody.valueNode) ||
        response.bodyFile.propertyNode
    ) {
        return [];
    }
    const bodyNode = response.body.valueNode;
    if (bodyNode?.type !== 'string') {
        return [];
    }

    const header = response.headers.find((h) => h.name.toLowerCase() === CONTENT_LENGTH);
    const valueNode = firstHeaderValue(header?.valueNode);
    if (valueNode?.type !== 'string') {
        return [];
    }
    if (!/^\d+$/u.test(valueNode.value)) {
        return [];
    }

    const declared = Number(valueNode.value);
    const actual = byteLength(bodyNode.value);
    if (declared === actual) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF303', valueNode, { n: declared, m: actual })];
}

function hf304(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const { valueNode } = response.status;
    if (valueNode?.type !== 'number') {
        return [];
    }
    const status = valueNode.value;
    if (status >= MIN_HTTP_STATUS && status <= MAX_HTTP_STATUS) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF304', valueNode, { n: status })];
}

function hf305(response: ResponseModel, context: RuleContext): Diagnostic[] {
    if (!isTrue(response.encodedBody.valueNode)) {
        return [];
    }
    const bodyNode = response.body.valueNode;
    if (bodyNode?.type !== 'string') {
        return [];
    }
    const body = bodyNode.value;
    // value: the empty string is valid base64, decoding to nothing, and the pattern accepts it.
    if (BASE64_STD_PATTERN.test(body)) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF305', bodyNode)];
}

function hf306(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const { valueNode } = response.fixedDelay;
    if (valueNode?.type !== 'number' || valueNode.value >= 0) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF306', valueNode)];
}

function hf307(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const node = response.logNormalDelay.valueNode;
    if (node?.type !== 'object') {
        return [];
    }
    const value = (key: string): ASTNode | undefined =>
        node.properties.find((p) => p.keyNode.value === key)?.valueNode;
    const violation = logNormalDelayViolation({
        max: numberValue(value('max')) ?? 0,
        mean: numberValue(value('mean')) ?? 0,
        median: numberValue(value('median')) ?? 0,
        min: numberValue(value('min')) ?? 0,
    });
    if (violation === undefined) {
        return [];
    }
    return [
        makeDiagnostic(context.textDocument, 'HF307', value(violation.key) ?? node, {
            explain: violation.explain,
        }),
    ];
}

/** The single HF3xx rule: one pass over every pair's response. */
export const hf3xxResponseRule: SemanticRule = {
    run(context): Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const pair of context.model.pairs) {
            const { response } = pair;
            out.push(
                ...hf301(response, context),
                ...hf302(response, context),
                ...hf303(response, context),
                ...hf304(response, context),
                ...hf305(response, context),
                ...hf306(response, context),
                ...hf307(response, context),
            );
        }
        return out;
    },
};

/** All HF3xx rules. The integrator spreads this into `rules/families.ts#ALL_RULES`. */
export const HF3XX_RULES: readonly SemanticRule[] = [hf3xxResponseRule];
