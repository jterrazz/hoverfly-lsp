/**
 * Unit tests for the template analyzer (`src/template/analyzer.ts`). Pure: they call
 * {@link analyze} on a DECODED template string and assert the HF502–HF509 findings, their
 * template-relative offsets, and — crucially — the no-false-positive precision rules
 * (path lookups are not unknown helpers; dynamic faker args are not flagged; etc.).
 */

import { describe, expect, it } from "vitest";

import {
  analyze,
  type AnalyzerContext,
  type TemplateFinding,
} from "../../src/template/analyzer.js";

/** A context with the given variable/literal names declared. */
function ctx(variables: string[] = [], literals: string[] = []): AnalyzerContext {
  return { variableNames: new Set(variables), literalNames: new Set(literals) };
}

/** The kinds emitted, for terse assertions. */
function kinds(findings: TemplateFinding[]): string[] {
  return findings.map((f) => f.kind);
}

describe("HF502 — parse errors", () => {
  it("reports an unclosed mustache", () => {
    // Given - a template missing its closing braces
    const findings = analyze("hello {{name");
    // Then - one HF502 finding carrying the parser message
    expect(kinds(findings)).toContain("HF502");
    const error = findings.find((f) => f.kind === "HF502");
    expect(error?.args.message).toContain("Unclosed mustache");
  });

  it("reports an unclosed block", () => {
    // Given - a block helper that is never closed
    const findings = analyze("{{#each xs}}{{this}}");
    // Then - an HF502 finding fires
    expect(kinds(findings)).toContain("HF502");
  });

  it("reports a mismatched closing block", () => {
    // Given - an #if closed as /each
    const findings = analyze("{{#if x}}a{{/each}}");
    // Then - an HF502 finding fires
    expect(kinds(findings)).toContain("HF502");
  });

  it("produces no findings for a plain literal", () => {
    // Given - text with no template syntax
    // Then - nothing fires
    expect(analyze("just some text")).toEqual([]);
  });
});

describe("HF503 — unknown helper (precision: only flag calls)", () => {
  it("flags an unknown helper called with arguments", () => {
    // Given - a bare identifier WITH an argument (only helpers take args)
    const findings = analyze("{{bogus 'x'}}");
    // Then - HF503 on the helper name
    expect(kinds(findings)).toEqual(["HF503"]);
    expect(findings[0]?.args.name).toBe("bogus");
    // And - the offset points at the helper name (after the `{{`)
    expect(findings[0]?.start).toBe(2);
  });

  it("flags an unknown block-open helper", () => {
    // Given - an unknown helper opened as a block
    const findings = analyze("{{#bogus}}a{{/bogus}}");
    // Then - HF503 fires (a block open is unambiguously a helper call)
    expect(kinds(findings)).toContain("HF503");
  });

  it("flags an unknown subexpression head", () => {
    // Given - an unknown helper used as a subexpression
    const findings = analyze("{{concat (bogus 'x')}}");
    // Then - HF503 fires for the subexpression head
    expect(kinds(findings)).toEqual(["HF503"]);
    expect(findings[0]?.args.name).toBe("bogus");
  });

  it("does NOT flag a dotted path lookup like {{State.foo}}", () => {
    // Given - a State path lookup (not a helper)
    // Then - no finding
    expect(analyze("{{State.foo}}")).toEqual([]);
  });

  it("does NOT flag {{Request.Path}} or {{Request.QueryParam.x}}", () => {
    // Given - request data accessors
    // Then - nothing fires
    expect(analyze("{{Request.Path}} {{Request.QueryParam.x}}")).toEqual([]);
  });

  it("does NOT flag a bare arg-less unknown identifier (treated as a context path)", () => {
    // Given - {{something}} with no args, not a known helper — indistinguishable from a path
    // Then - no HF503 (raymond renders an empty lookup, no panic)
    expect(analyze("{{something}}")).toEqual([]);
  });

  it("accepts a bare known zero-arg helper {{randomString}}", () => {
    // Given - a registered zero-arg helper used bare
    // Then - nothing fires
    expect(analyze("{{randomString}}")).toEqual([]);
  });

  it("does NOT flag the Request.Body method-call form", () => {
    // Given - the {{Request.Body 'jsonpath' '$.x'}} method-call form
    // Then - no unknown-helper finding
    expect(analyze("{{Request.Body 'jsonpath' '$.x'}}")).toEqual([]);
  });

  it("does NOT flag @data vars or this inside #each", () => {
    // Given - @index / this used inside an #each block
    // Then - nothing fires
    expect(analyze("{{#each xs}}{{@index}}:{{this.id}}{{/each}}")).toEqual([]);
  });
});

