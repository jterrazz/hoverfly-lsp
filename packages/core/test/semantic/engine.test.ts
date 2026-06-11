import { describe, expect, it } from "vitest";
import { type Diagnostic, DiagnosticSeverity } from "vscode-languageserver-types";

import { applyHF102Layer, runRules, sortByRange } from "../../src/semantic/engine.js";
import type { RuleContext, SemanticRule } from "../../src/semantic/types.js";

function range(line: number, startChar: number, endChar: number): Diagnostic["range"] {
  return { start: { line, character: startChar }, end: { line, character: endChar } };
}

function diag(code: string, r: Diagnostic["range"]): Diagnostic {
  return { code, range: r, message: code, severity: DiagnosticSeverity.Error };
}

describe("runRules", () => {
  it("concatenates rule output", () => {
    // Given - two rules each producing one diagnostic
    const a: SemanticRule = { codes: ["HF103"], run: () => [diag("HF103", range(0, 0, 1))] };
    const b: SemanticRule = { codes: ["HF104"], run: () => [diag("HF104", range(1, 0, 1))] };
    // When - run together
    const out = runRules([a, b], {} as RuleContext);
    // Then - both appear
    expect(out.map((d) => d.code)).toEqual(["HF103", "HF104"]);
  });

  it("swallows a throwing rule rather than failing the pass", () => {
    // Given - a rule that throws and a healthy rule
    const bad: SemanticRule = {
      codes: ["HF103"],
      run: () => {
        throw new Error("boom");
      },
    };
    const good: SemanticRule = { codes: ["HF104"], run: () => [diag("HF104", range(0, 0, 1))] };
    // When - run together
    const out = runRules([bad, good], {} as RuleContext);
    // Then - only the healthy rule's output survives
    expect(out.map((d) => d.code)).toEqual(["HF104"]);
  });
});

describe("applyHF102Layer", () => {
  it("re-tags every schema diagnostic as HF102 with hoverfly source", () => {
    // Given - a raw schema diagnostic with its own code/source
    const schema: Diagnostic = {
      ...diag("0", range(2, 4, 9)),
      message: 'Incorrect type. Expected "array".',
      source: "json",
    };
    // When - the HF102 layer runs with no semantic diagnostics
    const out = applyHF102Layer([schema], []);
    // Then - it is re-tagged but keeps its message/range
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("HF102");
    expect(out[0]?.source).toBe("hoverfly");
    expect(out[0]?.message).toBe('Incorrect type. Expected "array".');
    expect(out[0]?.codeDescription?.href).toContain("hf102");
  });

  it("suppresses a schema diagnostic overlapping an HF2xx semantic diagnostic", () => {
    // Given - a schema diagnostic and an HF2xx diagnostic on the same node range
    const node = range(3, 10, 17);
    const schema = diag("0", node);
    const matcher = diag("HF201", node);
    // When - the layer runs
    const out = applyHF102Layer([schema], [matcher]);
    // Then - the noisy schema diagnostic is dropped (the amazon-states lesson)
    expect(out).toEqual([]);
  });

  it("keeps a schema diagnostic that overlaps a non-suppressing semantic diagnostic", () => {
    // Given - a schema diagnostic overlapping an HF1xx (non-suppressing) diagnostic
    const node = range(3, 10, 17);
    const out = applyHF102Layer([diag("0", node)], [diag("HF104", node)]);
    // Then - only the suppressing set (HF2xx + value-shape codes) de-noises schema, so it survives
    expect(out).toHaveLength(1);
    expect(out[0]?.code).toBe("HF102");
  });

  it.each(["HF308", "HF404", "HF405"])(
    "suppresses a schema diagnostic overlapping a value-shape %s diagnostic",
    (code) => {
      // Given - a schema diagnostic and a value-shape error on the same node (a re-stated 400)
      const node = range(4, 8, 20);
      const out = applyHF102Layer([diag("0", node)], [diag(code, node)]);
      // Then - the noisy schema passthrough is dropped in favour of the targeted message
      expect(out).toEqual([]);
    },
  );
});

describe("sortByRange", () => {
  it("orders by start line, then character, then end", () => {
    // Given - diagnostics out of order
    const list = [
      diag("c", range(1, 0, 1)),
      diag("a", range(0, 2, 3)),
      diag("b", range(0, 2, 5)),
      diag("z", range(0, 0, 1)),
    ];
    // When - sorted
    const out = sortByRange(list).map((d) => d.code);
    // Then - ascending by position
    expect(out).toEqual(["z", "a", "b", "c"]);
  });
});
