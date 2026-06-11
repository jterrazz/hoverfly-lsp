/**
 * Content fingerprint for Hoverfly simulation documents (architect decision D3).
 *
 * A JSON document is treated as a Hoverfly simulation iff its root is an object with:
 *   - a `data` property whose value is an object, AND
 *   - a `meta` property whose value is an object with a string `schemaVersion`
 *     that starts with "v".
 *
 * `data.pairs` is intentionally NOT required (it is optional in the official schema).
 *
 * Two variants exist: {@link isHoverflySimulation} (cheap `JSON.parse` over text) and
 * {@link isHoverflySimulationAst} (over the error-recovering AST, used by the service's
 * validation gate so half-typed/broken-but-recognisable documents are still treated as
 * simulations rather than dismissed).
 */

import type { ASTNode } from "vscode-json-languageservice";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * AST-based variant of the D3 fingerprint, run over the error-recovering JSON AST so that
 * half-typed or syntactically-broken documents (which `JSON.parse` would reject outright)
 * are still recognised as simulations and get the full schema/semantic treatment instead of
 * being dismissed as "not a simulation". Never throws; tolerates a partial/absent AST.
 *
 * Matches when the root is an object with a `data` object property and a `meta` object whose
 * `schemaVersion` is a string starting with "v".
 */
export function isHoverflySimulationAst(root: ASTNode | undefined): boolean {
  if (root?.type !== "object") {
    return false;
  }
  const dataNode = root.properties.find((p) => p.keyNode.value === "data")?.valueNode;
  if (dataNode?.type !== "object") {
    return false;
  }
  const metaNode = root.properties.find((p) => p.keyNode.value === "meta")?.valueNode;
  if (metaNode?.type !== "object") {
    return false;
  }
  const schemaVersionNode = metaNode.properties.find(
    (p) => p.keyNode.value === "schemaVersion",
  )?.valueNode;
  return schemaVersionNode?.type === "string" && schemaVersionNode.value.startsWith("v");
}

/**
 * Returns `true` when `text` parses as JSON and matches the Hoverfly simulation
 * fingerprint described in decision D3. Never throws.
 */
/**
 * Whether a document URI/path matches the canonical Hoverfly filename conventions
 * (`*.hoverfly.json`, `*.hfy`, or `hoverfly-simulation.json`, decision D3). Explicitly-named
 * files always get full treatment, including the "this doesn't look like a simulation"
 * diagnostic.
 *
 * Robust to URIs (`file:///a/b/foo.hoverfly.json`) and bare paths; case-insensitive on the
 * filename. Never throws.
 */
export function hasHoverflyFilename(uri: string): boolean {
  // Take the last path segment (strip any query/fragment a URI might carry).
  const withoutQuery = uri.split(/[?#]/, 1)[0] ?? uri;
  const segment = (withoutQuery.split("/").pop() ?? withoutQuery).toLowerCase();
  return (
    segment.endsWith(".hoverfly.json") ||
    segment.endsWith(".hfy") ||
    segment === "hoverfly-simulation.json"
  );
}

export function isHoverflySimulation(text: string): boolean {
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return false;
  }

  if (!isPlainObject(root)) {
    return false;
  }

  const { data, meta } = root;
  if (!isPlainObject(data)) {
    return false;
  }
  if (!isPlainObject(meta)) {
    return false;
  }

  const schemaVersion = meta["schemaVersion"];
  return typeof schemaVersion === "string" && schemaVersion.startsWith("v");
}
