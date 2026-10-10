// invariant: quote-aware — a `}}` inside a quoted string does not close the mustache.
export function findClose(source: string, from: number, marker: string): number {
    let i = from;
    let quote: string | undefined;
    // Stryker disable next-line EqualityOperator: equivalent — the character read past the end is undefined, which opens and closes nothing, and no marker starts there
    while (i < source.length) {
        const ch = source[i];
        if (quote !== undefined) {
            if (ch === quote) {
                quote = undefined;
            }
            i += 1;
            continue;
        }
        if (ch === "'" || ch === '"') {
            quote = ch;
            i += 1;
            continue;
        }
        if (source.startsWith(marker, i)) {
            return i;
        }
        i += 1;
    }
    return -1;
}
export function findMatchingParen(source: string, open: number, to: number): number {
    let depth = 0;
    let quote: string | undefined;
    for (let i = open; i < to; i += 1) {
        const ch = source[i];
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
        } else if (ch === ')') {
            depth -= 1;
            if (depth === 0) {
                return i;
            }
        }
    }
    return -1;
}
export function tokenEnd(source: string, cursor: number, to: number): number {
    let i = cursor;
    while (i < to) {
        const ch = source[i];
        if (
            ch === undefined ||
            /\s/u.test(ch) ||
            ch === ')' ||
            ch === '(' ||
            ch === "'" ||
            ch === '"'
        ) {
            break;
        }
        i += 1;
    }
    return i;
}
export function skipWhitespace(source: string, from: number, to = source.length): number {
    let i = from;
    while (i < to) {
        if (!/\s/u.test(source.charAt(i))) {
            break;
        }
        i += 1;
    }
    return i;
}
