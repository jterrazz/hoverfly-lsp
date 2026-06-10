/**
 * JSON-escape-aware source mapping for the templating layer.
 *
 * A Hoverfly template lives inside a JSON string (e.g. a response `body`). The template parser
 * works on the DECODED string, but diagnostics must point at DOCUMENT offsets — which differ
 * because of the surrounding quotes and any `\n`/`\t`/`\"`/`\\`/`\/`/`\b`/`\f`/`\r`/`\uXXXX`
 * escapes. This module decodes the raw JSON string token and builds a bidirectional map so the
 * HF5xx rules can translate template-parser offsets back to the document.
 *
 * It is the hardest-to-get-right piece for HF5xx ranges (catalog implementation note): a single
 * decoded character can come from a 1-char run, a 2-char escape (`\n`), a 6-char escape
 * (`\uXXXX`), or — for astral/emoji codepoints — a 12-char surrogate pair (`😀`). The
 * JS string the parser sees is measured in UTF-16 code UNITS, so a surrogate pair decodes to two
 * code units, each of which maps back into the relevant half of the source escape.
 *
 * Pure, zero-dependency, zero knowledge of rules or diagnostic codes.
 */

/** The result of mapping a raw JSON string token. */
interface StringSourceMap {
  /** The decoded string content (no surrounding quotes, escapes resolved). */
  readonly decoded: string;
  /**
   * Map a decoded-string offset (0..decoded.length, measured in UTF-16 code units) to the
   * absolute document offset of the source character that produced it. The end offset
   * (`decoded.length`) maps to the document offset just past the last content character (i.e.
   * the position of the closing quote, or end of the raw token when unquoted), so a half-open
   * `[start, end)` decoded span yields a sensible `[start, end)` document span.
   */
  readonly toDocOffset: (decodedOffset: number) => number;
}

/** Hex-digit guard for `\uXXXX` parsing. */
function isHexDigit(ch: string | undefined): boolean {
  return ch !== undefined && /[0-9A-Fa-f]/.test(ch);
}

/** The eight single-character JSON escapes (`\X`), mapped to their decoded character. */
const SIMPLE_ESCAPES: Readonly<Record<string, string>> = {
  '"': '"',
  "/": "/",
  "\\": "\\",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
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
  // Determine the content window: strip a single pair of surrounding double quotes if present.
  const quoted = rawToken.length >= 2 && rawToken.startsWith('"') && rawToken.endsWith('"');
  const contentStart = quoted ? 1 : 0;
  const contentEnd = quoted ? rawToken.length - 1 : rawToken.length;

  let decoded = "";
  // For each decoded UTF-16 code unit, the absolute document offset of its source character.
  const offsets: number[] = [];

  let i = contentStart;
  while (i < contentEnd) {
    const docOffset = docOffsetOfToken + i;
    const ch = rawToken[i];

    if (ch !== "\\") {
      // Identity run: one source char => one decoded code unit.
      decoded += ch;
      offsets.push(docOffset);
      i += 1;
      continue;
    }

    const next = rawToken[i + 1];

    if (next !== undefined && next in SIMPLE_ESCAPES) {
      // Two source chars (`\n`) => one decoded code unit, mapped to the backslash.
      decoded += SIMPLE_ESCAPES[next];
      offsets.push(docOffset);
      i += 2;
      continue;
    }

    if (
      next === "u" &&
      isHexDigit(rawToken[i + 2]) &&
      isHexDigit(rawToken[i + 3]) &&
      isHexDigit(rawToken[i + 4]) &&
      isHexDigit(rawToken[i + 5])
    ) {
      // Six source chars (`\uXXXX`) => one decoded code unit, mapped to the backslash.
      const code = Number.parseInt(rawToken.slice(i + 2, i + 6), 16);
      decoded += String.fromCharCode(code);
      offsets.push(docOffset);
      i += 6;
      continue;
    }

    // Malformed escape (lone trailing `\`, or `\z`): pass the backslash through literally so the
    // Mapping stays total and the parser still sees the rest. One source char => one code unit.
    decoded += ch;
    offsets.push(docOffset);
    i += 1;
  }

  // The end sentinel: decoded.length maps just past the last content character.
  const endDocOffset = docOffsetOfToken + contentEnd;
  offsets.push(endDocOffset);

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
  };
}

export { createStringSourceMap, type StringSourceMap };
