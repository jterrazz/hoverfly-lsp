import { describe, expect, it } from "vitest";

import { parseMarkedDocument } from "./harness.js";

describe("fourslash harness — parseMarkedDocument", () => {
  it("strips a default marker and records its position", () => {
    // Given - a document with a single anonymous marker inside a JSON string
    const source = `{"matcher":"⟦⟧"}`;
    // When - parsed
    const { text, positions } = parseMarkedDocument(source);
    // Then - the marker text is removed and the position recorded
    expect(text).toBe(`{"matcher":""}`);
    const pos = positions.get("");
    expect(pos).toBeDefined();
    // The cursor sits between the two quotes (offset of the empty string content).
    expect(text.indexOf(`""`) + 1).toBe(offsetOf(text, pos!));
  });

  it("supports multiple named markers in one document", () => {
    // Given - two named markers
    const source = `{"a":"⟦first⟧","b":"⟦second⟧"}`;
    // When - parsed
    const { text, positions } = parseMarkedDocument(source);
    // Then - both names resolve and the text is clean
    expect(text).toBe(`{"a":"","b":""}`);
    expect(positions.has("first")).toBe(true);
    expect(positions.has("second")).toBe(true);
  });

  it("works for a bare (unquoted) value position", () => {
    // Given - a marker in an unquoted value position
    const source = `{"matcher": ⟦bare⟧}`;
    // When - parsed
    const { text, positions } = parseMarkedDocument(source);
    // Then - marker stripped, position recorded
    expect(text).toBe(`{"matcher": }`);
    expect(positions.has("bare")).toBe(true);
  });

  it("throws on a duplicate marker name", () => {
    // Given - the same name twice
    const source = `{"a":"⟦x⟧","b":"⟦x⟧"}`;
    // Then - parsing rejects the ambiguity
    expect(() => parseMarkedDocument(source)).toThrow(/Duplicate/);
  });

  it("throws on unbalanced brackets", () => {
    // Given - a stray closing bracket
    const source = `{"a":"⟧"}`;
    // Then - parsing rejects it
    expect(() => parseMarkedDocument(source)).toThrow(/Unbalanced/);
  });
});

/** Resolve a Position back to an absolute offset over `text` (test-only helper). */
function offsetOf(text: string, pos: { line: number; character: number }): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < pos.line; i++) {
    offset += (lines[i]?.length ?? 0) + 1;
  }
  return offset + pos.character;
}
