// invariant: template tokens map each decoded offset back to the document through the escape-aware
// source map the HF5xx diagnostics use, so an escape before `{{` still lands each token on its
// characters; the server delta-encodes the sorted, single-line list.

import type { ASTNode, JSONDocument } from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';

import { hasHoverflyFilename, isHoverflySimulationAst } from '../fingerprint.js';
import { FAKER_NAMES } from '../registry/faker.js';
import { MATCHER_SPECS } from '../registry/matchers.js';
import { ALL_HELPERS } from '../registry/templating.js';
import { buildSimulationModel } from '../semantic/model.js';
import type { MatcherModel, SimulationModel } from '../semantic/rule.js';
import type {
    BlockNode,
    Expression,
    MustacheNode,
    PathExpression,
    Statement,
    SubExpression,
} from '../template/ast.js';
import { hasTemplateSyntax } from '../template/detect.js';
import { parse } from '../template/parser.js';
import { createStringSourceMap } from '../template/source-map.js';
import type { StringSourceMap } from '../template/source-map.js';
import { SEMANTIC_TOKEN_TYPE_INDEX } from './legend.js';
import type { SemanticTokenTypeName } from './legend.js';

/** One absolute, single-line token; its type an index into SEMANTIC_TOKEN_TYPES, its modifiers always 0. */
type SemanticToken = {
    /** 0-based line. */
    readonly line: number;
    /** 0-based start character (UTF-16 code units). */
    readonly startChar: number;
    /** Token length in UTF-16 code units (never spans a line). */
    readonly length: number;
    /** Index into `SEMANTIC_TOKEN_TYPES`. */
    readonly tokenType: number;
    /** Modifier bitset; `0` in v1. */
    readonly tokenModifiers: number;
};

const BLOCK_HELPER_NAMES: ReadonlySet<string> = new Set(
    ALL_HELPERS.filter((helper) => helper.block).map((helper) => helper.name),
);

const ALL_HELPER_NAMES: ReadonlySet<string> = new Set(ALL_HELPERS.map((helper) => helper.name));

const FAKER_NAME_SET: ReadonlySet<string> = new Set(FAKER_NAMES);

const MATCHER_NAME_SET: ReadonlySet<string> = new Set(MATCHER_SPECS.map((spec) => spec.name));

class TokenEmitter {
    private readonly tokens: SemanticToken[] = [];
    private readonly document: TextDocument;

    constructor(document: TextDocument) {
        this.document = document;
    }

    emitDocSpan(startOffset: number, endOffset: number, type: SemanticTokenTypeName): void {
        if (endOffset <= startOffset) {
            return;
        }
        const tokenType = SEMANTIC_TOKEN_TYPE_INDEX[type];
        let cursor = startOffset;
        while (cursor < endOffset) {
            const start = this.document.positionAt(cursor);
            const lineEndOffset = this.document.offsetAt({ line: start.line + 1, character: 0 });
            const segmentEnd = Math.min(endOffset, lineEndOffset);
            const end = this.document.positionAt(segmentEnd);
            const length =
                end.line === start.line
                    ? end.character - start.character
                    : this.document.offsetAt({ line: start.line + 1, character: 0 }) - cursor;
            if (length > 0) {
                this.tokens.push({
                    line: start.line,
                    startChar: start.character,
                    length,
                    tokenType,
                    tokenModifiers: 0,
                });
            }
            cursor = segmentEnd;
        }
    }

    emitDecoded(
        sourceMap: StringSourceMap,
        start: number,
        end: number,
        type: SemanticTokenTypeName,
    ): void {
        this.emitDocSpan(sourceMap.toDocOffset(start), sourceMap.toDocOffset(end), type);
    }

    result(): SemanticToken[] {
        return this.tokens.toSorted((a, b) => a.line - b.line || a.startChar - b.startChar);
    }
}

