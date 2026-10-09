// value: a template's tokens, in decoded offsets — the producer maps them onto the document.

import { FAKER_NAMES } from '../registry/faker.js';
import { ALL_HELPERS } from '../registry/templating.data.js';
import type {
    BlockNode,
    Expression,
    MustacheNode,
    PathExpression,
    Statement,
} from '../template/ast.js';
import { parse } from '../template/parser.js';
import type { SemanticTokenTypeName } from './legend.js';

/** One token of a decoded template: its span in decoded offsets and its legend type. */
export type DecodedToken = {
    readonly start: number;
    readonly end: number;
    readonly type: SemanticTokenTypeName;
};

const BLOCK_HELPER_NAMES: ReadonlySet<string> = new Set(
    ALL_HELPERS.filter((helper) => helper.block).map((helper) => helper.name),
);

const ALL_HELPER_NAMES: ReadonlySet<string> = new Set(ALL_HELPERS.map((helper) => helper.name));

const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);

function emitPath(out: DecodedToken[], path: PathExpression, isHelperHead: boolean): void {
    if (isHelperHead) {
        const type: SemanticTokenTypeName = BLOCK_HELPER_NAMES.has(path.original)
            ? 'keyword'
            : 'function';
        out.push({ start: path.start, end: path.end, type });
        return;
    }

    if (path.data || path.thisRef) {
        out.push({ start: path.start, end: path.end, type: 'parameter' });
        return;
    }

    let cursor = path.start;
    for (const [index, segment] of path.original.split('.').entries()) {
        const end = cursor + segment.length;
        const inner = segment.replace(/^\[(?<index>.*)\]$/u, '$<index>');
        out.push({ start: cursor, end, type: segmentType(index, inner) });
        cursor = end + 1;
    }
}

// value: the head of a path is the variable; a later segment is an index when it is an integer,
// bracketed or bare, and a property otherwise.
function segmentType(index: number, inner: string): SemanticTokenTypeName {
    if (index === 0) {
        return 'variable';
    }
    return /^-?\d+$/u.test(inner) ? 'number' : 'property';
}

function emitExpression(out: DecodedToken[], expr: Expression, fakerArg: boolean): void {
    switch (expr.type) {
        case 'StringLiteral': {
            const isFaker = fakerArg && FAKER_NAME_SET.has(expr.value);
            out.push({ start: expr.start, end: expr.end, type: isFaker ? 'enumMember' : 'string' });
            return;
        }
        case 'NumberLiteral': {
            out.push({ start: expr.start, end: expr.end, type: 'number' });
            return;
        }
        case 'BooleanLiteral': {
            out.push({ start: expr.start, end: expr.end, type: 'keyword' });
            return;
        }
        case 'PathExpression': {
            emitPath(out, expr, false);
            return;
        }
        case 'SubExpression': {
            emitCall(out, expr.path, expr.params);
        }
    }
}

function isKnownHelper(path: PathExpression): boolean {
    return ALL_HELPER_NAMES.has(path.original);
}

function emitCall(out: DecodedToken[], path: PathExpression, params: readonly Expression[]): void {
    const helper = isKnownHelper(path);
    emitPath(out, path, helper);
    const fakerCall = path.original === 'faker';
    for (const [index, param] of params.entries()) {
        emitExpression(out, param, fakerCall && index === 0);
    }
}

function emitMustacheDelimiters(out: DecodedToken[], node: MustacheNode): void {
    const openLen = node.escaped ? 2 : 3;
    out.push(
        { start: node.start, end: node.start + openLen, type: 'operator' },
        { start: node.end - openLen, end: node.end, type: 'operator' },
    );
}

function emitBlockDelimiters(out: DecodedToken[], node: BlockNode): void {
    out.push(
        { start: node.openTag.start, end: node.openTag.start + 3, type: 'operator' },
        { start: node.openTag.end - 2, end: node.openTag.end, type: 'operator' },
    );
    if (node.closeTag) {
        out.push(
            { start: node.closeTag.start, end: node.closeTag.start + 3, type: 'operator' },
            { start: node.closeTag.end - 2, end: node.closeTag.end, type: 'operator' },
        );
    }
}

function emitBlock(out: DecodedToken[], block: BlockNode): void {
    emitBlockDelimiters(out, block);
    emitPath(out, block.path, isKnownHelper(block.path));
    for (const param of block.params) {
        emitExpression(out, param, false);
    }
    for (const child of block.program) {
        emitStatement(out, child);
    }
    if (block.inverse !== undefined) {
        for (const child of block.inverse) {
            emitStatement(out, child);
        }
    }
}

// value: content between mustaches carries no token.
function emitStatement(out: DecodedToken[], statement: Statement): void {
    if (statement.type === 'MustacheNode') {
        emitMustacheDelimiters(out, statement);
        emitCall(out, statement.path, statement.params);
    } else if (statement.type === 'BlockNode') {
        emitBlock(out, statement);
    }
}

/** The tokens of a decoded template, in the order its statements are walked. */
export function templateTokens(decoded: string): DecodedToken[] {
    const out: DecodedToken[] = [];
    for (const statement of parse(decoded).ast.body) {
        emitStatement(out, statement);
    }
    return out;
}
