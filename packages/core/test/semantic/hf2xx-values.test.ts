/**
 * Focused unit tests for the HF215/HF216 method/scheme well-known-VALUE did-you-mean rule. They
 * build a {@link RuleContext} and run the exported rule directly (like matcher-syntax.test.ts), so
 * they pass independent of `ALL_RULES` wiring. The zero-false-positive policy is the contract under
 * test: a near-miss typo fires a Hint; every plausible custom value stays SILENT.
 */

import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { createRuleContext } from "../../src/semantic/engine.js";
import { methodSchemeValueRule } from "../../src/semantic/rules/hf2xx-values.js";

const ls = getLanguageService({});

/** Run the rule over a one-pair simulation whose request is `request`. */
function runOnRequest(request: unknown) {
  const sim = {
    data: { pairs: [{ request, response: { status: 200 } }] },
    meta: { schemaVersion: "v5.3" },
  };
  const text = JSON.stringify(sim, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  return methodSchemeValueRule.run(createRuleContext(doc, ls.parseJSONDocument(doc)));
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

describe("HF215 — method value did-you-mean", () => {
  it("fires a Hint on a near-miss typo (the reported GT bug)", () => {
    // Given - a method `exact` value that is a one-edit typo of GET
    const diags = runOnRequest({ method: [{ matcher: "exact", value: "GT" }] });
    // Then - one HF215 Hint suggesting GET
    expect(codes(diags)).toEqual(["HF215"]);
    expect(diags[0]?.severity).toBe(DiagnosticSeverity.Hint);
    expect(diags[0]?.message).toContain('"GT"');
    expect(diags[0]?.message).toContain('"GET"');
  });

  it("fires on a default-exact (no matcher key) near-miss", () => {
    // Given - a method matcher with no `matcher` key (default exact) and a typo
    const diags = runOnRequest({ method: [{ value: "DELET" }] });
    // Then - HF215 suggesting DELETE
    expect(codes(diags)).toEqual(["HF215"]);
    expect(diags[0]?.message).toContain('"DELETE"');
  });

  it("is SILENT on a standard method", () => {
    // Given - a real method
    const diags = runOnRequest({ method: [{ matcher: "exact", value: "GET" }] });
    // Then - nothing
    expect(diags).toEqual([]);
  });

  it("is SILENT on a custom verb far from every standard method", () => {
    // Given - bespoke / WebDAV verbs (spec-legal, accepted by Hoverfly verbatim)
    for (const verb of ["PURGE", "PROPFIND", "MKCOL"]) {
      const diags = runOnRequest({ method: [{ matcher: "exact", value: verb }] });
      // Then - no false positive
      expect(diags, verb).toEqual([]);
    }
  });

  it("is SILENT on a glob/regex method value (a pattern, not an enum)", () => {
    // Given - a typo-shaped value but under a pattern matcher
    const diags = runOnRequest({ method: [{ matcher: "regex", value: "GT" }] });
    // Then - no method-value hint (regex value is not an enum)
    expect(diags).toEqual([]);
  });
});

describe("HF216 — scheme value did-you-mean", () => {
  it("fires a Hint on a near-miss scheme typo", () => {
    // Given - a scheme `exact` value that is a one-edit typo of http
    const diags = runOnRequest({ scheme: [{ matcher: "exact", value: "htttp" }] });
    // Then - HF216 suggesting http
    expect(codes(diags)).toEqual(["HF216"]);
    expect(diags[0]?.severity).toBe(DiagnosticSeverity.Hint);
    expect(diags[0]?.message).toContain('"http"');
  });

  it("is SILENT on http/https/ws/wss", () => {
    // Given - the common schemes
    for (const scheme of ["http", "https", "ws", "wss"]) {
      const diags = runOnRequest({ scheme: [{ matcher: "exact", value: scheme }] });
      // Then - nothing
      expect(diags, scheme).toEqual([]);
    }
  });

  it("is SILENT on a custom scheme like ftp (distance 2 from http — a legal scheme)", () => {
    // Given - ftp: a real scheme that lies within edit-distance 2 of http (the very reason the
    // Value-domain threshold is tightened to 1)
    const diags = runOnRequest({ scheme: [{ matcher: "exact", value: "ftp" }] });
    // Then - no false positive
    expect(diags).toEqual([]);
  });
});
