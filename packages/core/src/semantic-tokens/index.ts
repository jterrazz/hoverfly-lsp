/**
 * Barrel for the semantic-tokens layer: the frozen {@link SEMANTIC_TOKEN_TYPES} legend the server
 * advertises verbatim, and {@link getSemanticTokens}, the pure producer that walks templated
 * strings + matcher names into absolute, sorted, single-line tokens for the server to delta-encode.
 */

export {
  SEMANTIC_TOKEN_MODIFIERS,
  SEMANTIC_TOKEN_TYPE_INDEX,
  SEMANTIC_TOKEN_TYPES,
  type SemanticTokenTypeName,
} from "./legend.js";
export { getSemanticTokens, type SemanticToken } from "./producer.js";
