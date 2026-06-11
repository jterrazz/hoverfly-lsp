/**
 * Barrel for the authoritative Hoverfly registry data modules (matchers, helpers, faker).
 * Internal to the registry directory; the semantic/template/completion phases import from
 * here. Wiring into the package root (`src/index.ts`) is owned by the service integrator.
 */

export {
  type ArrayConfigKey,
  MATCHER_PANIC_NOTES,
  MATCHER_SPECS,
  type MatcherSpec,
  type MatcherValueType,
  REGISTRY_MATCHER_NAMES,
  TRANSFORMING_MATCHER_NAMES,
  type WrongTypeBehavior,
} from "./matchers.js";

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
} from "./helpers.js";

export { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from "./faker.js";

export { HTTP_METHODS, URI_SCHEMES, VALUE_DID_YOU_MEAN_MAX_DISTANCE } from "./http.js";

export {
  DID_YOU_MEAN_MAX_DISTANCE,
  SCHEMA_ABSENT_LEGAL_KEYS,
  STRUCTURE_ALLOWED_KEYS,
  type StructureObjectKind,
  USER_KEYED_MAP_PATHS,
} from "./structure.js";
