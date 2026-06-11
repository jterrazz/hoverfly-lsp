import { describe, expect, it } from "vitest";

import { expectHover, getHoverText } from "../fourslash/harness.js";

/*
 * Hover content policy (issue: hover noise). A matcher hover describes THAT matcher only — its
 * semantics, value type, doMatch behaviour, config support, docs link, and notes intrinsic to
 * the matcher in hand. It must NOT carry the generic "unknown matcher name panics" or "config on
 * a non-array matcher panics" warnings; HF201/HF204 diagnostics own that messaging at the point
 * the mistake is actually made. These tests pin that contract.
 */

describe("matcher-name hover", () => {
  it("renders registry docs, value type, config, and doMatch for a matcher name", async () => {
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

  it("does NOT append the generic unknown-matcher panic warning to a valid matcher hover", async () => {
    // Given - a perfectly valid "regex" matcher name (the user's reported scenario)
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧regex","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When - the matcher hover renders
    const text = await getHoverText(doc, "");
    // Then - the registry docs are present, but neither generic panic note appears
    expect(text).toContain("Regular-expression match");
    expect(text).not.toContain("Unknown matcher name");
    expect(text).not.toContain("CRASHES");
    expect(text).not.toContain("config` key on any matcher other than");
    // And - a non-config matcher's config line stays a neutral one-liner (no panic phrasing)
    expect(text).toContain("**Config:** not supported.");
    expect(text).not.toContain("panics");
    // And - regex carries NO ⚠️ note (it has no matcher-specific footgun)
    expect(text).not.toContain("⚠️");
  });

  it("surfaces array's own config-keys note (ON array, not the generic config panic)", async () => {
    // Given - the cursor on an "array" matcher name (the only config-bearing matcher)
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧array","value":[]}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When
    const text = await getHoverText(doc, "");
    // Then - config support, its keys, and the array-specific non-bool footgun appear...
    expect(text).toContain("Config:** supported");
    expect(text).toContain("ignoreOrder");
    expect(text).toContain("⚠️");
    expect(text).toContain("must be a JSON boolean");
    // ...but NOT the generic any-matcher panic notes
    expect(text).not.toContain("Unknown matcher name");
  });

  it("surfaces form's own body-only + case-sensitivity note when hovered under request.body", async () => {
    // Given - a "form" matcher name on request.body
    const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧form","value":{}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When
    const text = await getHoverText(doc, "");
    // Then - the body-only form docs and its OWN placement/case note appear (no generic panic)
    expect(text).toContain("Body-layer pseudo-matcher");
    expect(text).toContain("⚠️");
    expect(text).toContain("only as a top-level matcher");
    expect(text).not.toContain("Unknown matcher name");
  });

  it("surfaces negate's vacuous-true footgun (ON negate)", async () => {
    // Given - a "negate" matcher name (the only vacuous-true matcher)
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧negate","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When
    const text = await getHoverText(doc, "");
    // Then - the negate-specific vacuous-true note appears
    expect(text).toContain("⚠️");
    expect(text).toContain("matches vacuously");
    expect(text).not.toContain("Unknown matcher name");
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
