// invariant: the document is almost always mid-typing (`{{fa`, `{{Request.`), so the classifier
// scans the text around the cursor and reads the parsed AST only for the enclosing block stack.

import type { BlockNode, Statement } from './ast.js';
import {
    findOpenMustache,
    innermostOpenSubexpression,
    openStringQuote,
    splitTopLevelTokens,
} from './mustache-scan.js';
import { parse } from './parser.js';

type TemplateContextKind =
    | 'blockClose'
    | 'fakerArg'
    | 'helperArg'
    | 'helperOrPathStart'
    | 'none'
    | 'nowArg'
    | 'pathContinuation';

type NowArgSlot = 'format' | 'offset';

/** The classified context plus the data needed to drive completions. */
type TemplateCompletionContext = {
    readonly kind: TemplateContextKind;
    /** The partial word already typed at the cursor; empty when nothing is typed yet. */
    readonly word: string;
    /** For a path continuation: its root, and the segments typed before the one being completed. */
    readonly path?: { readonly root: string; readonly parts: readonly string[] };
    /** For `nowArg`: which positional argument the cursor occupies. */
    readonly nowSlot?: NowArgSlot;
    /** The enclosing block helpers, outermost first. */
    readonly blockStack: readonly string[];
    /** Whether the cursor is inside at least one `#each`/`#first` block (enables `@index`/`this`). */
    readonly inEachScope: boolean;
};

const FAKER_HELPER = 'faker';
const NOW_HELPER = 'now';

const PATH_ROOTS: ReadonlySet<string> = new Set([
    'Request',
    'State',
    'Vars',
    'Literals',
    'Kvs',
    'InternalVars',
]);

function classifyCompletionContext(decoded: string, cursor: number): TemplateCompletionContext {
    const offset = clamp(cursor, 0, decoded.length);
    const blockStack = enclosingBlockStack(decoded, offset);
    const inEachScope = blockStack.some((name) => name === 'each' || name === 'first');
    const empty: TemplateCompletionContext = { kind: 'none', word: '', blockStack, inEachScope };

    const open = findOpenMustache(decoded, offset);
    if (open === undefined) {
        return empty;
    }

    const inner = decoded.slice(open.contentStart, offset);

    if (/^\s*\/[A-Za-z0-9_]*$/u.test(inner)) {
        return { kind: 'blockClose', word: inner.trimStart().slice(1), blockStack, inEachScope };
    }

    const sub = innermostOpenSubexpression(inner);
    const segment = sub.text;
    const blockOpen = sub.atMustacheHead && /^\s*#/u.test(inner);

    return classifySegment(segment, blockOpen, blockStack, inEachScope);
}

