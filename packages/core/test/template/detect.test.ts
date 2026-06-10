import { describe, expect, it } from "vitest";

import { hasTemplateSyntax } from "../../src/template/index.js";

describe("hasTemplateSyntax", () => {
  it("detects a mustache opener", () => {
    // Then - any `{{` counts
    expect(hasTemplateSyntax("hello {{name}}")).toBe(true);
    expect(hasTemplateSyntax("{{#each xs}}{{/each}}")).toBe(true);
    expect(hasTemplateSyntax("{{{unescaped}}}")).toBe(true);
  });

  it("returns false for plain text and single braces", () => {
    // Then - no `{{` => no template syntax
    expect(hasTemplateSyntax("plain body")).toBe(false);
    expect(hasTemplateSyntax("{ not a mustache }")).toBe(false);
    expect(hasTemplateSyntax("")).toBe(false);
    expect(hasTemplateSyntax('{"json":"object"}')).toBe(false);
  });
});
