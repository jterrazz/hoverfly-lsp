import { glob } from "glob";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { isHoverflySimulation } from "../src/fingerprint.js";

// Repo root is four levels up from this file: packages/core/test/ -> repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

const validFiles = await glob("testdata/valid/**/*.hoverfly.json", { cwd: repoRoot });

describe("reference corpus: testdata/valid", () => {
  it("finds at least one valid fixture", () => {
    // Given - the valid corpus directory
    // Then - it is not empty (guards against a broken glob path)
    expect(validFiles.length).toBeGreaterThan(0);
  });

  it.each(validFiles)("%s parses as JSON and passes the fingerprint", (relPath) => {
    // Given - a committed valid fixture
    const text = readFileSync(join(repoRoot, relPath), "utf8");
    // Then - it is valid JSON
    expect(() => JSON.parse(text)).not.toThrow();
    // Then - and it is recognised as a Hoverfly simulation
    expect(isHoverflySimulation(text)).toBe(true);
  });
});
