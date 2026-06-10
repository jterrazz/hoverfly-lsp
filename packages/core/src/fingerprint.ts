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
 * This phase tolerates parsing via a cheap `JSON.parse` try/catch. A later phase will
 * reuse the error-recovering AST from `vscode-json-languageservice` so we can fingerprint
 * half-typed documents too.
 */

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Returns `true` when `text` parses as JSON and matches the Hoverfly simulation
 * fingerprint described in decision D3. Never throws.
 */
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
