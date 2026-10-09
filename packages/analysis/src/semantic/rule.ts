// invariant: the model is built once per validation pass and holds the ASTNode of every node a rule
// points at; any field may be undefined, the document being possibly malformed.

import type { ASTNode, JSONDocument, ObjectASTNode } from 'vscode-json-languageservice';
import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic } from 'vscode-languageserver-types';

/** A rule family: the pass that emits its HFxxx codes. */
export type SemanticRule = {
    /** Produce diagnostics for one document. MUST NOT throw on malformed input. */
    run: (context: RuleContext) => Diagnostic[];
};

/** The service settings every rule reads; none is configured by default, and a rule reads them defensively. */
export type HoverflyServiceSettings = {
    /** The post-serve actions registered with the running Hoverfly; when non-empty, HF602 flags any other. */
    readonly registeredActions?: readonly string[];
};

/** Everything a rule needs to analyse one document. */
export type RuleContext = {
    /** The source document (for positionAt / getText / uri). */
    readonly textDocument: TextDocument;
    /** The error-recovering JSON AST (root may be undefined on severe parse failure). */
    readonly jsonDocument: JSONDocument;
    /** Lazily-built, AST-anchored typed view over the simulation. */
    readonly model: SimulationModel;
    /** Service-level settings (allowlists, toggles); empty object when none configured. */
    readonly settings: HoverflyServiceSettings;
};

/** A request's matcher fields. */
export type RequestModel = {
    /** The `request` object node, when present. */
    readonly node: ObjectASTNode | undefined;
    /** Matcher fields by name; a headers or query entry is flattened to its key, its container recorded. */
    readonly fields: readonly RequestField[];
};

/** The container a matcher field lives in, so rules know placement (HF208 etc.). */
export type FieldContainer = 'headers' | 'query' | 'request';

/** One matcher-bearing field on the request (e.g. `path`, or a single header key). */
export type RequestField = {
    /** Field name as written (`path`, `method`, `body`, or a header/query key). */
    readonly fieldName: string;
    /** Where this field lives — top-level request field, or inside headers/query. */
    readonly container: FieldContainer;
    /** The key node for this field (the property key string node). */
    readonly keyNode: ASTNode | undefined;
    /** The matchers declared on this field. */
    readonly matchers: readonly MatcherModel[];
};

/** One matcher object inside a matcher array (`{ matcher, value, config, doMatch }`). */
export type MatcherModel = {
    /** The whole matcher object node. */
    readonly node: ObjectASTNode | undefined;
    /** `matcher` field: the string node naming the matcher (e.g. `"exact"`). */
    readonly matcherNode: ASTNode | undefined;
    /** The parsed matcher name, when it is a string. */
    readonly matcherName: string | undefined;
    /** `value` field node (any JSON type). */
    readonly valueNode: ASTNode | undefined;
    /** `config` field node (object on `array`; an error elsewhere). */
    readonly configNode: ASTNode | undefined;
    /** `doMatch` field node (chained matcher), when present. */
    readonly doMatchNode: ASTNode | undefined;
    /** Parent field this matcher belongs to (placement + container info). */
    readonly parent: { readonly fieldName: string; readonly container: FieldContainer };
};

/** A response, with the field nodes the HF3xx rules care about. */
export type ResponseModel = {
    readonly node: ObjectASTNode | undefined;
    /** Property-node accessors for the response fields HF3xx inspects. */
    readonly status: ResponseField;
    readonly body: ResponseField;
    readonly bodyFile: ResponseField;
    readonly encodedBody: ResponseField;
    readonly templated: ResponseField;
    /** `fixedDelay` field accessors (HF306). */
    readonly fixedDelay: ResponseField;
    /** `logNormalDelay` field accessors (HF307). */
    readonly logNormalDelay: ResponseField;
    /** `headers` object node, when present. */
    readonly headersNode: ObjectASTNode | undefined;
    /** Header entries keyed by header name (one per header property). */
    readonly headers: readonly HeaderEntry[];
};

/** A single response field: its property, key, and value nodes (any may be undefined). */
export type ResponseField = {
    readonly propertyNode: ASTNode | undefined;
    readonly keyNode: ASTNode | undefined;
    readonly valueNode: ASTNode | undefined;
};

/** One response header (`name: [values]`). */
export type HeaderEntry = {
    readonly name: string;
    readonly keyNode: ASTNode;
    readonly valueNode: ASTNode | undefined;
};

/** A `requiresState` / `transitionsState` map entry (state key → value), AST-anchored. */
export type StateEntry = {
    readonly key: string;
    readonly keyNode: ASTNode | undefined;
    readonly valueNode: ASTNode | undefined;
};

/** A `removesState` array entry (a state key string), AST-anchored. */
export type RemovesStateEntry = {
    readonly key: string;
    /** The string node for this entry. */
    readonly node: ASTNode | undefined;
};

/** A single request/response pair view. */
export type PairModel = {
    /** The whole pair object node. */
    readonly node: ObjectASTNode | undefined;
    readonly request: RequestModel;
    readonly response: ResponseModel;
    readonly requiresState: readonly StateEntry[];
    readonly transitionsState: readonly StateEntry[];
    readonly removesState: readonly RemovesStateEntry[];
};

/** `meta` view. */
export type MetaModel = {
    readonly node: ObjectASTNode | undefined;
    /** `schemaVersion` field accessors. */
    readonly schemaVersion: ResponseField;
};

/** One `globalActions.delays[]` entry. */
export type DelayModel = {
    readonly node: ObjectASTNode | undefined;
    readonly urlPatternNode: ASTNode | undefined;
    readonly urlPattern: string | undefined;
    readonly delayNode: ASTNode | undefined;
};

/** `globalActions` view. */
export type GlobalActionsModel = {
    readonly node: ObjectASTNode | undefined;
    /** `globalActions.delays[]` (fixed delays). */
    readonly delays: readonly DelayModel[];
    /** `globalActions.delaysLogNormal[]` (log-normal delays). Same `urlPattern` regex contract. */
    readonly delaysLogNormal: readonly DelayModel[];
};

/** A typed view of the whole simulation, every interesting node with its ASTNode; every field is defensive. */
export type SimulationModel = {
    /** Root object node, when the document parsed to an object. */
    readonly root: ObjectASTNode | undefined;
    /** `data` object node, when present. */
    readonly dataNode: ObjectASTNode | undefined;
    readonly pairs: readonly PairModel[];
    readonly meta: MetaModel;
    readonly globalActions: GlobalActionsModel;
};
