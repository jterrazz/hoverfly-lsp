import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { HOVERFLY_COMMIT } from "../../src/schema/provenance.js";

/*
 * Sync guard for the standalone, publishable SchemaStore artifact (TRACK: SchemaStore).
 *
 * `schemas/hoverfly-simulation.json` is the schema we submit to SchemaStore and tell
 * schema-only consumers (VS Code json.schemas, IntelliJ mapping, `$schema` self-declaration)
 * to use. It is NOT a separate, hand-maintained document: it is the bundled LSP schema
 * (`packages/core/src/schema/hoverfly.schema.json`) with exactly two DOCUMENTED deltas:
 *
 *   1. `$id`  -> the future SchemaStore URL (the LSP bundle uses the hoverfly-lsp.dev URL).
 *   2. `definitions.field-matchers.properties.matcher.examples` -> the 14 matcher names
 *      RE-ADDED. They were removed from the bundled schema in phase 5 because the LSP
 *      matcher-name completion contribution owns that position (the schema examples leaked
 *      the body-only `form` onto non-body matchers and duplicated contribution items).
 *      Schema-only consumers have no contribution, so the artifact carries them.
 *
 * This test asserts artifact == bundled + those two deltas, so neither can drift silently.
 */

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));
const bundledPath = fileURLToPath(
  new URL("../../src/schema/hoverfly.schema.json", import.meta.url),
);
const artifactPath = `${repoRoot}schemas/hoverfly-simulation.json`;
const baselinePath = `${repoRoot}schemas/upstream-baseline.schema.json`;
const sourceHashesPath = `${repoRoot}schemas/upstream-source-hashes.json`;

const SCHEMASTORE_ID = "https://json.schemastore.org/hoverfly-simulation.json";
const DRAFT_07 = "http://json-schema.org/draft-07/schema#";

/** The 14 matcher-name examples — the documented re-add delta (see git history of phase 5). */
const MATCHER_EXAMPLES = [
  "exact",
  "negate",
  "glob",
  "regex",
  "xml",
  "xmltemplated",
  "xpath",
  "json",
  "jsonpartial",
  "jsonpath",
  "jwt",
  "jwtjsonpath",
  "array",
  "form",
] as const;

type JsonRecord = Record<string, unknown>;

function readJson(path: string): JsonRecord {
  return JSON.parse(readFileSync(path, "utf8")) as JsonRecord;
}

function getMatcherProp(schema: JsonRecord): JsonRecord {
  const definitions = schema["definitions"] as JsonRecord;
  const fieldMatchers = definitions["field-matchers"] as JsonRecord;
  const properties = fieldMatchers["properties"] as JsonRecord;
  return properties["matcher"] as JsonRecord;
}

describe("SchemaStore artifact: schemas/hoverfly-simulation.json", () => {
  const bundled = readJson(bundledPath);
  const artifact = readJson(artifactPath);

  it("keeps $schema at draft-07 (same as the bundled schema)", () => {
    // Given - the standalone artifact
    // Then - it self-declares draft-07, like the bundle
    expect(artifact["$schema"]).toBe(DRAFT_07);
    expect(bundled["$schema"]).toBe(DRAFT_07);
  });

  it("sets $id to the future SchemaStore URL (documented delta 1)", () => {
    // Given - the artifact and the bundle
    // Then - the artifact points at SchemaStore; the bundle keeps its own LSP $id
    expect(artifact["$id"]).toBe(SCHEMASTORE_ID);
    expect(bundled["$id"]).not.toBe(SCHEMASTORE_ID);
  });

  it("re-adds the 14 matcher-name examples (documented delta 2)", () => {
    // Given - the field-matcher.matcher property in each schema
    const artifactMatcher = getMatcherProp(artifact);
    const bundledMatcher = getMatcherProp(bundled);
    // Then - the artifact carries the 14 names; the bundle carries none (contribution owns it)
    expect(artifactMatcher["examples"]).toEqual([...MATCHER_EXAMPLES]);
    expect(bundledMatcher["examples"]).toBeUndefined();
    // And - matcher stays a permissive free string in both (never an enum)
    expect(artifactMatcher["type"]).toBe("string");
    expect(artifactMatcher["enum"]).toBeUndefined();
  });

  it("is byte-for-byte the bundled schema EXCEPT the two documented deltas (drift guard)", () => {
    // Given - the bundled schema with the two documented deltas applied
    const expected = readJson(bundledPath);
    expected["$id"] = SCHEMASTORE_ID;
    getMatcherProp(expected)["examples"] = [...MATCHER_EXAMPLES];
    // Then - the artifact equals exactly that — nothing else may diverge
    expect(artifact).toEqual(expected);
  });

  it("keeps all titles/descriptions from the bundle (the docs investment ships to consumers)", () => {
    // Given - the root + every definition in the artifact
    expect(artifact["title"]).toBe(bundled["title"]);
    expect(artifact["description"]).toBe(bundled["description"]);
    const definitions = artifact["definitions"] as JsonRecord;
    const missing: string[] = [];
    for (const [defName, def] of Object.entries(definitions)) {
      const props = (def as { properties?: Record<string, { description?: string }> }).properties;
      if (!props) {
        continue;
      }
      for (const [propName, prop] of Object.entries(props)) {
        if (typeof prop.description !== "string" || prop.description.length === 0) {
          missing.push(`${defName}.${propName}`);
        }
      }
    }
    // Then - none lost their description
    expect(missing).toEqual([]);
  });
});

describe("upstream drift baseline: schemas/upstream-*", () => {
  it("stores a verbatim official baseline that is well-formed JSON", () => {
    // Given - the verbatim official schema fetched at the pinned commit
    const text = readFileSync(baselinePath, "utf8");
    // Then - it parses (the CI job diffs the live upstream against this byte baseline)
    expect(() => JSON.parse(text)).not.toThrow();
  });

  it("the source-hash manifest commit AGREES with provenance.HOVERFLY_COMMIT", () => {
    // Given - the baseline source-hash manifest the drift job compares against
    const manifest = readJson(sourceHashesPath);
    // Then - it is pinned to the exact same commit the bundled schema was derived from,
    // So the drift job can never silently compare against a different revision
    expect(manifest["commit"]).toBe(HOVERFLY_COMMIT);
    expect(manifest["algorithm"]).toBe("sha256");
  });

  it("the manifest hashes every Go source file the matcher/templating catalogs cite", () => {
    // Given - the source-hash manifest
    const manifest = readJson(sourceHashesPath);
    const files = manifest["files"] as Record<string, string>;
    // Then - it covers the research/07 matcher sources and research/08 templating sources
    const expectedFiles = [
      "core/handlers/v2/schema.json",
      "core/matching/matchers/matchers.go",
      "core/matching/field_matcher.go",
      "core/matching/body_formdata_matching.go",
      "core/models/request_matcher.go",
      "core/matching/matchers/matcher_value_generator.go",
      "core/util/util.go",
      "core/util/jwt.go",
      "core/templating/templating.go",
      "core/templating/template_helpers.go",
      "core/templating/parse_duration.go",
    ];
    expect(Object.keys(files).sort()).toEqual([...expectedFiles].sort());
    // And - every hash is a 64-char hex SHA-256 digest
    for (const hash of Object.values(files)) {
      expect(hash).toMatch(/^[0-9a-f]{64}$/);
    }
  });
});
