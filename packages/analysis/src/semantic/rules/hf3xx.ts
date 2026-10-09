// outside: Hoverfly discards a base64 decode error (core/models/payload.go), ignores a fixedDelay
// that is not positive (core/hoverfly.go applyResponseDelay), and fails the whole import on a
// logNormalDelay ValidateLogNormalDelayOptions refuses — HF307 stays a Warning because the catalog
// pins every severity.

import type { ASTNode, ObjectASTNode } from 'vscode-json-languageservice';
import type { Diagnostic } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import type { ResponseModel, RuleContext, SemanticRule } from '../rule.js';

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

function hf302(response: ResponseModel, context: RuleContext): Diagnostic[] {
    let contentLength: ASTNode | undefined;
    let transferEncoding: ASTNode | undefined;
    for (const header of response.headers) {
        const name = header.name.toLowerCase();
        if (name === CONTENT_LENGTH) {
            contentLength ??= header.keyNode;
        } else if (name === TRANSFER_ENCODING) {
            transferEncoding ??= header.keyNode;
        }
    }
    if (!contentLength || !transferEncoding) {
        return [];
    }
    const second =
        contentLength.offset > transferEncoding.offset ? contentLength : transferEncoding;
    return [makeDiagnostic(context.textDocument, 'HF302', second)];
}

function firstHeaderString(valueNode: ASTNode | undefined): ASTNode | undefined {
    if (valueNode?.type === 'string') {
        return valueNode;
    }
    if (valueNode?.type === 'array') {
        const first = valueNode.items[0];
        return first?.type === 'string' ? first : undefined;
    }
    return undefined;
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
    const valueNode = firstHeaderString(header?.valueNode);
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
    const status = numberValue(valueNode);
    if (valueNode === undefined || status === undefined) {
        return [];
    }
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
    // value: the empty string is valid base64, decoding to nothing.
    if (body.length === 0 || BASE64_STD_PATTERN.test(body)) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF305', bodyNode)];
}

function hf306(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const { valueNode } = response.fixedDelay;
    const delay = numberValue(valueNode);
    if (valueNode === undefined || delay === undefined || delay >= 0) {
        return [];
    }
    return [makeDiagnostic(context.textDocument, 'HF306', valueNode)];
}

type LogNormalFields = {
    readonly object: ObjectASTNode;
    readonly min: number | undefined;
    readonly max: number | undefined;
    readonly mean: number | undefined;
    readonly median: number | undefined;
    readonly node: (key: string) => ASTNode | undefined;
};

type Delay = {
    readonly max: number;
    readonly mean: number;
    readonly median: number;
    readonly min: number;
};

const NEGATIVE = 'logNormalDelay min and max cannot be less than 0';
const NOT_POSITIVE = 'logNormalDelay mean and median cannot be less than or equal to 0';

// outside: Go's ValidateLogNormalDelayOptions (core/delay/log_normal_generator.go), in its order —
// the first violation is the one reported; an absent field is Go's int zero value, 0.
const LOG_NORMAL_CONSTRAINTS: readonly {
    readonly broken: (delay: Delay) => boolean;
    readonly explain: string;
    readonly key: keyof Delay;
}[] = [
    { broken: ({ max }) => max < 0, explain: NEGATIVE, key: 'max' },
    { broken: ({ min }) => min < 0, explain: NEGATIVE, key: 'min' },
    { broken: ({ mean }) => mean <= 0, explain: NOT_POSITIVE, key: 'mean' },
    { broken: ({ median }) => median <= 0, explain: NOT_POSITIVE, key: 'median' },
    {
        broken: ({ max, min }) => max !== 0 && max < min,
        explain: 'logNormalDelay min must be less than max',
        key: 'max',
    },
    {
        broken: ({ max, mean }) => max !== 0 && mean > max,
        explain: 'logNormalDelay mean cannot be greater than max',
        key: 'mean',
    },
    {
        broken: ({ max, median }) => max !== 0 && median > max,
        explain: 'logNormalDelay median cannot be greater than max',
        key: 'median',
    },
    {
        broken: ({ mean, min }) => min !== 0 && mean < min,
        explain: 'logNormalDelay mean cannot be less than min',
        key: 'mean',
    },
    {
        broken: ({ median, min }) => min !== 0 && median < min,
        explain: 'logNormalDelay median cannot be less than min',
        key: 'median',
    },
    {
        broken: ({ mean, median }) => median > mean,
        explain: 'logNormalDelay mean cannot be less than median',
        key: 'median',
    },
];

function logNormalDelayViolation(
    fields: LogNormalFields,
): undefined | { node: ASTNode; explain: string } {
    const delay: Delay = {
        max: fields.max ?? 0,
        mean: fields.mean ?? 0,
        median: fields.median ?? 0,
        min: fields.min ?? 0,
    };
    const violated = LOG_NORMAL_CONSTRAINTS.find(({ broken }) => broken(delay));
    return violated === undefined
        ? undefined
        : { explain: violated.explain, node: fields.node(violated.key) ?? fields.object };
}

function readLogNormal(response: ResponseModel): LogNormalFields | undefined {
    const node = response.logNormalDelay.valueNode;
    if (node?.type !== 'object') {
        return undefined;
    }
    const value = (key: string): ASTNode | undefined =>
        node.properties.find((p) => p.keyNode.value === key)?.valueNode;
    return {
        object: node,
        min: numberValue(value('min')),
        max: numberValue(value('max')),
        mean: numberValue(value('mean')),
        median: numberValue(value('median')),
        node: value,
    };
}

function hf307(response: ResponseModel, context: RuleContext): Diagnostic[] {
    const fields = readLogNormal(response);
    if (!fields) {
        return [];
    }
    const violation = logNormalDelayViolation(fields);
    if (!violation) {
        return [];
    }
    return [
        makeDiagnostic(context.textDocument, 'HF307', violation.node, {
            explain: violation.explain,
        }),
    ];
}

/** The single HF3xx rule: one pass over every pair's response. */
export const hf3xxResponseRule: SemanticRule = {
    codes: ['HF301', 'HF302', 'HF303', 'HF304', 'HF305', 'HF306', 'HF307'],
    run(context): Diagnostic[] {
        const out: Diagnostic[] = [];
        for (const pair of context.model.pairs) {
            const { response } = pair;
            if (!response.node) {
                continue;
            }
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
