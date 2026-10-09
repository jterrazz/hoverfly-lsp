// invariant: the parser reads the decoded string in UTF-16 code units; a decoded unit comes from
// one character, a 2-character escape, a 6-character `\uXXXX` or half of a 12-character surrogate
// pair, and maps back to where its source starts.

/** The result of mapping a raw JSON string token. */
type StringSourceMap = {
    /** The decoded string content (no surrounding quotes, escapes resolved). */
    readonly decoded: string;
    /** The document offset of the source character a decoded offset comes from; decoded.length maps to the closing quote. */
    readonly toDocOffset: (decodedOffset: number) => number;
    /** The decoded offset a document offset lands on, clamped to the content and never inside an escape. */
    readonly toDecodedOffset: (docOffset: number) => number;
};

function isHexDigit(ch: string | undefined): boolean {
    return ch !== undefined && /[0-9A-Fa-f]/u.test(ch);
}

const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
    '"': '"',
    '/': '/',
    '\\': '\\',
    b: '\b',
    f: '\f',
    n: '\n',
    r: '\r',
    t: '\t',
};

/**
 * Build a {@link StringSourceMap} for one raw JSON string token.
 *
 * @param rawToken      the source text of the JSON string AS IT APPEARS in the document — this
 *                      MAY include the surrounding double quotes (`"…"`); if it does they are
 *                      stripped and skipped. An unquoted raw token is also accepted (the mapper
 *                      then treats the whole token as content), which is handy for tests.
 * @param docOffsetOfToken the absolute document offset of the FIRST character of `rawToken`.
 */
function createStringSourceMap(rawToken: string, docOffsetOfToken: number): StringSourceMap {
    const quoted = rawToken.length >= 2 && rawToken.startsWith('"') && rawToken.endsWith('"');
    const contentStart = quoted ? 1 : 0;
    const contentEnd = quoted ? rawToken.length - 1 : rawToken.length;

    let decoded = '';
    const offsets: number[] = [];

    let i = contentStart;
    while (i < contentEnd) {
        const docOffset = docOffsetOfToken + i;
        const ch = rawToken[i];

        if (ch !== '\\') {
            decoded += ch;
            offsets.push(docOffset);
            i += 1;
            continue;
        }

        const next = rawToken[i + 1];

        if (next !== undefined && next in SIMPLE_ESCAPES) {
            decoded += SIMPLE_ESCAPES[next];
            offsets.push(docOffset);
            i += 2;
            continue;
        }

        if (
            next === 'u' &&
            isHexDigit(rawToken[i + 2]) &&
            isHexDigit(rawToken[i + 3]) &&
            isHexDigit(rawToken[i + 4]) &&
            isHexDigit(rawToken[i + 5])
        ) {
            const code = Number.parseInt(rawToken.slice(i + 2, i + 6), 16);
            decoded += String.fromCharCode(code);
            offsets.push(docOffset);
            i += 6;
            continue;
        }

        // invariant: a malformed escape — a lone trailing `\` or `\z` — passes its backslash
        // through, so the mapping stays total.
        decoded += ch;
        offsets.push(docOffset);
        i += 1;
    }

    const endDocOffset = docOffsetOfToken + contentEnd;
    offsets.push(endDocOffset);

    const contentDocStart = docOffsetOfToken + contentStart;

    return {
        decoded,
        toDocOffset: (decodedOffset: number): number => {
            if (decodedOffset <= 0) {
                return offsets[0] ?? endDocOffset;
            }
            if (decodedOffset >= decoded.length) {
                return endDocOffset;
            }
            return offsets[decodedOffset] ?? endDocOffset;
        },
        toDecodedOffset: (docOffset: number): number => {
            if (docOffset <= contentDocStart) {
                return 0;
            }
            if (docOffset >= endDocOffset) {
                return decoded.length;
            }
            // invariant: offsets never decreases; a document offset maps to the count of decoded
            // units whose source starts strictly before it — half-open like toDocOffset, never
            // inside an escape.
            let lo = 0;
            let hi = decoded.length;
            while (lo < hi) {
                const mid = (lo + hi) >> 1;
                const at = offsets[mid] ?? endDocOffset;
                if (at < docOffset) {
                    lo = mid + 1;
                } else {
                    hi = mid;
                }
            }
            return lo;
        },
    };
}

export { createStringSourceMap, type StringSourceMap };
