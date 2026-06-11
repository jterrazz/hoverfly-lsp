// Fingerprint (D3): cheap content checks that a JSON file is a Hoverfly simulation.
export {
  hasHoverflyFilename,
  isHoverflySimulation,
  isHoverflySimulationAst,
} from "./fingerprint.js";

// Semantic-analysis framework: catalog, diagnostics, engine, model, rule types.
export {
  ALL_RULES,
  applyHF102Layer,
  type CatalogEntry,
  createRuleContext,
  DIAGNOSTIC_CATALOG,
  DIAGNOSTIC_SOURCE,
  type DiagnosticCode,
  formatMessage,
  type HoverflyServiceSettings,
  makeDiagnostic,
  type RuleContext,
  runRules,
  type SemanticRule,
  type SimulationModel,
  sortByRange,
} from "./semantic/index.js";

// Language service facade backed by vscode-json-languageservice + the bundled schema.
export { createHoverflyLanguageService, type HoverflyLanguageService } from "./service.js";

// Templating layer (parser + analyzer), exposed for downstream completion (Phase 5).
export {
  analyze,
  type AnalyzerContext,
  type BlockNode,
  type BooleanLiteral,
  type ContentNode,
  createStringSourceMap,
  type Expression,
  hasTemplateSyntax,
  type MustacheNode,
  type NumberLiteral,
  parse,
  type ParseResult,
  type PathExpression,
  type Program,
  type Span,
  type Statement,
  type StringLiteral,
  type StringSourceMap,
  type SubExpression,
  type TemplateNode,
  type TemplateParseError,
} from "./template/index.js";

// Authoritative registry data (matchers, templating helpers, faker types, structure matrix).
export {
  ALL_HELPERS,
  type ArrayConfigKey,
  DID_YOU_MEAN_MAX_DISTANCE,
  FAKER_NAMES,
  FAKER_PARAMETERIZED_PANICS,
  GOFAKEIT_VERSION,
  type HelperArg,
  type HelperArgType,
  type HelperSpec,
  HOVERFLY_HELPERS,
  MATCHER_PANIC_NOTES,
  MATCHER_SPECS,
  type MatcherSpec,
  type MatcherValueType,
  NOW_FORMAT_NOTES,
  NOW_OFFSET_UNITS,
  RAYMOND_BUILTINS,
  REGISTRY_MATCHER_NAMES,
  SCHEMA_ABSENT_LEGAL_KEYS,
  STRUCTURE_ALLOWED_KEYS,
  type StructureObjectKind,
  TRANSFORMING_MATCHER_NAMES,
  USER_KEYED_MAP_PATHS,
  VARIABLE_FUNCTION_NAMES,
  type WrongTypeBehavior,
} from "./registry/index.js";

// Bundled enhanced Hoverfly schema + its upstream provenance.
export { hoverflySchema } from "./schema/hoverfly.schema.generated.js";
export { HOVERFLY_COMMIT, HOVERFLY_SCHEMA_URL, SCHEMA_FETCHED_AT } from "./schema/provenance.js";
