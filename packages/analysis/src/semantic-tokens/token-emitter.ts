import type { TextDocument } from 'vscode-languageserver-textdocument';

import type { StringSourceMap } from '../template/source-map.js';
import { SEMANTIC_TOKEN_TYPES } from './legend.js';
import type { SemanticTokenTypeName } from './legend.js';

/** One absolute, single-line token; its type an index into SEMANTIC_TOKEN_TYPES, its modifiers always 0. */
export type SemanticToken = {
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

export class TokenEmitter {
    private readonly tokens: SemanticToken[] = [];
    private readonly document: TextDocument;

    constructor(document: TextDocument) {
        this.document = document;
    }

    emitDocSpan(startOffset: number, endOffset: number, type: SemanticTokenTypeName): void {
        if (endOffset <= startOffset) {
            return;
        }
        const tokenType = SEMANTIC_TOKEN_TYPES.indexOf(type);
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
