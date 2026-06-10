/**
 * Public surface of the semantic-analysis subsystem. The service composes these into the
 * `doValidation` pipeline; rule-family engineers import the framework pieces from here.
 */

export {
  type CatalogEntry,
  DIAGNOSTIC_CATALOG,
  DIAGNOSTIC_SOURCE,
  type DiagnosticCode,
  formatMessage,
} from "./catalog.js";
export { makeDiagnostic, nodeRange, type RangeTarget, resolveRange } from "./diagnostics.js";
export { applyHF102Layer, createRuleContext, runRules, sortByRange } from "./engine.js";
export { buildSimulationModel } from "./model.js";
export { hf101NotASimulation } from "./rules/hf1xx.js";
export { ALL_RULES } from "./rules/index.js";
export type {
  DelayModel,
  FieldContainer,
  GlobalActionsModel,
  HeaderEntry,
  HoverflyServiceSettings,
  MatcherModel,
  MetaModel,
  PairModel,
  RemovesStateEntry,
  RequestField,
  RequestModel,
  ResponseField,
  ResponseModel,
  RuleContext,
  SemanticRule,
  SimulationModel,
  StateEntry,
} from "./types.js";
