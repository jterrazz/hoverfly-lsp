export {
    hasHoverflyFilename,
    isHoverflySimulation,
    isHoverflySimulationAst,
} from './fingerprint.js';

export { ALL_RULES } from './semantic/rules/families.js';
export { applyHF102Layer, createRuleContext, runRules, sortByRange } from './semantic/engine.js';
export {
    type CatalogEntry,
    DIAGNOSTIC_CATALOG,
    DIAGNOSTIC_SOURCE,
    type DiagnosticCode,
    formatMessage,
} from './semantic/catalog.js';
export {
    type HoverflyServiceSettings,
    type RuleContext,
    type SemanticRule,
    type SimulationModel,
} from './semantic/rule.js';
export { makeDiagnostic } from './semantic/diagnostics.js';

export { createHoverflyLanguageService, type HoverflyLanguageService } from './service.js';

export { getSemanticTokens, type SemanticToken } from './semantic-tokens/producer.js';
export {
    SEMANTIC_TOKEN_MODIFIERS,
    SEMANTIC_TOKEN_TYPE_INDEX,
    SEMANTIC_TOKEN_TYPES,
    type SemanticTokenTypeName,
} from './semantic-tokens/legend.js';

export { analyze, type AnalyzerContext } from './template/analyzer.js';
export {
    type BlockNode,
    type BooleanLiteral,
    type ContentNode,
    type Expression,
    type MustacheNode,
    type NumberLiteral,
    type PathExpression,
    type Program,
    type Span,
    type Statement,
    type StringLiteral,
    type SubExpression,
    type TemplateNode,
} from './template/ast.js';
export { createStringSourceMap, type StringSourceMap } from './template/source-map.js';
export { hasTemplateSyntax } from './template/detect.js';
export { parse, type ParseResult, type TemplateParseError } from './template/parser.js';

export {
    ALL_HELPERS,
    type HelperArg,
    type HelperArgType,
    type HelperSpec,
    HOVERFLY_HELPERS,
    NOW_FORMAT_NOTES,
    NOW_OFFSET_UNITS,
    RAYMOND_BUILTINS,
    VARIABLE_FUNCTION_NAMES,
} from './registry/templating.js';
export {
    type ArrayConfigKey,
    MATCHER_PANIC_NOTES,
    MATCHER_SPECS,
    type MatcherSpec,
    type MatcherValueType,
    REGISTRY_MATCHER_NAMES,
    TRANSFORMING_MATCHER_NAMES,
    type WrongTypeBehavior,
} from './registry/matchers.js';
export {
    DID_YOU_MEAN_MAX_DISTANCE,
    SCHEMA_ABSENT_LEGAL_KEYS,
    STRUCTURE_ALLOWED_KEYS,
    type StructureObjectKind,
    USER_KEYED_MAP_PATHS,
} from './registry/structure.js';
export { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from './registry/faker.js';

export { hoverflySchema } from './schema/hoverfly.schema.generated.js';
export { HOVERFLY_COMMIT, HOVERFLY_SCHEMA_URL, SCHEMA_FETCHED_AT } from './schema/provenance.js';
