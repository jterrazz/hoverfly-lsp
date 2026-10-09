// invariant: the wire carries indices into SEMANTIC_TOKEN_TYPES, never names, so its order is a
// published contract; only standard LSP types are used, which default themes color with no
// configuration (research/16 §2, §3.1).

/** The ordered token types the server advertises verbatim; an index is a wire token-type id. */
export const SEMANTIC_TOKEN_TYPES = [
    // value: reserved and unused, so the indices after it stay stable.
    'namespace',
    'keyword',
    'function',
    'variable',
    'property',
    'parameter',
    'enumMember',
    'string',
    'number',
    'operator',
] as const;

/** No modifiers in v1. */
export const SEMANTIC_TOKEN_MODIFIERS: readonly string[] = [];

/** A token-type name in the frozen legend. */
export type SemanticTokenTypeName = (typeof SEMANTIC_TOKEN_TYPES)[number];

/** Each token type's index in SEMANTIC_TOKEN_TYPES, typed so a misspelt lookup does not compile. */
export const SEMANTIC_TOKEN_TYPE_INDEX: Readonly<Record<SemanticTokenTypeName, number>> =
    Object.fromEntries(SEMANTIC_TOKEN_TYPES.map((name, index) => [name, index])) as Record<
        SemanticTokenTypeName,
        number
    >;
