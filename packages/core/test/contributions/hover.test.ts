import { describe, expect, it } from "vitest";

import { expectHover, getHoverText } from "../fourslash/harness.js";

describe("matcher-name hover", () => {
  it("renders registry docs, value type, config, doMatch, and panic notes for a matcher name", async () => {
    // Given - the cursor on a "glob" matcher name string
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧glob","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the hover surfaces the registry-sourced docs and metadata lines
    await expectHover(doc, "", {
      includes: [
        "glob",
        "Glob (wildcard) match",
        "Value type:",
        "Config:",
        "doMatch:",
        "docs.hoverfly.io",
      ],
    });
  });

  it("includes a panic warning in the matcher hover", async () => {
    // Given - the cursor on an "array" matcher name (the only config-bearing matcher)
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧array","value":[]}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the hover mentions array config support and the panic footgun
    await expectHover(doc, "", { includes: ["array", "ignoreOrder", "⚠️"] });
  });

  it("renders the body-only form matcher docs when hovered under request.body", async () => {
    // Given - a "form" matcher name on request.body
    const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧form","value":{}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the body-only form docs appear
    await expectHover(doc, "", { includes: ["form", "Body-layer pseudo-matcher", "body"] });
  });

  it("does NOT hijack hover on a non-matcher field (schema hover still works)", async () => {
    // Given - the cursor on the schemaVersion key (a schema-documented field, not a matcher)
    const doc = `{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧v5.3"}}`;
    // Then - the schema-driven hover content (not matcher docs) is rendered
    const text = await getHoverText(doc, "");
    expect(text).toContain("schema version");
    expect(text).not.toContain("Value type:");
  });

  it("returns no matcher hover for a non-simulation document", async () => {
    // Given - arbitrary JSON with a coincidental matcher key, no simulation fingerprint
    const doc = `{"foo":{"matcher":"⟦⟧glob"}}`;
    // Then - no matcher-docs hover is injected
    const text = await getHoverText(doc, "");
    expect(text).not.toContain("Glob (wildcard) match");
  });
});
