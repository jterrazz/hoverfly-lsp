// invariant: the document is almost always mid-typing (`{{fa`, `{{Request.`), so the classifier
// scans the text around the cursor and reads the parsed AST only for the enclosing block stack.

import type { BlockNode, Statement } from './ast.js';
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

    const closeMatch = /^\s*\/(?<name>[A-Za-z0-9_]*)$/u.exec(inner);
    if (closeMatch) {
        return {
            kind: 'blockClose',
            word: closeMatch.groups?.name ?? '',
            blockStack,
            inEachScope,
        };
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
    const head = tokens[0] ?? '';
    const lastIsPartial = !/\s$/u.test(body) || body.length === 0;
    const current = lastIsPartial ? (tokens.at(-1) ?? '') : '';

    if (tokens.length <= 1 && (lastIsPartial || body.trim().length === 0)) {
        return headContext(current, blockStack, inEachScope, blockOpen);
    }

    if (head === FAKER_HELPER) {
        return { kind: 'fakerArg', word: current, blockStack, inEachScope };
    }
    if (head === NOW_HELPER) {
        return {
            kind: 'nowArg',
            word: current,
            nowSlot: argSlot(tokens, lastIsPartial) === 0 ? 'offset' : 'format',
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
    const segments = token.split('.');
    const root = segments[0] ?? '';
    const word = segments.at(-1) ?? '';
    const parts = segments.slice(1, -1);
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
    const tokens = splitTopLevelTokens(before.replace(/^\s*#/u, ''));
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

type OpenMustache = {
    readonly contentStart: number;
};

// invariant: quote-aware — a `}}` inside a string literal does not close the mustache.
function findOpenMustache(decoded: string, cursor: number): OpenMustache | undefined {
    const head = decoded.lastIndexOf('{{', Math.max(0, cursor - 1));
    if (head === -1) {
        return undefined;
    }
    if (hasCloseBetween(decoded, head + 2, cursor)) {
        return undefined;
    }
    const contentStart = decoded.startsWith('{{{', head) ? head + 3 : head + 2;
    return { contentStart: Math.min(contentStart, cursor) };
}

function hasCloseBetween(decoded: string, from: number, to: number): boolean {
    let quote: string | undefined;
    for (let i = from; i < to - 1; i += 1) {
        const ch = decoded[i];
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
        } else if (ch === '}' && decoded[i + 1] === '}') {
            return true;
        }
    }
    return false;
}

type InnerSegment = {
    readonly text: string;
    readonly atMustacheHead: boolean;
};

function innermostOpenSubexpression(inner: string): InnerSegment {
    let depth = 0;
    let lastOpen = -1;
    let quote: string | undefined;
    for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
        } else if (ch === '(') {
            depth += 1;
            lastOpen = i;
        } else if (ch === ')') {
            depth -= 1;
            lastOpen = lastOpenBefore(inner, i);
        }
    }
    if (depth <= 0 || lastOpen === -1) {
        return { text: inner, atMustacheHead: true };
    }
    return { text: inner.slice(lastOpen + 1), atMustacheHead: false };
}

function lastOpenBefore(inner: string, pos: number): number {
    let depth = 0;
    let quote: string | undefined;
    let last = -1;
    for (let i = 0; i < pos; i += 1) {
        const ch = inner[i];
        if (quote) {
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
        } else if (ch === '(') {
            depth += 1;
            if (depth === 1) {
                last = i;
            }
        } else if (ch === ')') {
            depth -= 1;
        }
    }
    return depth > 0 ? last : -1;
}

function openStringQuote(
    body: string,
): undefined | { before: string; quote: string; typed: string } {
    let quote: string | undefined;
    let quoteStart = -1;
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (quote) {
            if (ch === '\\') {
                i += 1;
                continue;
            }
            if (ch === quote) {
                quote = undefined;
                quoteStart = -1;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            quoteStart = i;
        }
    }
    if (quote === undefined || quoteStart === -1) {
        return undefined;
    }
    return {
        before: body.slice(0, quoteStart),
        quote,
        typed: body.slice(quoteStart + 1),
    };
}

function splitTopLevelTokens(body: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | undefined;
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (quote) {
            current += ch;
            if (ch === '\\') {
                const next = body[i + 1];
                if (next !== undefined) {
                    current += next;
                    i += 1;
                }
                continue;
            }
            if (ch === quote) {
                quote = undefined;
            }
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === '(') {
            depth += 1;
            current += ch;
            continue;
        }
        if (ch === ')') {
            depth -= 1;
            current += ch;
            continue;
        }
        if (depth === 0 && ch !== undefined && /\s/u.test(ch)) {
            if (current.length > 0) {
                tokens.push(current);
                current = '';
            }
            continue;
        }
        current += ch;
    }
    if (current.length > 0) {
        tokens.push(current);
    }
    return tokens;
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
    const root = token.split('.')[0] ?? '';
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
            if (statement.inverse) {
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
