// outside: transcribed from research/13 §1, verified against Hoverfly's Go view structs
// (core/handlers/v2/simulation_views{,_v5}.go) and a v1.12.8 run — additionalProperties:false holds
// at the root alone, so no schema catches a typo deeper down: Go silently drops it, and binds the
// other keys case-insensitively. The user-keyed maps are no object kind here (report 13 §6).

/** The closed object kinds whose keys come from a fixed Go struct; the root is none — its unknown keys are already HF102. */
export type StructureObjectKind =
    | 'data'
    | 'delaysItem'
    | 'delaysLogNormalItem'
    | 'fieldMatcher'
    | 'globalActions'
    | 'literalsItem'
    | 'logNormalDelay'
    | 'meta'
    | 'pair'
    | 'request'
    | 'response'
    | 'variablesItem';

/** Each closed kind's allowed canonical keys (the Go json tags, report 13 §1), compared case-folded. */
export const STRUCTURE_ALLOWED_KEYS: Readonly<Record<StructureObjectKind, readonly string[]>> = {
    /** DataViewV5 (report 13 §1.2). */
    data: ['pairs', 'globalActions', 'literals', 'variables'],

    /** RequestMatcherResponsePairViewV5 (report 13 §1.3); request and response are schema-required. */
    pair: ['request', 'response', 'labels'],

    /** RequestMatcherViewV5 (report 13 §1.4); method is in the Go struct, absent from the official schema (D5), and imports clean. */
    request: [
        'path',
        'method',
        'destination',
        'scheme',
        'body',
        'headers',
        'query',
        'requiresState',
    ],

    /** MatcherViewV5 (report 13 §1.5); doMatch must be an object. */
    fieldMatcher: ['matcher', 'value', 'config', 'doMatch'],

    /** ResponseDetailsViewV5 (report 13 §1.9). */
    response: [
        'status',
        'body',
        'bodyFile',
        'encodedBody',
        'headers',
        'templated',
        'transitionsState',
        'removesState',
        'fixedDelay',
        'logNormalDelay',
        'postServeAction',
    ],

    /** LogNormalDelayOptions at the response level (report 13 §1.11): no httpMethod, no urlPattern. */
    logNormalDelay: ['min', 'max', 'mean', 'median'],

    /** GlobalActionsView (report 13 §1.12). */
    globalActions: ['delays', 'delaysLogNormal'],

    /** ResponseDelayView (report 13 §1.13); its httpMethod is never validated. */
    delaysItem: ['delay', 'httpMethod', 'urlPattern'],

    /** ResponseDelayLogNormalView (report 13 §1.14). */
    delaysLogNormalItem: ['min', 'max', 'mean', 'median', 'httpMethod', 'urlPattern'],

    /** GlobalLiteralViewV5 (report 13 §1.15). */
    literalsItem: ['name', 'value'],

    /** GlobalVariableViewV5 (report 13 §1.16). */
    variablesItem: ['name', 'function', 'arguments'],

    /** MetaView (report 13 §1.17); hoverflyVersion and timeExported are never format-validated. */
    meta: ['schemaVersion', 'hoverflyVersion', 'timeExported'],
};

/** The user-keyed maps the unknown-key rule never judges (report 13 §6 guard a) — documentation, read by no rule. */
export const USER_KEYED_MAP_PATHS: readonly string[] = [
    'request.headers',
    'request.query',
    'response.headers',
    'requiresState',
    'transitionsState',
];

/** Keys legal though the official schema omits them: request.method (D5, report 13 §6 guard b). */
export const SCHEMA_ABSENT_LEGAL_KEYS: Readonly<Record<string, readonly string[]>> = {
    request: ['method'],
};

/** The HF603 suggestion distance (report 13 §6); a key that case-folds to an allowed one is HF604, never a candidate. */
export const DID_YOU_MEAN_MAX_DISTANCE = 2;
