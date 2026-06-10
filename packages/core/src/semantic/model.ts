/**
 * Builds the {@link SimulationModel} from a (possibly malformed) JSON AST.
 *
 * Hard rule: NEVER throw on bad input. Every shape may be wrong (object where an array is
 * expected, missing properties, wrong value types). Absent or wrong-shaped data resolves to
 * `undefined`/empty arrays so rules can defensively skip. This is the only place that walks
 * the raw AST shape; rules consume the typed model.
 */

import type {
  ASTNode,
  JSONDocument,
  ObjectASTNode,
  PropertyASTNode,
} from "vscode-json-languageservice";

import type {
  DelayModel,
  FieldContainer,
  GlobalActionsModel,
  HeaderEntry,
  MatcherModel,
  MetaModel,
  PairModel,
  RemovesStateEntry,
  RequestField,
  RequestModel,
  ResponseField,
  ResponseModel,
  SimulationModel,
  StateEntry,
} from "./types.js";

/* ----------------------------------- AST helpers ----------------------------------------- */

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
  return node?.type === "object" ? node : undefined;
}

/** The property node for `key` on an object node, if present. */
function prop(node: ObjectASTNode | undefined, key: string): PropertyASTNode | undefined {
  if (!node) {
    return undefined;
  }
  return node.properties.find((p) => p.keyNode.value === key);
}

/** The value node for `key` on an object node, if present. */
function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return prop(node, key)?.valueNode;
}

/** A {@link ResponseField} (property / key / value triple) for `key` on an object node. */
function field(node: ObjectASTNode | undefined, key: string): ResponseField {
  const property = prop(node, key);
  return {
    propertyNode: property,
    keyNode: property?.keyNode,
    valueNode: property?.valueNode,
  };
}

/** Array items of the value at `key`, or `[]` when the value is missing/not an array. */
function arrayItems(node: ObjectASTNode | undefined, key: string): ASTNode[] {
  const value = propValue(node, key);
  return value?.type === "array" ? value.items : [];
}

function stringValue(node: ASTNode | undefined): string | undefined {
  return node?.type === "string" ? node.value : undefined;
}

/* --------------------------------- matcher / field model --------------------------------- */

function buildMatcher(
  node: ASTNode | undefined,
  fieldName: string,
  container: FieldContainer,
): MatcherModel {
  const object = asObject(node);
  const matcherNode = propValue(object, "matcher");
  return {
    node: object,
    matcherNode,
    matcherName: stringValue(matcherNode),
    valueNode: propValue(object, "value"),
    configNode: propValue(object, "config"),
    doMatchNode: propValue(object, "doMatch"),
    parent: { fieldName, container },
  };
}

function buildMatcherField(
  property: PropertyASTNode,
  fieldName: string,
  container: FieldContainer,
): RequestField {
  const value = property.valueNode;
  const items = value?.type === "array" ? value.items : [];
  return {
    fieldName,
    container,
    keyNode: property.keyNode,
    matchers: items.map((item) => buildMatcher(item, fieldName, container)),
  };
}

/**
 * Top-level request fields that hold matcher arrays directly (everything except the nested
 * `headers`/`query` maps, which are flattened separately).
 */
const NESTED_MATCHER_MAPS = new Set(["headers", "query"]);

function buildRequest(node: ASTNode | undefined): RequestModel {
  const object = asObject(node);
  if (!object) {
    return { node: undefined, fields: [] };
  }

  const fields: RequestField[] = [];
  for (const property of object.properties) {
    const name = property.keyNode.value;
    if (NESTED_MATCHER_MAPS.has(name)) {
      // Headers/query: { headerName: [matchers...] } — flatten each key into a field.
      const inner = asObject(property.valueNode);
      const container: FieldContainer = name === "headers" ? "headers" : "query";
      if (inner) {
        for (const innerProp of inner.properties) {
          fields.push(buildMatcherField(innerProp, innerProp.keyNode.value, container));
        }
      }
      continue;
    }
    // Only fields whose value is a matcher array are interesting to matcher rules.
    if (property.valueNode?.type === "array") {
      fields.push(buildMatcherField(property, name, "request"));
    }
  }

  return { node: object, fields };
}