describe("HF504 — arity / block-vs-inline misuse", () => {
  it("flags too few arguments to a fixed-arity helper", () => {
    // Given - replace requires 3 args, given 1
    const findings = analyze("{{replace 'a'}}");
    // Then - HF504 with the name and count
    expect(kinds(findings)).toEqual(["HF504"]);
    expect(findings[0]?.args.name).toBe("replace");
    expect(findings[0]?.args.n).toBe("1");
  });

  it("accepts correct arity for #equal (block, 2 args)", () => {
    // Given - #equal with its two required args
    // Then - no arity finding
    expect(analyze("{{#equal a b}}x{{else}}y{{/equal}}")).toEqual([]);
  });

  it("flags #equal with one argument", () => {
    // Given - #equal block opened with a single argument
    const findings = analyze("{{#equal a}}x{{/equal}}");
    // Then - HF504
    expect(kinds(findings)).toEqual(["HF504"]);
    expect(findings[0]?.args.name).toBe("equal");
  });

  it("flags an inline helper opened as a block", () => {
    // Given - randomString (inline) opened as a block
    const findings = analyze("{{#randomString}}x{{/randomString}}");
    // Then - HF504 block-vs-inline misuse
    expect(kinds(findings)).toEqual(["HF504"]);
    expect(findings[0]?.args.sig).toContain("inline");
  });

  it("flags a block helper used inline", () => {
    // Given - #each (block) used inline
    const findings = analyze("{{each xs}}");
    // Then - HF504 block-vs-inline misuse
    expect(kinds(findings)).toEqual(["HF504"]);
    expect(findings[0]?.args.sig).toContain("block");
  });

  it("accepts variadic concat with any number of args", () => {
    // Given - concat with 0 and with many args
    expect(analyze("{{concat}}")).toEqual([]);
    expect(analyze("{{concat 'a' 'b' 'c'}}")).toEqual([]);
  });

  it("accepts optional now args (0, 1, or 2)", () => {
    // Given - now used with 0/1/2 args
    expect(analyze("{{now}}")).toEqual([]);
    expect(analyze("{{now '-1d'}}")).toEqual([]);
    expect(analyze("{{now '-1d' 'unix'}}")).toEqual([]);
  });
});

describe("HF505 / HF506 — Vars / Literals resolution", () => {
  it("flags an unresolved Vars.X", () => {
    // Given - Vars.missing with no such variable declared
    const findings = analyze("{{Vars.missing}}", ctx(["present"]));
    // Then - HF505 with the variable name
    expect(kinds(findings)).toEqual(["HF505"]);
    expect(findings[0]?.args.x).toBe("missing");
  });

  it("resolves a declared Vars.X", () => {
    // Given - Vars.present declared in context
    // Then - nothing fires
    expect(analyze("{{Vars.present}}", ctx(["present"]))).toEqual([]);
  });

  it("flags an unresolved Literals.X", () => {
    // Given - Literals.gone with no such literal declared
    const findings = analyze("{{Literals.gone}}", ctx([], ["here"]));
    // Then - HF506
    expect(kinds(findings)).toEqual(["HF506"]);
    expect(findings[0]?.args.x).toBe("gone");
  });

  it("resolves a declared Literals.X", () => {
    // Given - Literals.here declared
    // Then - nothing fires
    expect(analyze("{{Literals.here}}", ctx([], ["here"]))).toEqual([]);
  });

  it("resolves Vars.X used as a helper argument", () => {
    // Given - an undeclared Vars used inside a helper call
    const findings = analyze("{{length Vars.nope}}", ctx());
    // Then - HF505 fires for the argument path
    expect(kinds(findings)).toEqual(["HF505"]);
    expect(findings[0]?.args.x).toBe("nope");
  });
});

describe("HF507 / HF508 — faker (string-literal arg only)", () => {
  it("accepts a valid faker name", () => {
    // Given - faker 'Name', a valid zero-arg gofakeit method
    // Then - nothing fires
    expect(analyze("{{faker 'Name'}}")).toEqual([]);
  });

  it("flags an unknown faker type (HF507)", () => {
    // Given - a misspelled faker type
    const findings = analyze("{{faker 'Nope'}}");
    // Then - HF507 with the type and the pinned version
    expect(kinds(findings)).toEqual(["HF507"]);
    expect(findings[0]?.args.t).toBe("Nope");
    expect(findings[0]?.args.version).toBe("6.28.0");
  });

  it("flags a parameterized gofakeit method (HF508)", () => {
    // Given - faker 'Number', which panics when called with no args
    const findings = analyze("{{faker 'Number'}}");
    // Then - HF508 (panic warning)
    expect(kinds(findings)).toEqual(["HF508"]);
    expect(findings[0]?.args.t).toBe("Number");
  });

  it("does NOT flag a dynamic faker arg (path)", () => {
    // Given - faker called with a path argument (unknowable statically)
    // Then - no faker finding
    expect(analyze("{{faker Vars.kind}}", ctx(["kind"]))).toEqual([]);
  });

  it("does NOT flag a faker subexpression arg", () => {
    // Given - faker called with a subexpression
    // Then - no faker finding (only the inner call is analysed)
    expect(analyze("{{faker (getValue 'k')}}")).toEqual([]);
  });
});

describe("HF509 — now offset token validation", () => {
  it("accepts valid offsets including signs and fractions", () => {
    // Given - a range of valid offsets
    for (const offset of ["", "0", "1d", "-1d", "+2h45m", "1d12h", "-1.5h", "300ms", "5µs"]) {
      // Then - none flag
      expect(analyze(`{{now '${offset}'}}`)).toEqual([]);
    }
  });

  it("flags an unsupported unit like w (week)", () => {
    // Given - 2w (weeks unsupported)
    const findings = analyze("{{now '2w'}}");
    // Then - HF509 with the offending offset
    expect(kinds(findings)).toEqual(["HF509"]);
    expect(findings[0]?.args.o).toBe("2w");
  });

  it("flags a garbage offset like 'cat'", () => {
    // Given - a non-duration string
    const findings = analyze("{{now 'cat'}}");
    // Then - HF509
    expect(kinds(findings)).toEqual(["HF509"]);
  });

  it("does NOT flag a dynamic now offset", () => {
    // Given - now called with a path offset
    // Then - no HF509 (the literal-only precision rule)
    expect(analyze("{{now Vars.off}}", ctx(["off"]))).toEqual([]);
  });
});

describe("offset fidelity", () => {
  it("points HF503 at the helper name within the mustache", () => {
    // Given - leading text then an unknown helper call
    const findings = analyze("xx {{bogus 1}}");
    // Then - start is the offset of `bogus`, end just past it
    expect(findings[0]?.start).toBe(5);
    expect(findings[0]?.end).toBe(10);
  });
});
