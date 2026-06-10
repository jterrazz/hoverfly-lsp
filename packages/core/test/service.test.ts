import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createHoverflyLanguageService } from "../src/service.js";

const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));

function doc(text: string): TextDocument {
  return TextDocument.create("file:///sim.hoverfly.json", "json", 1, text);
}

/** The range of the first HF201 diagnostic in a result set, or undefined. */
function hf201RangeOf(diagnostics: readonly { code?: unknown; range?: unknown }[]): unknown {
  return diagnostics.find((d) => d.code === "HF201")?.range;
}

const service = createHoverflyLanguageService();

describe("createHoverflyLanguageService — schema-driven validation", () => {
  it("produces zero diagnostics for a minimal valid simulation", async () => {
    // Given - a minimal but valid v5.3 simulation
    const text = `{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}}`;
    // When - validated through the real service
    const diagnostics = await service.doValidation(doc(text));
    // Then - the schema reports nothing
    expect(diagnostics).toEqual([]);
  });

  it.each(["minimal.hoverfly.json", "rich-stateful-templated.hoverfly.json"])(
    "valid corpus fixture %s produces zero diagnostics end-to-end",
    async (name) => {
      // Given - a committed valid fixture
      const text = readFileSync(join(repoRoot, "testdata/valid", name), "utf8");
      // When - validated through the real service
      const diagnostics = await service.doValidation(doc(text));
      // Then - zero schema diagnostics
      expect(diagnostics).toEqual([]);
    },
  );

  it("flags a structurally-broken simulation with HF102 schema diagnostics", async () => {
    // Given - a fingerprint-passing simulation (valid meta.schemaVersion) with pairs as an
    // Object and a root extra property. (A doc that fails the D3 fingerprint is gated to
    // HF101/[] instead — see the gate tests below.)
    const text = `{"data":{"pairs":{}},"meta":{"schemaVersion":"v5.3"},"extra":1}`;
    // When - validated
    const diagnostics = await service.doValidation(doc(text));
    const messages = diagnostics.map((d) => d.message);
    // Then - each structural problem is reported, re-tagged as HF102
    expect(messages).toContain('Incorrect type. Expected "array".');
    expect(messages.some((m) => m.includes("extra") && m.includes("not allowed"))).toBe(true);
    // Then - every schema diagnostic carries the HF102 code and hoverfly source
    for (const d of diagnostics) {
      expect(d.code).toBe("HF102");
      expect(d.source).toBe("hoverfly");
    }
  });

  it("returns [] for non-simulation JSON without a hoverfly filename (D3 gate)", async () => {
    // Given - arbitrary JSON in a plainly-named file
    const text = `{"hello":"world"}`;
    const document = TextDocument.create("file:///config.json", "json", 1, text);
    // When - validated
    const diagnostics = await service.doValidation(document);
    // Then - the service stays silent
    expect(diagnostics).toEqual([]);
  });

  it("emits HF101 for a hoverfly-named file that fails the fingerprint (D3)", async () => {
    // Given - a *.hoverfly.json file that is not actually a simulation
    const text = `{"hello":"world"}`;
    // When - validated
    const diagnostics = await service.doValidation(doc(text));
    // Then - exactly the HF101 "does not look like a simulation" diagnostic
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0]?.code).toBe("HF101");
    expect(diagnostics[0]?.source).toBe("hoverfly");
  });

  it("does not flag the request.method property (valid per D5)", async () => {
    // Given - a pair using the method field, which the official schema omits
    const text = `{"data":{"pairs":[{"request":{"method":[{"matcher":"exact","value":"GET"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When - validated
    const diagnostics = await service.doValidation(doc(text));
    // Then - method is accepted
    expect(diagnostics).toEqual([]);
  });
});

describe("createHoverflyLanguageService — leading BOM handling", () => {
  const BOM = "﻿";

  it("does not misclassify a BOM-prefixed valid simulation as HF101", async () => {
    // Given - a valid simulation saved with a leading UTF-8 BOM (as many editors do)
    const valid = `{"data":{"pairs":[]},"meta":{"schemaVersion":"v5.3"}}`;
    const document = doc(BOM + valid);
    // When - validated and fingerprinted through the real service
    const diagnostics = await service.doValidation(document);
    // Then - the BOM is transparent: zero diagnostics, recognised as a simulation
    expect(diagnostics).toEqual([]);
    expect(service.isSimulation(document)).toBe(true);
    expect(service.parse(document).root?.type).toBe("object");
  });

  it("keeps diagnostic positions byte-identical with vs without a leading BOM", async () => {
    // Given - the same invalid simulation (unknown matcher on line 1), one with a leading BOM
    const line0 = `{"data":{"pairs":[{"request":{"path":[`;
    const line1 = `{"matcher":"frobnicate","value":"v"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    const body = `${line0}\n${line1}`;
    // When - both are validated
    const withoutBom = await service.doValidation(doc(body));
    const withBom = await service.doValidation(doc(BOM + body));
    /*
     * Then - the HF201 diagnostic lands at the exact same range; replacing the BOM with a
     * space (not deleting it) preserves every UTF-16 offset.
     */
    expect(hf201RangeOf(withoutBom)).toBeDefined();
    expect(hf201RangeOf(withBom)).toEqual(hf201RangeOf(withoutBom));
  });
});

describe("createHoverflyLanguageService — completion", () => {
  it("offers request and response inside an empty pair", async () => {
    // Given - a cursor inside an empty pair object
    const text = `{"data":{"pairs":[{}]},"meta":{"schemaVersion":"v5.3"}}`;
    const document = doc(text);
    const offset = text.indexOf("[{") + 2; // Inside the empty {}
    // When - completion is requested
    const completions = await service.doComplete(document, document.positionAt(offset));
    const labels = (completions?.items ?? []).map((i) => i.label);
    // Then - the pair's properties are suggested
    expect(labels).toContain("request");
    expect(labels).toContain("response");
  });
});

describe("createHoverflyLanguageService — hover", () => {
  it("returns our description when hovering schemaVersion", async () => {
    // Given - a cursor on the schemaVersion key
    const text = `{"data":{},"meta":{"schemaVersion":"v5.3"}}`;
    const document = doc(text);
    const offset = text.indexOf("schemaVersion") + 2;
    // When - hover is requested
    const hover = await service.doHover(document, document.positionAt(offset));
    // Then - it surfaces the bundled schema's schemaVersion description
    // Markdown rendering escapes the dot (v5\.3), so assert on the un-escaped fragment.
    const rendered = JSON.stringify(hover?.contents);
    expect(rendered).toContain("Simulation schema version");
    expect(rendered).toContain("current default is v5");
  });
});

describe("createHoverflyLanguageService — fingerprint + parse passthroughs", () => {
  it("recognises a simulation and parses to a JSON AST", () => {
    // Given - a valid simulation document
    const document = doc(`{"data":{},"meta":{"schemaVersion":"v5.3"}}`);
    // Then - it is fingerprinted as a simulation and parses to a rooted AST
    expect(service.isSimulation(document)).toBe(true);
    expect(service.parse(document).root).toBeDefined();
  });

  it("does not fingerprint a non-simulation JSON document", () => {
    // Given - arbitrary JSON
    const document = doc(`{"hello":"world"}`);
    // Then - the D3 fingerprint rejects it
    expect(service.isSimulation(document)).toBe(false);
  });
});
