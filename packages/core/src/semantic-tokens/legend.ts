/**
 * The frozen LSP semantic-tokens legend (research/16 §3.1).
 *
 * The legend is an ORDERED array: the wire protocol carries integer INDICES into
 * {@link SEMANTIC_TOKEN_TYPES}, never names, so the server must advertise this exact array in this
 * exact order and the producer must emit the matching indices. Changing the order is a breaking
 * change to the wire contract.
 *
 * Only STANDARD LSP token types are used (research/16 §2): these are the types that default themes
 * across VS Code, Zed, IntelliJ/LSP4IJ and Neovim color WITHOUT any per-user theme configuration.
 * No custom types and no modifiers in v1 (`SEMANTIC_TOKEN_MODIFIERS` is empty; every token's
 * modifier bitset is `0`).
 *
 * Pure data — zero knowledge of the producer, the AST, or LSP transport.
 */

/**
 * The ordered semantic token types the server advertises verbatim. Index = wire token-type id.
 * See research/16 §3.2 for the construct→type mapping each entry serves.
 */
export const SEMANTIC_TOKEN_TYPES = [
  "namespace", // 0 — reserved (unused in v1; keeps indices stable for a future refinement)
  "keyword", // 1 — block-helper keywords (if/unless/each/with/equal/first)
  "function", // 2 — inline helper / subexpression-head calls (now, faker, replace, …)
  "variable", // 3 — path roots (Request, State, Vars, Literals, Journal, …)
  "property", // 4 — subsequent path segments (.Path, .Method, field names)
  "parameter", // 5 — @index/@first/@last/@key and `this`
  "enumMember", // 6 — known faker types and matcher names (closed enums)
  "string", // 7 — string-literal arguments
  "number", // 8 — numeric literals and bracket indices ([1])
  "operator", // 9 — mustache delimiters {{ }} {{{ }}} and # / block markers
] as const;

/** No modifiers in v1. */
export const SEMANTIC_TOKEN_MODIFIERS: readonly string[] = [];

/** A token-type name in the frozen legend. */
export type SemanticTokenTypeName = (typeof SEMANTIC_TOKEN_TYPES)[number];

/**
 * Token-type name → its index in {@link SEMANTIC_TOKEN_TYPES}. Typed so a typo in a producer
 * lookup is a compile error rather than a wrong color.
 */
export const SEMANTIC_TOKEN_TYPE_INDEX: Readonly<Record<SemanticTokenTypeName, number>> =
  Object.fromEntries(SEMANTIC_TOKEN_TYPES.map((name, index) => [name, index])) as Record<
    SemanticTokenTypeName,
    number
  >;
