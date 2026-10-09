type OpenMustache = {
    readonly contentStart: number;
};

// invariant: quote-aware — a `}}` inside a string literal does not close the mustache.
export function findOpenMustache(decoded: string, cursor: number): OpenMustache | undefined {
    const head = decoded.lastIndexOf('{{', cursor - 2);
    // invariant: lastIndexOf clamps a negative start to 0, so a cursor before or between the braces
    // of a leading `{{` would find it; a mustache is open only once its `{{` ends at the cursor.
    if (head === -1 || head + 2 > cursor) {
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
        if (quote !== undefined) {
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

export function innermostOpenSubexpression(inner: string): InnerSegment {
    let depth = 0;
    let lastOpen = -1;
    let quote: string | undefined;
    for (let i = 0; i < inner.length; i += 1) {
        const ch = inner[i];
        if (quote !== undefined) {
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
        if (quote !== undefined) {
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

export function openStringQuote(
    body: string,
): undefined | { before: string; quote: string; typed: string } {
    let quote: string | undefined;
    let quoteStart = -1;
    for (let i = 0; i < body.length; i += 1) {
        const ch = body[i];
        if (quote !== undefined) {
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

const DEPTH_STEP: ReadonlyMap<string, number> = new Map([
    ['(', 1],
    [')', -1],
]);

function quotedUnit(body: string, index: number, quote: string): { closes: boolean; text: string } {
    const ch = body[index] ?? '';
    return ch === '\\'
        ? { closes: false, text: ch + (body[index + 1] ?? '') }
        : { closes: ch === quote, text: ch };
}

export function splitTopLevelTokens(body: string): string[] {
    const tokens: string[] = [];
    let current = '';
    let depth = 0;
    let quote: string | undefined;
    for (let index = 0; index < body.length;) {
        if (quote !== undefined) {
            const unit = quotedUnit(body, index, quote);
            current += unit.text;
            index += unit.text.length;
            quote = unit.closes ? undefined : quote;
            continue;
        }
        const ch = body[index] ?? '';
        index += 1;
        if (depth === 0 && /\s/u.test(ch)) {
            tokens.push(current);
            current = '';
            continue;
        }
        quote = ch === "'" || ch === '"' ? ch : undefined;
        depth += DEPTH_STEP.get(ch) ?? 0;
        current += ch;
    }
    tokens.push(current);
    return tokens.filter((token) => token.length > 0);
}
