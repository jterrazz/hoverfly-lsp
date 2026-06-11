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
    // Given - the Sev column of every row in research/11-diagnostic-catalog.md
    const { Error: E, Warning: W, Information: I, Hint: H } = DiagnosticSeverity;
    const expectedSeverity: Readonly<Record<string, DiagnosticSeverity>> = {
      HF101: W,
      HF102: E,
      HF103: I,
      HF104: E,
      HF201: E,
      HF202: H,
      HF203: E,
      HF204: E,
      HF205: W,
      HF206: E,
      HF207: W,
      HF208: E,
      HF209: E,
      HF210: H,
      HF211: W,
      HF212: W,
      HF213: I,
      HF214: W,
      HF230: E,
      HF231: E,
      HF232: W,
      HF233: W,
      HF234: W,
      HF235: W,
      HF236: W,
      HF301: W,
      HF302: W,
      HF303: W,
      HF304: W,
      HF305: W,
      HF306: W,
      HF307: W,
      HF308: E,
      HF401: W,
      HF402: I,
      HF403: I,
      HF404: E,
      HF405: E,
      HF501: W,
      HF502: E,
      HF503: E,
      HF504: E,
      HF505: E,
      HF506: E,
      HF507: I,
      HF508: W,
      HF509: W,
      HF510: E,
      HF511: E,
      HF512: W,
      HF601: W,
      HF602: I,
      HF603: W,
      HF604: I,
    };
    // Then - every code's severity matches the frozen table exactly (no row escapes coverage)
    for (const [code, entry] of Object.entries(DIAGNOSTIC_CATALOG)) {
      expect(entry.severity, code).toBe(expectedSeverity[code]);
    }
    // And - the assertion table itself stays in lockstep with the catalog (no missing rows)
    expect(Object.keys(expectedSeverity).sort()).toStrictEqual(
      Object.keys(DIAGNOSTIC_CATALOG).sort(),
    );
  });

  it("contains all 54 catalog codes including the structural-strictness extension", () => {
    // Given - the catalog
    // Then - HF101..HF604 are all present (37 original + 17 additive structural-strictness codes)
    const codes = Object.keys(DIAGNOSTIC_CATALOG);
    expect(codes).toContain("HF101");
    expect(codes).toContain("HF230");
    expect(codes).toContain("HF511");
    expect(codes).toContain("HF603");
    expect(codes).toContain("HF604");
    expect(codes).toHaveLength(54);
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
