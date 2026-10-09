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

// invariant: a malformed escape — a lone trailing `\` or `\z` — passes its backslash through, so
// the mapping stays total.
function unitAt(raw: string, index: number): { text: string; width: number } {
    const ch = raw.charAt(index);
    const next = raw.charAt(index + 1);
    const simple = ch === '\\' ? SIMPLE_ESCAPES[next] : undefined;
    if (simple !== undefined) {
        return { text: simple, width: 2 };
    }
    // value: the slice holds four characters at most, so four hex digits are the whole of it.
    const hex = raw.slice(index + 2, index + 6);
    if (ch === '\\' && next === 'u' && /[0-9A-Fa-f]{4}/u.test(hex)) {
        return { text: String.fromCodePoint(Number.parseInt(hex, 16)), width: 6 };
    }
    return { text: ch, width: 1 };
}

type Mapping = {
    readonly decoded: string;
    readonly endDocOffset: number;
    readonly offsets: readonly number[];
};

function toDocOffset({ decoded, endDocOffset, offsets }: Mapping, decodedOffset: number): number {
    return offsets[Math.min(Math.max(decodedOffset, 0), decoded.length)] ?? endDocOffset;
}

// invariant: offsets never decreases; a document offset maps to the count of decoded units whose
// source starts strictly before it — half-open like toDocOffset, never inside an escape, and
// clamped to the content by the search itself.
function toDecodedOffset({ decoded, endDocOffset, offsets }: Mapping, docOffset: number): number {
    let lo = 0;
    let hi = decoded.length;
    while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if ((offsets[mid] ?? endDocOffset) < docOffset) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return lo;
}

/**
 * Maps one raw JSON string token, its quotes included or not, placed at a document offset.
 * @param rawToken the token as the document holds it; surrounding double quotes are skipped
 * @param docOffsetOfToken the document offset of the token's first character
 */
function createStringSourceMap(rawToken: string, docOffsetOfToken: number): StringSourceMap {
    const quoted = rawToken.length >= 2 && rawToken.startsWith('"') && rawToken.endsWith('"');
    const contentStart = quoted ? 1 : 0;
    const contentEnd = quoted ? rawToken.length - 1 : rawToken.length;
    let decoded = '';
    const offsets: number[] = [];
    for (let index = contentStart; index < contentEnd;) {
        const { text, width } = unitAt(rawToken, index);
        decoded += text;
        offsets.push(docOffsetOfToken + index);
        index += width;
    }
    const mapping: Mapping = { decoded, endDocOffset: docOffsetOfToken + contentEnd, offsets };
    return {
        decoded,
        toDecodedOffset: (docOffset) => toDecodedOffset(mapping, docOffset),
        toDocOffset: (decodedOffset) => toDocOffset(mapping, decodedOffset),
    };
}

export { createStringSourceMap, type StringSourceMap };
