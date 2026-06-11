import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "vitest";

import { expectCompletions, expectHover, parseMarkedDocument } from "../fourslash/harness.js";

const repoRoot = fileURLToPath(new URL("../../../../", import.meta.url));

function fixture(...parts: string[]): string {
  return readFileSync(join(repoRoot, "testdata", ...parts), "utf8");
}

describe("full-file marker fixtures (testdata/completion, testdata/hover)", () => {
  it("offers body/path/version completions from a full marked simulation file", async () => {
    // Given - a real multi-marker fixture file (migrated into the on-disk corpus tree)
    const doc = parseMarkedDocument(
      fixture("completion", "matcher-name", "full-file.hoverfly.json"),
    );
    // Then - `form` appears on body but not on path; the version marker offers v5.3
    await expectCompletions(doc, "body", { contains: ["form", "exact"] });
    await expectCompletions(doc, "path", { contains: ["exact"], notContains: ["form"] });
    await expectCompletions(doc, "version", { contains: ["v5.3"] });
  });

  it("hovers a matcher name from a full marked simulation file", async () => {
    // Given - a fixture with a cursor on the "regex" matcher name (migrated into the corpus tree)
    const doc = parseMarkedDocument(fixture("hover", "matchers", "regex.hoverfly.json"));
    // Then - registry-sourced regex docs are rendered
    await expectHover(doc, "", { includes: ["Regular-expression match", "Value type:"] });
  });
});
