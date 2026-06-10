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
  makeDiagnostic,
  type RuleContext,
  runRules,
  type SemanticRule,
  type SimulationModel,
  sortByRange,
} from "./semantic/index.js";

// Language service facade backed by vscode-json-languageservice + the bundled schema.
export { createHoverflyLanguageService, type HoverflyLanguageService } from "./service.js";

// Authoritative registry data (matchers, templating helpers, faker types).
export {
  ALL_HELPERS,
  type ArrayConfigKey,
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
  TRANSFORMING_MATCHER_NAMES,
  VARIABLE_FUNCTION_NAMES,
  type WrongTypeBehavior,
} from "./registry/index.js";

// Bundled enhanced Hoverfly schema + its upstream provenance.
export { hoverflySchema } from "./schema/hoverfly.schema.generated.js";
export { HOVERFLY_COMMIT, HOVERFLY_SCHEMA_URL, SCHEMA_FETCHED_AT } from "./schema/provenance.js";