function classifySegment(
    segment: string,
    blockOpen: boolean,
    blockStack: readonly string[],
    inEachScope: boolean,
): TemplateCompletionContext {
    const body = segment.replace(/^\s*#/u, '');

    const openQuote = openStringQuote(body);
    if (openQuote) {
        return stringArgContext(openQuote.before, openQuote.typed, blockStack, inEachScope);
    }

    const tokens = splitTopLevelTokens(body);
    const lastIsPartial = !/\s$/u.test(body);
    // Stryker disable next-line StringLiteral: equivalent — a body with no trailing space splits into one token at least
    const current = lastIsPartial ? (tokens.at(-1) ?? '') : '';

    if (tokens.length <= 1 && (lastIsPartial || body.trim().length === 0)) {
        return headContext(current, blockStack, inEachScope, blockOpen);
    }
    return argumentContext(
        // Stryker disable next-line StringLiteral: equivalent — an argument context has a head token
        { current, head: tokens[0] ?? '', slot: argSlot(tokens, lastIsPartial) },
        blockStack,
        inEachScope,
    );
}

function argumentContext(
    { current, head, slot }: { current: string; head: string; slot: number },
    blockStack: readonly string[],
    inEachScope: boolean,
): TemplateCompletionContext {
    if (head === FAKER_HELPER) {
        return { kind: 'fakerArg', word: current, blockStack, inEachScope };
    }
    if (head === NOW_HELPER) {
        return {
            kind: 'nowArg',
            word: current,
            nowSlot: slot === 0 ? 'offset' : 'format',
            blockStack,
            inEachScope,
        };
    }
    if (isPathContinuation(current)) {
        return pathContext(current, blockStack, inEachScope);
    }
    return { kind: 'helperArg', word: current, blockStack, inEachScope };
}

function headContext(
    current: string,
    blockStack: readonly string[],
    inEachScope: boolean,
    blockOpen: boolean,
): TemplateCompletionContext {
    if (!blockOpen && isPathContinuation(current)) {
        return pathContext(current, blockStack, inEachScope);
    }
    return { kind: 'helperOrPathStart', word: current, blockStack, inEachScope };
}

function pathContext(
    token: string,
    blockStack: readonly string[],
    inEachScope: boolean,
): TemplateCompletionContext {
    if (token.startsWith('@')) {
        return {
            kind: 'pathContinuation',
            word: token.slice(1),
            path: { root: '@', parts: [] },
            blockStack,
            inEachScope,
        };
    }
    // invariant: a path continuation holds a dot, so its root ends at the first one.
    const root = token.slice(0, token.indexOf('.'));
    const word = token.slice(token.lastIndexOf('.') + 1);
    const parts = token.split('.').slice(1, -1);
    return {
        kind: 'pathContinuation',
        word,
        path: { root, parts },
        blockStack,
        inEachScope,
    };
}

function stringArgContext(
    before: string,
    typed: string,
    blockStack: readonly string[],
    inEachScope: boolean,
): TemplateCompletionContext {
    // invariant: the segment's block marker was stripped before the quote was found.
    const tokens = splitTopLevelTokens(before);
    // Stryker disable next-line StringLiteral: equivalent — with no head token, neither faker nor now is named
    const head = tokens[0] ?? '';
    if (head === FAKER_HELPER) {
        return { kind: 'fakerArg', word: typed, blockStack, inEachScope };
    }
    if (head === NOW_HELPER) {
        const priorArgs = tokens.length - 1;
        return {
            kind: 'nowArg',
            word: typed,
            nowSlot: priorArgs <= 0 ? 'offset' : 'format',
            blockStack,
            inEachScope,
        };
    }
    return { kind: 'helperArg', word: typed, blockStack, inEachScope };
}

function argSlot(tokens: readonly string[], lastIsPartial: boolean): number {
    const argCount = tokens.length - 1;
    return lastIsPartial ? Math.max(0, argCount - 1) : argCount;
}

function isPathContinuation(token: string): boolean {
    if (token.startsWith('@')) {
        return true;
    }
    if (!token.includes('.')) {
        return false;
    }
    const root = token.slice(0, token.indexOf('.'));
    return PATH_ROOTS.has(root) || root === 'this';
}

// invariant: the parser extends an unclosed block's end to the end of the text, so a still-open
// `{{#each}}…{{` encloses the cursor.
function enclosingBlockStack(decoded: string, offset: number): string[] {
    const { ast } = parse(decoded);
    const stack: string[] = [];
    collectEnclosing(ast.body, offset, stack);
    return stack;
}

function collectEnclosing(statements: readonly Statement[], offset: number, out: string[]): void {
    for (const statement of statements) {
        if (statement.type !== 'BlockNode') {
            continue;
        }
        if (isInsideBlockBody(statement, offset)) {
            out.push(statement.path.original);
            collectEnclosing(statement.program, offset, out);
            if (statement.inverse !== undefined) {
                collectEnclosing(statement.inverse, offset, out);
            }
        }
    }
}

function isInsideBlockBody(block: BlockNode, offset: number): boolean {
    const bodyStart = block.openTag.end;
    const bodyEnd = block.closeTag ? block.closeTag.start : block.end;
    return offset >= bodyStart && offset <= bodyEnd;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export { classifyCompletionContext, type TemplateCompletionContext };
