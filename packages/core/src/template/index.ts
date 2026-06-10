/**
 * Barrel for the templating layer: the pure parser sublayer (AST, parser, JSON-escape source
 * map, syntax detection) plus the {@link analyze} semantic pass that turns a parsed template
 * into HF5xx {@link TemplateFinding}s. The parser sublayer has ZERO knowledge of diagnostic
 * codes; the analyzer is the only file that knows the HF5xx kinds (its findings still map to
 * document positions and catalog wording inside the HF5xx semantic rule). Internal to
 * `packages/core`; wiring into the service is owned downstream.
 */

export { analyze, type AnalyzerContext } from "./analyzer.js";
export type {
  BlockNode,
  BooleanLiteral,
  ContentNode,
  Expression,
  MustacheNode,
  NumberLiteral,
  PathExpression,
  Program,
  Span,
  Statement,
  StringLiteral,
  SubExpression,
  TemplateNode,
} from "./ast.js";
export { hasTemplateSyntax } from "./detect.js";
export { parse, type ParseResult, type TemplateParseError } from "./parser.js";
export { createStringSourceMap, type StringSourceMap } from "./source-map.js";
