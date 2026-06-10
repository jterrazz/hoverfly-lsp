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

  it("flags a structurally-broken simulation with the expected schema diagnostics", async () => {
    // Given - pairs as an object, missing meta.schemaVersion, and a root extra property
    const text = `{"data":{"pairs":{}},"meta":{},"extra":1}`;
    // When - validated
    const diagnostics = await service.doValidation(doc(text));
    const messages = diagnostics.map((d) => d.message);
    // Then - each structural problem is reported
    expect(messages).toContain('Incorrect type. Expected "array".');
    expect(messages).toContain('Missing property "schemaVersion".');
    expect(messages.some((m) => m.includes("extra") && m.includes("not allowed"))).toBe(true);
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