function emitPath(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    path: PathExpression,
    isHelperHead: boolean,
): void {
    if (isHelperHead) {
        const type: SemanticTokenTypeName = BLOCK_HELPER_NAMES.has(path.original.replace(/^#/u, ''))
            ? 'keyword'
            : 'function';
        emitter.emitDecoded(sourceMap, path.start, path.end, type);
        return;
    }

    if (path.data || path.thisRef) {
        emitter.emitDecoded(sourceMap, path.start, path.end, 'parameter');
        return;
    }

    const segments = splitPathSegments(path.original);
    let cursor = path.start;
    for (let i = 0; i < segments.length; i += 1) {
        const segment = segments[i];
        if (segment === undefined) {
            continue;
        }
        const segStart = cursor;
        const segEnd = cursor + segment.length;
        const inner = segment.replace(/^\[(?<index>.*)\]$/u, '$<index>');
        const isBracketIndex = inner !== segment;
        const isNumeric = /^-?\d+$/u.test(inner);

        let type: SemanticTokenTypeName;
        if (i === 0) {
            type = 'variable';
        } else if (isBracketIndex && isNumeric) {
            type = 'number';
        } else if (isNumeric) {
            type = 'number';
        } else {
            type = 'property';
        }
        emitter.emitDecoded(sourceMap, segStart, segEnd, type);
        cursor = segEnd + 1;
    }
}

function splitPathSegments(original: string): string[] {
    return original.split('.');
}

function emitExpression(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    expr: Expression,
    fakerArg: boolean,
): void {
    switch (expr.type) {
        case 'StringLiteral': {
            const isFaker = fakerArg && FAKER_NAME_SET.has(expr.value);
            emitter.emitDecoded(sourceMap, expr.start, expr.end, isFaker ? 'enumMember' : 'string');
            return;
        }
        case 'NumberLiteral': {
            emitter.emitDecoded(sourceMap, expr.start, expr.end, 'number');
            return;
        }
        case 'BooleanLiteral': {
            emitter.emitDecoded(sourceMap, expr.start, expr.end, 'keyword');
            return;
        }
        case 'PathExpression': {
            emitPath(emitter, sourceMap, expr, false);
            return;
        }
        case 'SubExpression': {
            emitSubExpression(emitter, sourceMap, expr);
            return;
        }
        default: {
            return;
        }
    }
}

function helperHeadName(path: PathExpression): string {
    return path.parts[0] ?? path.original.replace(/^#/u, '');
}

function isKnownHelper(path: PathExpression): boolean {
    return ALL_HELPER_NAMES.has(helperHeadName(path));
}

function emitCall(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    path: PathExpression,
    params: readonly Expression[],
): void {
    const helper = isKnownHelper(path);
    emitPath(emitter, sourceMap, path, helper);
    const fakerCall = helperHeadName(path) === 'faker';
    params.forEach((param, index) => {
        emitExpression(emitter, sourceMap, param, fakerCall && index === 0);
    });
}

function emitSubExpression(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    expr: SubExpression,
): void {
    emitCall(emitter, sourceMap, expr.path, expr.params);
}

function emitMustacheDelimiters(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    node: MustacheNode,
): void {
    const openLen = node.escaped ? 2 : 3;
    emitter.emitDecoded(sourceMap, node.start, node.start + openLen, 'operator');
    emitter.emitDecoded(sourceMap, node.end - openLen, node.end, 'operator');
}

function emitBlockDelimiters(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    node: BlockNode,
): void {
    emitter.emitDecoded(sourceMap, node.openTag.start, node.openTag.start + 3, 'operator');
    emitter.emitDecoded(sourceMap, node.openTag.end - 2, node.openTag.end, 'operator');
    if (node.closeTag) {
        emitter.emitDecoded(sourceMap, node.closeTag.start, node.closeTag.start + 3, 'operator');
        emitter.emitDecoded(sourceMap, node.closeTag.end - 2, node.closeTag.end, 'operator');
    }
}

function emitStatement(
    emitter: TokenEmitter,
    sourceMap: StringSourceMap,
    statement: Statement,
): void {
    switch (statement.type) {
        case 'MustacheNode': {
            emitMustacheDelimiters(emitter, sourceMap, statement);
            emitCall(emitter, sourceMap, statement.path, statement.params);
            return;
        }
        case 'BlockNode': {
            emitBlockDelimiters(emitter, sourceMap, statement);
            emitPath(emitter, sourceMap, statement.path, isKnownHelper(statement.path));
            for (const param of statement.params) {
                emitExpression(emitter, sourceMap, param, false);
            }
            for (const child of statement.program) {
                emitStatement(emitter, sourceMap, child);
            }
            for (const child of statement.inverse ?? []) {
                emitStatement(emitter, sourceMap, child);
            }
            return;
        }
        case 'ContentNode': {
            return;
        }
        default: {
            return;
        }
    }
}

function emitTemplateString(emitter: TokenEmitter, document: TextDocument, node: ASTNode): void {
    if (node.type !== 'string' || !hasTemplateSyntax(node.value)) {
        return;
    }
    const rawToken = document.getText().slice(node.offset, node.offset + node.length);
    const sourceMap = createStringSourceMap(rawToken, node.offset);
    const { ast } = parse(sourceMap.decoded);
    for (const statement of ast.body) {
        emitStatement(emitter, sourceMap, statement);
    }
}

function isTemplated(node: ASTNode | undefined): boolean {
    return node?.type === 'boolean' && node.value;
}

function emitTemplatableValue(
    emitter: TokenEmitter,
    document: TextDocument,
    node: ASTNode | undefined,
): void {
    if (!node) {
        return;
    }
    if (node.type === 'string') {
        emitTemplateString(emitter, document, node);
        return;
    }
    if (node.type === 'array') {
        for (const item of node.items) {
            emitTemplateString(emitter, document, item);
        }
    }
}

function emitMatcherName(emitter: TokenEmitter, matcher: MatcherModel): void {
    const node = matcher.matcherNode;
    if (node?.type !== 'string' || matcher.matcherName === undefined) {
        return;
    }
    if (!MATCHER_NAME_SET.has(matcher.matcherName)) {
        return;
    }
    emitter.emitDocSpan(node.offset + 1, node.offset + node.length - 1, 'enumMember');
}

function emitModel(emitter: TokenEmitter, document: TextDocument, model: SimulationModel): void {
    for (const pair of model.pairs) {
        for (const fieldEntry of pair.request.fields) {
            for (const matcher of fieldEntry.matchers) {
                emitMatcherName(emitter, matcher);
            }
        }

        const { response } = pair;
        const templated = isTemplated(response.templated.valueNode);
        const bodyNode = response.body.valueNode;

        if (bodyNode) {
            emitTemplatableValue(emitter, document, bodyNode);
        }

        if (templated) {
            for (const header of response.headers) {
                emitTemplatableValue(emitter, document, header.valueNode);
            }
        }
    }
}

/** The absolute, sorted tokens of a document — none unless it is a simulation or named for Hoverfly; never throws. */
function getSemanticTokens(
    document: TextDocument,
    jsonDocument: JSONDocument,
    model?: SimulationModel,
): SemanticToken[] {
    if (!isHoverflySimulationAst(jsonDocument.root) && !hasHoverflyFilename(document.uri)) {
        return [];
    }

    const emitter = new TokenEmitter(document);
    const resolved = model ?? buildSimulationModel(jsonDocument);
    emitModel(emitter, document, resolved);
    return emitter.result();
}

export { getSemanticTokens, type SemanticToken };
