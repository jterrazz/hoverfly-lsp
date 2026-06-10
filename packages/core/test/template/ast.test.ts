import { describe, expect, it } from "vitest";

import {
  type BooleanLiteral,
  type NumberLiteral,
  parse,
  type ParseResult,
  type Program,
  type Span,
  type StringLiteral,
} from "../../src/template/index.js";

/**
 * Type-anchored assertions over the AST the parser produces: every node is a {@link Span}
 * (`start`/`end` offsets), the {@link Program} root and {@link ParseResult} shape are stable,
 * and the three literal node kinds ({@link StringLiteral}, {@link NumberLiteral},
 * {@link BooleanLiteral}) carry their parsed values. These pin the public AST surface the HF5xx
 * rules consume.
 */
describe("AST shapes", () => {
  it("produces a Program root carrying a full-source span", () => {
    // Given - a small template
    const source = "x {{y}}";
    const result: ParseResult = parse(source);
    const program: Program = result.ast;
    // Then - the root spans the whole decoded source
    expect(program.type).toBe("Program");
    expect(program.start).toBe(0);
    expect(program.end).toBe(source.length);
  });

  it("gives every node a half-open [start, end) span", () => {
    // Given
    const { ast } = parse("a{{b}}c");
    // Then - each statement is a valid Span with end > start
    for (const node of ast.body) {
      const span: Span = node;
      expect(span.end).toBeGreaterThan(span.start);
    }
  });

  it("parses string, number, and boolean literals into typed nodes", () => {
    // Given - one of each literal kind as helper args
    const { ast } = parse("{{h 'txt' -1.5 true}}");
    const mustache = ast.body[0];
    if (mustache?.type !== "MustacheNode") {
      throw new Error("expected a mustache");
    }
    const [string_, number_, boolean_] = mustache.params;

    // Then - StringLiteral
    expect(string_?.type).toBe("StringLiteral");
    const stringLiteral = string_ as StringLiteral;
    expect(stringLiteral.value).toBe("txt");
    expect(stringLiteral.quote).toBe("'");

    // Then - NumberLiteral (negative, fractional)
    expect(number_?.type).toBe("NumberLiteral");
    const numberLiteral = number_ as NumberLiteral;
    expect(numberLiteral.value).toBe(-1.5);
    expect(numberLiteral.raw).toBe("-1.5");

    // Then - BooleanLiteral
    expect(boolean_?.type).toBe("BooleanLiteral");
    const booleanLiteral = boolean_ as BooleanLiteral;
    expect(booleanLiteral.value).toBe(true);
  });
});
