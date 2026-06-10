import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf1xxSchemaVersionRule, hf101NotASimulation } from "../../src/semantic/rules/hf1xx.js";

const ls = getLanguageService({});

function contextOf(text: string) {
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  return createRuleContext(doc, ls.parseJSONDocument(doc));
}

function sim(schemaVersion: string): string {
  return JSON.stringify({ data: { pairs: [] }, meta: { schemaVersion } });
}

describe("HF101 — not a simulation", () => {
  it("points at the document's first line with the catalog message", () => {
    // Given - a non-simulation document
    const doc = TextDocument.create("file:///x.hoverfly.json", "json", 1, `{"hello":"world"}`);
    // When - HF101 is built
    const d = hf101NotASimulation(doc);
    // Then - it is the warning-level structure diagnostic on line 0
    expect(d.code).toBe("HF101");
    expect(d.source).toBe("hoverfly");
    expect(d.range.start).toEqual({ line: 0, character: 0 });
    expect(d.range.end.line).toBe(0);
    expect(d.message).toContain("does not look like a Hoverfly simulation");
  });
});

describe("HF103/HF104 — schemaVersion rule", () => {
  it("flags a legacy v1–v4 version as HF103 information on the version string", () => {
    // Given - a v3 simulation
    const diags = hf1xxSchemaVersionRule.run(contextOf(sim("v3")));
    // Then - one HF103 information diagnostic carrying the version
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF103");
    expect(diags[0]?.message).toContain("v3");
    // Then - the range targets the quoted version string value, not the whole pair
    const node = diags[0]?.range;
    expect(node?.start.line).toBe(node?.end.line);
  });

  it("does not flag a current v5.x version", () => {
    // Given - the current default version
    // Then - no HF103/HF104
    expect(hf1xxSchemaVersionRule.run(contextOf(sim("v5.3")))).toEqual([]);
  });

  it("flags an unrecognised version syntax as HF104 error", () => {
    // Given - a version that fails ^v\d+(\.\d+)?$
    const diags = hf1xxSchemaVersionRule.run(contextOf(sim("v5x")));
    // Then - one HF104 error diagnostic
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF104");
    expect(diags[0]?.message).toContain("v5x");
  });

  it("accepts a bare major like v5 (C4 pattern allows optional minor)", () => {
    // Given - v5 with no minor
    // Then - neither HF103 nor HF104 fires
    expect(hf1xxSchemaVersionRule.run(contextOf(sim("v5")))).toEqual([]);
  });

  it("stays silent when schemaVersion is absent or non-string (a schema concern)", () => {
    // Given - meta without a string schemaVersion
    const diags = hf1xxSchemaVersionRule.run(
      contextOf(`{"data":{"pairs":[]},"meta":{"schemaVersion":5}}`),
    );
    // Then - HF1xx defers to the schema layer (HF102), emitting nothing itself
    expect(diags).toEqual([]);
  });
});