/* ------------------------------------- response model ------------------------------------ */

function buildResponse(node: ASTNode | undefined): ResponseModel {
  const object = asObject(node);
  const headersNode = asObject(propValue(object, "headers"));
  const headers: HeaderEntry[] = headersNode
    ? headersNode.properties.map((p) => ({
        name: p.keyNode.value,
        keyNode: p.keyNode,
        valueNode: p.valueNode,
      }))
    : [];

  return {
    node: object,
    status: field(object, "status"),
    body: field(object, "body"),
    bodyFile: field(object, "bodyFile"),
    encodedBody: field(object, "encodedBody"),
    templated: field(object, "templated"),
    fixedDelay: field(object, "fixedDelay"),
    logNormalDelay: field(object, "logNormalDelay"),
    headersNode,
    headers,
  };
}

/* --------------------------------------- state model ------------------------------------- */

function buildStateEntries(node: ObjectASTNode | undefined, key: string): StateEntry[] {
  const map = asObject(propValue(node, key));
  if (!map) {
    return [];
  }
  return map.properties.map((p) => ({
    key: p.keyNode.value,
    keyNode: p.keyNode,
    valueNode: p.valueNode,
  }));
}

function buildRemovesState(node: ObjectASTNode | undefined): RemovesStateEntry[] {
  return arrayItems(node, "removesState")
    .filter((item): item is ASTNode => item.type === "string")
    .map((item) => ({ key: stringValue(item) ?? "", node: item }));
}

/* --------------------------------------- pair model -------------------------------------- */

function buildPair(node: ASTNode | undefined): PairModel {
  const object = asObject(node);
  /*
   * Per Hoverfly source truth (research/02, Go structs): `requiresState` is a field of the
   * REQUEST (RequestMatcherViewV5); `transitionsState`/`removesState` are fields of the
   * RESPONSE (ResponseDetailsViewV5). Read them off the correct child node, not the pair.
   */
  const requestNode = asObject(propValue(object, "request"));
  const responseNode = asObject(propValue(object, "response"));
  return {
    node: object,
    request: buildRequest(requestNode),
    response: buildResponse(responseNode),
    requiresState: buildStateEntries(requestNode, "requiresState"),
    transitionsState: buildStateEntries(responseNode, "transitionsState"),
    removesState: buildRemovesState(responseNode),
  };
}

/* --------------------------------------- meta model -------------------------------------- */

function buildMeta(node: ObjectASTNode | undefined): MetaModel {
  const object = asObject(propValue(node, "meta"));
  return {
    node: object,
    schemaVersion: field(object, "schemaVersion"),
  };
}

/* ---------------------------------- globalActions model ---------------------------------- */

function buildDelay(node: ASTNode | undefined): DelayModel {
  const object = asObject(node);
  const urlPatternNode = propValue(object, "urlPattern");
  return {
    node: object,
    urlPatternNode,
    urlPattern: stringValue(urlPatternNode),
    delayNode: propValue(object, "delay"),
  };
}

function buildGlobalActions(dataNode: ObjectASTNode | undefined): GlobalActionsModel {
  const object = asObject(propValue(dataNode, "globalActions"));
  return {
    node: object,
    delays: arrayItems(object, "delays").map(buildDelay),
  };
}

/* ----------------------------------------- root ------------------------------------------ */

/**
 * Build the typed simulation view from a parsed JSON document. Defensive throughout: a
 * non-object root, missing `data`, or wrong-typed `pairs` all degrade to empty/undefined.
 */
export function buildSimulationModel(jsonDocument: JSONDocument): SimulationModel {
  const root = asObject(jsonDocument.root);
  const dataNode = asObject(propValue(root, "data"));

  return {
    root,
    dataNode,
    pairs: arrayItems(dataNode, "pairs").map(buildPair),
    meta: buildMeta(root),
    globalActions: buildGlobalActions(dataNode),
  };
}
