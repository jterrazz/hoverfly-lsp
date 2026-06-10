import { describe, expect, it } from "vitest";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { DIAGNOSTIC_CATALOG, formatMessage } from "../../src/semantic/catalog.js";

describe("diagnostic catalog", () => {
  it("keys every entry by its own code", () => {
    // Given - the frozen catalog table
    // Then - each record's code matches its key (no transcription drift)
    for (const [key, entry] of Object.entries(DIAGNOSTIC_CATALOG)) {
      expect(entry.code).toBe(key);
    }
  });

  it("gives every code a docs href derived from the lowercased code", () => {
    // Given - the catalog
    // Then - hrefs follow the canonical /diagnostics/hfxxx convention
    for (const entry of Object.values(DIAGNOSTIC_CATALOG)) {
      expect(entry.href).toBe(`https://hoverfly-lsp.dev/diagnostics/${entry.code.toLowerCase()}`);
    }
  });

  it("carries the catalog severities from the frozen catalog", () => {
    // Given - representative codes spanning all four severities
    // Then - they match research/11-diagnostic-catalog.md
    expect(DIAGNOSTIC_CATALOG.HF101.severity).toBe(DiagnosticSeverity.Warning);
    expect(DIAGNOSTIC_CATALOG.HF102.severity).toBe(DiagnosticSeverity.Error);
    expect(DIAGNOSTIC_CATALOG.HF103.severity).toBe(DiagnosticSeverity.Information);
    expect(DIAGNOSTIC_CATALOG.HF104.severity).toBe(DiagnosticSeverity.Error);
    expect(DIAGNOSTIC_CATALOG.HF202.severity).toBe(DiagnosticSeverity.Hint);
  });

  it("contains all 37 catalog codes including HF5xx placeholders", () => {
    // Given - the catalog
    // Then - HF101..HF602 are all present
    const codes = Object.keys(DIAGNOSTIC_CATALOG);
    expect(codes).toContain("HF101");
    expect(codes).toContain("HF510");
    expect(codes).toContain("HF602");
    expect(codes).toHaveLength(37);
  });
});

describe("formatMessage", () => {
  it("substitutes named placeholders", () => {
    // Given - a template and matching args
    // Then - the slot is filled
    expect(formatMessage('Unknown matcher "{name}"', { name: "exct" })).toBe(
      'Unknown matcher "exct"',
    );
  });

  it("leaves an unknown placeholder literal (never throws)", () => {
    // Given - a template referencing a missing arg
    // Then - the slot stays as written
    expect(formatMessage("hi {missing}", {})).toBe("hi {missing}");
  });

  it("stringifies non-string args", () => {
    // Given - a numeric arg
    // Then - it is coerced to its string form
    expect(formatMessage("Status {n} is bad", { n: 700 })).toBe("Status 700 is bad");
  });
});
