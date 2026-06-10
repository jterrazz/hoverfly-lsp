/**
 * JSON-location-path recognisers for the Hoverfly contribution.
 *
 * `vscode-json-languageservice` keys both completion and hover contributions off a
 * {@link JSONPath} — an array of `string | number` segments naming the route from the document
 * root to a node (e.g. `["data","pairs",0,"request","path",0,"matcher"]`). These helpers decide,
 * purely from such a path, *what kind of Hoverfly position* the cursor sits in, so the
 * contribution can offer the right completions / hover without re-walking the AST.
 *
 * Two callers, two path conventions (see the library source):
 *   - completion `collectValueCompletions(uri, location, propertyKey, …)` passes the path of the
 *     OBJECT that owns the property, and the property key separately. So a matcher-name value is
 *     `location = [..,<matcherObj>]`, `propertyKey = "matcher"`.
 *   - hover `getInfoContribution(uri, location)` passes the path of the hovered VALUE node. So a
 *     matcher-name value is `location = [..,"matcher"]` (the trailing key included).
 *
 * Both conventions are supported by matching on the *shape* of the matcher-object path and
 * treating the final `"matcher"` segment as optional.
 */

import type { JSONPath, Segment } from "vscode-json-languageservice";

/** Top-level request fields whose value is a matcher array (the only places matchers live). */
const DIRECT_MATCHER_FIELDS: ReadonlySet<string> = new Set([
  "body",
  "destination",
  "method",
  "path",
  "scheme",
]);

/** Request sub-objects that hold `{ key: [matchers] }` maps (header / query name → matchers). */
const NESTED_MATCHER_MAPS: ReadonlySet<string> = new Set(["headers", "query"]);

function isIndex(segment: Segment | undefined): segment is number {
  return typeof segment === "number";
}

function isString(segment: Segment | undefined): segment is string {
  return typeof segment === "string";
}

/**
 * Result of locating a matcher position: which request field the matcher applies to (so callers
 * know whether `form` is offered — body only), and whether the position is the matcher OBJECT
 * itself (a value-completion site) vs the `matcher` key's value.
 */
interface MatcherPosition {
  /** The owning request field name (`path`, `body`, a header key, …). */
  readonly field: string;
  /** Whether the owning field is the request `body` (the only place `form` is legal). */
  readonly isBody: boolean;
}

/**
 * Recognise a matcher-NAME position from a location path, tolerating the trailing `"matcher"`
 * segment (present for hover, absent for value-completion where the key is passed separately).
 *
 * Shapes accepted (… = `["data","pairs",<n>,"request"]`):
 *   - top-level field:    …, <field>, <i>            (+ optional "matcher")
 *   - header/query map:   …, headers|query, <name>, <i>   (+ optional "matcher")
 *   - any `doMatch` nesting after either of the above: …, "doMatch", (…"doMatch") (+ optional "matcher")
 *
 * Returns the {@link MatcherPosition} (with `isBody`) or `undefined` when the path is not a
 * matcher-name position. `requireMatcherKey` forces the trailing `"matcher"` segment to be
 * present (used by hover, where the value node path always ends at the key).
 */
function matchMatcherNamePosition(
  path: JSONPath,
  options: { readonly requireMatcherKey: boolean },
): MatcherPosition | undefined {
  let segments = path;
  let endsWithMatcherKey = false;
  if (isString(segments[segments.length - 1]) && segments[segments.length - 1] === "matcher") {
    segments = segments.slice(0, -1);
    endsWithMatcherKey = true;
  }
  if (options.requireMatcherKey && !endsWithMatcherKey) {
    return undefined;
  }

  /*
   * After stripping the optional "matcher" key, the path must end at a matcher OBJECT — either a
   * matcher-array index or a "doMatch" chain link. Peel any trailing "doMatch" links first.
   */
  let trimmed = [...segments];
  while (trimmed[trimmed.length - 1] === "doMatch") {
    trimmed = trimmed.slice(0, -1);
  }

  /*
   * Now the tail must be `<field>, <index>` for a direct field, or
   * `headers|query, <name>, <index>` for a nested map — preceded by `request`.
   */
  const last = trimmed[trimmed.length - 1];
  if (!isIndex(last)) {
    /*
     * A doMatch link lands directly on a matcher object (no array index); accept it when the
     * segment before the doMatch chain identifies a matcher field under `request`.
     */
    if (endsWithMatcherKey || segments[segments.length - 1] === "doMatch") {
      return classifyByField(trimmed);
    }
    return undefined;
  }

  return classifyByField(trimmed.slice(0, -1));
}

/**
 * Given the path UP TO (but not including) the matcher-array index, decide whether it names a
 * request matcher field and whether that field is `body`.
 */
function classifyByField(beforeIndex: JSONPath): MatcherPosition | undefined {
  const last = beforeIndex[beforeIndex.length - 1];
  const prev = beforeIndex[beforeIndex.length - 2];

  // Direct field: …, "request", <field>
  if (isString(last) && DIRECT_MATCHER_FIELDS.has(last) && prev === "request") {
    return { field: last, isBody: last === "body" };
  }

  // Header/query map: …, "request", headers|query, <name>
  const grand = beforeIndex[beforeIndex.length - 3];
  if (isString(last) && isString(prev) && NESTED_MATCHER_MAPS.has(prev) && grand === "request") {
    return { field: last, isBody: false };
  }

  return undefined;
}

/** True when the path identifies the `meta.schemaVersion` value (hover or value completion). */
function isSchemaVersionPosition(
  path: JSONPath,
  options: { readonly propertyKey?: string } = {},
): boolean {
  // Hover: path ends `["meta","schemaVersion"]`. Value completion: path is `["meta"]`, key passed.
  const last = path[path.length - 1];
  if (last === "schemaVersion" && path[path.length - 2] === "meta") {
    return true;
  }
  return options.propertyKey === "schemaVersion" && last === "meta";
}

/**
 * True when `propertyKey` is a NEW key being typed inside a `request.requiresState` object.
 * Property-completion only: `location` is the requiresState object's path.
 */
function isRequiresStateKeyPosition(path: JSONPath): boolean {
  return path[path.length - 1] === "requiresState" && path[path.length - 2] === "request";
}

/**
 * True when `propertyKey` is a NEW key being typed inside a `response.transitionsState` object.
 */
function isTransitionsStateKeyPosition(path: JSONPath): boolean {
  return path[path.length - 1] === "transitionsState" && path[path.length - 2] === "response";
}

/** True when the path identifies a `response.postServeAction` value position. */
function isPostServeActionPosition(
  path: JSONPath,
  options: { readonly propertyKey?: string } = {},
): boolean {
  const last = path[path.length - 1];
  if (last === "postServeAction" && path[path.length - 2] === "response") {
    return true;
  }
  return options.propertyKey === "postServeAction" && last === "response";
}

export {
  isPostServeActionPosition,
  isRequiresStateKeyPosition,
  isSchemaVersionPosition,
  isTransitionsStateKeyPosition,
  matchMatcherNamePosition,
};
