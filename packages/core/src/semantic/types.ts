/**
 * Core semantic-analysis types: the {@link SemanticRule} interface every rule-family file
 * implements, the {@link RuleContext} passed to each rule, and the {@link SimulationModel}
 * — a typed, AST-anchored view over a Hoverfly simulation that ALL rule families consume.
 *
 * Design goal: rules never re-walk the raw AST or re-derive the simulation shape. The model
 * is built once per validation pass (lazily, via `RuleContext.model`) and exposes typed
 * accessors plus the `ASTNode` for every interesting node, so a rule can point a diagnostic
 * at the exact node it needs without offset arithmetic.
 *
 * Everything is optional/defensive: the model is built from a possibly-malformed document
 * (see `model.ts`), so any field may be `undefined`. Rules must treat `undefined` as "absent".
 */

import type { ASTNode, JSONDocument, ObjectASTNode } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import type { Diagnostic } from "vscode-languageserver-types";

import type { DiagnosticCode } from "./catalog.js";

/**
 * A semantic rule (or rule family). One file under `rules/` typically exports one rule whose
 * `codes` are the HFxxx codes it can emit. The engine runs every registered rule and
 * concatenates the results.
 */
export interface SemanticRule {
  /** Catalog codes this rule may emit (documentation/coverage aid; not enforced). */
  readonly codes: readonly DiagnosticCode[];
  /** Produce diagnostics for one document. MUST NOT throw on malformed input. */
  run: (context: RuleContext) => Diagnostic[];
}

/**
 * Service-level settings carried into every rule. Optional and additive: rules that consult
 * settings (e.g. HF602's `registeredActions` allowlist) read defensively, and the validation
 * pipeline supplies an empty object when none are configured.
 */
export interface HoverflyServiceSettings {
  /**
   * Allowlist of post-serve action names registered with the running Hoverfly instance. When
   * non-empty, HF602 flags any `postServeAction` not in this list. When absent/empty, HF602 is
   * silent (the actions are runtime-registered and unknowable from the file alone).
   */
  readonly registeredActions?: readonly string[];
}

/** Everything a rule needs to analyse one document. */
export interface RuleContext {
  /** The source document (for positionAt / getText / uri). */
  readonly textDocument: TextDocument;
  /** The error-recovering JSON AST (root may be undefined on severe parse failure). */
  readonly jsonDocument: JSONDocument;
  /** Lazily-built, AST-anchored typed view over the simulation. */
  readonly model: SimulationModel;
  /** Service-level settings (allowlists, toggles); empty object when none configured. */
  readonly settings: HoverflyServiceSettings;
}

/* ------------------------------------------------------------------------------------------ *
 * SimulationModel — the typed, AST-anchored view.
 * ------------------------------------------------------------------------------------------ */

/**
 * The fields on a request that hold matcher arrays (`path`, `method`, `body`, plus dynamic
 * header/query field names). Each maps to the list of matchers declared on it.
 */
export interface RequestModel {
  /** The `request` object node, when present. */
  readonly node: ObjectASTNode | undefined;
  /**
   * Matcher fields keyed by field name (`path`, `method`, `body`, `destination`, `scheme`,
   * `query`, `headers`, ...). Each value is the list of matcher entries on that field.
   *
   * NOTE: `headers`/`query` in Hoverfly are objects of `{ name: [matchers] }`, not matcher
   * arrays. The model flattens those into `requestFields` entries whose `fieldName` is the
   * header/query key and whose `container` records the parent kind, so matcher rules treat
   * them uniformly. The raw `headers`/`query` object nodes are also exposed via `node`.
   */
  readonly fields: readonly RequestField[];
}

/** The container a matcher field lives in, so rules know placement (HF208 etc.). */
export type FieldContainer = "headers" | "query" | "request";

/** One matcher-bearing field on the request (e.g. `path`, or a single header key). */
export interface RequestField {
  /** Field name as written (`path`, `method`, `body`, or a header/query key). */
  readonly fieldName: string;
  /** Where this field lives — top-level request field, or inside headers/query. */
  readonly container: FieldContainer;
  /** The key node for this field (the property key string node). */
  readonly keyNode: ASTNode | undefined;
  /** The matchers declared on this field. */
  readonly matchers: readonly MatcherModel[];
}

/** One matcher object inside a matcher array (`{ matcher, value, config, doMatch }`). */
export interface MatcherModel {
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
}

/** A response, with the field nodes the HF3xx rules care about. */
export interface ResponseModel {
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
}

/** A single response field: its property, key, and value nodes (any may be undefined). */
export interface ResponseField {
  readonly propertyNode: ASTNode | undefined;
  readonly keyNode: ASTNode | undefined;
  readonly valueNode: ASTNode | undefined;
}

/** One response header (`name: [values]`). */
export interface HeaderEntry {
  readonly name: string;
  readonly keyNode: ASTNode | undefined;
  readonly valueNode: ASTNode | undefined;
}

/** A `requiresState` / `transitionsState` map entry (state key → value), AST-anchored. */
export interface StateEntry {
  readonly key: string;
  readonly keyNode: ASTNode | undefined;
  readonly valueNode: ASTNode | undefined;
}

/** A `removesState` array entry (a state key string), AST-anchored. */
export interface RemovesStateEntry {
  readonly key: string;
  /** The string node for this entry. */
  readonly node: ASTNode | undefined;
}

/** A single request/response pair view. */
export interface PairModel {
  /** The whole pair object node. */
  readonly node: ObjectASTNode | undefined;
  readonly request: RequestModel;
  readonly response: ResponseModel;
  readonly requiresState: readonly StateEntry[];
  readonly transitionsState: readonly StateEntry[];
  readonly removesState: readonly RemovesStateEntry[];
}

/** `meta` view. */
export interface MetaModel {
  readonly node: ObjectASTNode | undefined;
  /** `schemaVersion` field accessors. */
  readonly schemaVersion: ResponseField;
}

/** One `globalActions.delays[]` entry. */
export interface DelayModel {
  readonly node: ObjectASTNode | undefined;
  readonly urlPatternNode: ASTNode | undefined;
  readonly urlPattern: string | undefined;
  readonly delayNode: ASTNode | undefined;
}

/** `globalActions` view. */
export interface GlobalActionsModel {
  readonly node: ObjectASTNode | undefined;
  /** `globalActions.delays[]` (fixed delays). */
  readonly delays: readonly DelayModel[];
  /** `globalActions.delaysLogNormal[]` (log-normal delays). Same `urlPattern` regex contract. */
  readonly delaysLogNormal: readonly DelayModel[];
}

/**
 * Typed view of the whole simulation. Built once from the AST; every interesting node carries
 * its `ASTNode` reference so rules can target diagnostics precisely. All fields are defensive.
 */
export interface SimulationModel {
  /** Root object node, when the document parsed to an object. */
  readonly root: ObjectASTNode | undefined;
  /** `data` object node, when present. */
  readonly dataNode: ObjectASTNode | undefined;
  readonly pairs: readonly PairModel[];
  readonly meta: MetaModel;
  readonly globalActions: GlobalActionsModel;
}
