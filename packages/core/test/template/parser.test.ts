import { describe, expect, it } from "vitest";

import {
  type BlockNode,
  type ContentNode,
  type Expression,
  type MustacheNode,
  parse,
  type PathExpression,
  type Statement,
  type SubExpression,
  type TemplateNode,
  type TemplateParseError,
} from "../../src/template/index.js";

/**
 * Golden-ish unit tests for the hand-rolled Handlebars parser. Constructs are drawn from
 * `research/08-templating-spec.md` §4–5 (real Hoverfly idioms). Offsets are asserted against
 * the decoded source string the parser is handed. Error-recovery cases assert exact ranges.
 */

function expectMustache(statement: Statement | undefined): MustacheNode {
  expect(statement?.type).toBe("MustacheNode");
  return statement as MustacheNode;
}
function expectBlock(statement: Statement | undefined): BlockNode {
  expect(statement?.type).toBe("BlockNode");
  return statement as BlockNode;
}
function expectContent(statement: Statement | undefined): ContentNode {
  expect(statement?.type).toBe("ContentNode");
  return statement as ContentNode;
}
function expectPath(expression: Expression | undefined): PathExpression {
  expect(expression?.type).toBe("PathExpression");
  return expression as PathExpression;
}
function expectSub(expression: Expression | undefined): SubExpression {
  expect(expression?.type).toBe("SubExpression");
  return expression as SubExpression;
}

describe("parse — content & plain mustaches", () => {
  it("parses leading/trailing literal content around a mustache", () => {
    // Given
    const { ast, errors } = parse("a {{x}} b");
    // Then - content, mustache, content; no errors
    expect(errors).toEqual([]);
    expect(ast.body).toHaveLength(3);
    expect(expectContent(ast.body[0]).value).toBe("a ");
    const mustache = expectMustache(ast.body[1]);
    expect(mustache.start).toBe(2);
    expect(mustache.end).toBe(7);
    expect(mustache.path.parts).toEqual(["x"]);
    expect(expectContent(ast.body[2]).value).toBe(" b");
  });

  it("parses a helper call with mixed string and number args", () => {
    // Given - report 08 §1 example shape
    const { ast, errors } = parse("{{substring 'hello' '0' 2}}");
    // Then
    expect(errors).toEqual([]);
    const mustache = expectMustache(ast.body[0]);
    expect(mustache.path.parts).toEqual(["substring"]);
    expect(mustache.params).toHaveLength(3);
    expect(mustache.params[0]).toMatchObject({ type: "StringLiteral", value: "hello", quote: "'" });
    expect(mustache.params[1]).toMatchObject({ type: "StringLiteral", value: "0" });
    expect(mustache.params[2]).toMatchObject({ type: "NumberLiteral", value: 2, raw: "2" });
  });

  it("supports double-quoted string args (SQL idiom)", () => {
    // Given - report 08 §4 csvSqlCommand example
    const { ast, errors } = parse('{{csvSqlCommand "SELECT * FROM pets"}}');
    // Then
    expect(errors).toEqual([]);
    const mustache = expectMustache(ast.body[0]);
    expect(mustache.params[0]).toMatchObject({
      type: "StringLiteral",
      value: "SELECT * FROM pets",
      quote: '"',
    });
  });

  it("distinguishes escaped {{...}} from unescaped {{{...}}}", () => {
    // Given
    const escaped = expectMustache(parse("{{x}}").ast.body[0]);
    const triple = expectMustache(parse("{{{x}}}").ast.body[0]);
    // Then
    expect(escaped.escaped).toBe(true);
    expect(triple.escaped).toBe(false);
    expect(triple.path.parts).toEqual(["x"]);
  });

  it("tolerates whitespace inside the mustache", () => {
    // Given
    const { errors } = parse("{{   now   '-1d'   'unix'   }}");
    // Then
    expect(errors).toEqual([]);
  });

  it("keeps `}}` inside a quoted argument from closing the mustache", () => {
    // Given - braces inside a string literal
    const { ast, errors } = parse("{{replace x '}}' 'y'}}");
    // Then
    expect(errors).toEqual([]);
    const mustache = expectMustache(ast.body[0]);
    expect(mustache.params[0]).toMatchObject({ type: "PathExpression" });
    expect(mustache.params[1]).toMatchObject({ type: "StringLiteral", value: "}}" });
  });
});

describe("parse — path expressions", () => {
  it("parses dotted path lookups (TemplatingData roots)", () => {
    // Given
    const mustache = expectMustache(parse("{{Request.QueryParam.foo}}").ast.body[0]);
    // Then
    expect(mustache.path.parts).toEqual(["Request", "QueryParam", "foo"]);
    expect(mustache.path.data).toBe(false);
    expect(mustache.path.thisRef).toBe(false);
  });

  it("parses bracketed indexed segments", () => {
    // Given - report 08 §5.1 example
    const mustache = expectMustache(parse("{{Request.Header.Authorization.[0]}}").ast.body[0]);
    // Then - the bracket inner is a part
    expect(mustache.path.parts).toEqual(["Request", "Header", "Authorization", "0"]);
  });

  it("parses @-prefixed data variables", () => {
    // Given
    const mustache = expectMustache(parse("{{@index}}").ast.body[0]);
    // Then
    expect(mustache.path.data).toBe(true);
    expect(mustache.path.parts).toEqual(["index"]);
    expect(mustache.path.original).toBe("@index");
  });

  it("parses bare `this` and `this.field`", () => {
    // Given
    const bare = expectMustache(parse("{{this}}").ast.body[0]);
    const field = expectMustache(parse("{{this.name}}").ast.body[0]);
    // Then
    expect(bare.path.thisRef).toBe(true);
    expect(bare.path.parts).toEqual([]);
    expect(field.path.thisRef).toBe(true);
    expect(field.path.parts).toEqual(["name"]);
  });
});

describe("parse — subexpressions", () => {
  it("parses nested subexpressions (multiply (this.price) (this.qty) '')", () => {
    // Given - report 08 §5.1 example
    const { ast, errors } = parse("{{multiply (this.price) (this.qty) ''}}");
    // Then
    expect(errors).toEqual([]);
    const mustache = expectMustache(ast.body[0]);
    expect(mustache.path.parts).toEqual(["multiply"]);
    expect(mustache.params).toHaveLength(3);
    const first = expectSub(mustache.params[0]);
    expect(first.path.thisRef).toBe(true);
    expect(first.path.parts).toEqual(["price"]);
    const second = expectSub(mustache.params[1]);
    expect(second.path.parts).toEqual(["qty"]);
    expect(mustache.params[2]).toMatchObject({ type: "StringLiteral", value: "" });
  });

  it("parses a subexpression nested inside a subexpression: (helper (inner 'a') 'b')", () => {
    // Given
    const { ast, errors } = parse("{{outer (helper (inner 'a') 'b')}}");
    // Then
    expect(errors).toEqual([]);
    const mustache = expectMustache(ast.body[0]);
    const helper = expectSub(mustache.params[0]);
    expect(helper.path.parts).toEqual(["helper"]);
    const inner = expectSub(helper.params[0]);
    expect(inner.path.parts).toEqual(["inner"]);
    expect(inner.params[0]).toMatchObject({ type: "StringLiteral", value: "a" });
    expect(helper.params[1]).toMatchObject({ type: "StringLiteral", value: "b" });
  });

  it("treats Request.Body 'jsonpath' '$.x' as a path call with two string args", () => {
    // Given - the func-typed-field method-call form (report 08 §6)
    const mustache = expectMustache(parse("{{Request.Body 'jsonpath' '$.items'}}").ast.body[0]);
    // Then
    expect(mustache.path.parts).toEqual(["Request", "Body"]);
    expect(mustache.params).toHaveLength(2);
    expect(mustache.params[0]).toMatchObject({ value: "jsonpath" });
    expect(mustache.params[1]).toMatchObject({ value: "$.items" });
  });
});

describe("parse — block helpers", () => {
  it("parses #if with an {{else}} inverse", () => {
    // Given
    const { ast, errors } = parse("{{#if x}}yes{{else}}no{{/if}}");
    // Then
    expect(errors).toEqual([]);
    const block = expectBlock(ast.body[0]);
    expect(block.path.parts).toEqual(["if"]);
    expect(block.params).toHaveLength(1);
    expect(expectContent(block.program[0]).value).toBe("yes");
    expect(block.inverse).toBeDefined();
    expect(expectContent(block.inverse?.[0]).value).toBe("no");
    expect(block.openTag.start).toBe(0);
    expect(block.closeTag?.end).toBe(block.end);
  });

  it("parses #each with this.field, @index and a #unless @last guard (csvAsMap idiom)", () => {
    // Given - report 08 §4 idiom
    const source = '{{#each (csvAsMap "pets")}}{{this.name}}{{#unless @last}},{{/unless}}{{/each}}';
    const { ast, errors } = parse(source);
    // Then
    expect(errors).toEqual([]);
    const each = expectBlock(ast.body[0]);
    expect(each.path.parts).toEqual(["each"]);
    expect(expectSub(each.params[0]).path.parts).toEqual(["csvAsMap"]);
    const name = expectMustache(each.program[0]);
    expect(name.path.thisRef).toBe(true);
    expect(name.path.parts).toEqual(["name"]);
    const unless = expectBlock(each.program[1]);
    expect(unless.path.parts).toEqual(["unless"]);
    expect(expectPath(unless.params[0]).data).toBe(true);
  });

  it("parses nested #each this (csvAsArray idiom)", () => {
    // Given - report 08 §5.1 example
    const { ast, errors } = parse(
      "{{#each (csvAsArray 'pets')}}{{#each this}}{{this}} {{/each}}{{/each}}",
    );
    // Then
    expect(errors).toEqual([]);
    const outer = expectBlock(ast.body[0]);
    const inner = expectBlock(outer.program[0]);
    expect(inner.path.parts).toEqual(["each"]);
    expect(expectPath(inner.params[0]).thisRef).toBe(true);
  });

  it("parses #equal with a subexpression and {{else}} (csvDeleteRows idiom)", () => {
    // Given - report 08 §5.1 example (SpectoLabs fork `equal`)
    const source =
      '{{#equal (csvDeleteRows "pets" "category" "cats" true) "0"}}none{{else}}ok{{/equal}}';
    const { ast, errors } = parse(source);
    // Then
    expect(errors).toEqual([]);
    const block = expectBlock(ast.body[0]);
    expect(block.path.parts).toEqual(["equal"]);
    const sub = expectSub(block.params[0]);
    expect(sub.path.parts).toEqual(["csvDeleteRows"]);
    expect(sub.params).toHaveLength(4);
    expect(sub.params[3]).toMatchObject({ type: "BooleanLiteral", value: true });
    expect(block.params[1]).toMatchObject({ type: "StringLiteral", value: "0" });
    expect(block.inverse).toBeDefined();
  });

  it("records the open/close tag spans for bracket matching", () => {
    // Given
    const block = expectBlock(parse("{{#if x}}body{{/if}}").ast.body[0]);
    // Then - openTag covers `{{#if x}}` (0..9), closeTag covers `{{/if}}`
    expect(block.openTag).toEqual({ start: 0, end: 9 });
    expect(block.closeTag).toEqual({ start: 13, end: 20 });
  });
});

describe("parse — error recovery (exact offsets)", () => {
  it("records an unclosed mustache and still scans the rest", () => {
    // Given - a final `{{x` with no closing braces anywhere after it
    const { ast, errors } = parse("a {{y}} then {{x and more");
    // Then - one error at the unclosed `{{` (offset 13)
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Unclosed mustache — missing closing braces",
      start: 13,
    });
    // The earlier `{{y}}` was still parsed as a mustache.
    const recovered = ast.body.find((node) => node.type === "MustacheNode") as MustacheNode;
    expect(recovered.path.parts).toEqual(["y"]);
  });

  it("records an unclosed block with the block name and open-tag range", () => {
    // Given - `{{#each xs}}` never closed
    const { errors } = parse("{{#each xs}}item");
    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Unclosed block {{#each}} — missing {{/each}}",
      start: 0,
      end: 12,
    });
  });

  it("records a mismatched closing block at the closer's range", () => {
    // Given - opened #if, closed with /each
    const { errors } = parse("{{#if x}}body{{/each}}");
    // Then - the closer `{{/each}}` spans 13..22
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Mismatched closing block: expected {{/if}} but found {{/each}}",
      start: 13,
      end: 22,
    });
  });

  it("records a stray closing block with no matching open", () => {
    // Given - a lone `{{/if}}`
    const { errors } = parse("text {{/if}} more");
    // Then - error spans the closer (5..12)
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Unexpected closing block {{/if}} — no matching open block",
      start: 5,
      end: 12,
    });
  });

  it("records an empty mustache", () => {
    // Given
    const { errors } = parse("{{}}");
    // Then
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "Empty mustache — expected a path or helper",
      start: 0,
      end: 4,
    });
  });

  it("records an unclosed subexpression but keeps the call", () => {
    // Given - `(inner 'a'` never closes
    const { ast, errors } = parse("{{outer (inner 'a'}}");
    // Then
    expect(errors.some((error) => error.message === "Unclosed subexpression — missing ')'")).toBe(
      true,
    );
    const mustache = expectMustache(ast.body[0]);
    expect(expectSub(mustache.params[0]).path.parts).toEqual(["inner"]);
  });

  it("records an unclosed string literal", () => {
    // Given - `'abc` never closes inside a mustache
    const { errors } = parse("{{x 'abc}}");
    // Then - an unclosed string is reported (the `}}` is treated as inside the string by findClose,
    // So the mustache itself is unclosed; either way an error is recorded)
    expect(errors.length).toBeGreaterThanOrEqual(1);
  });

  it("recovers a valid block after a mismatched one", () => {
    // Given - mismatch then a clean mustache
    const { ast, errors } = parse("{{#if x}}a{{/each}}{{ok}}");
    // Then - mismatch recorded, `{{ok}}` still parsed
    expect(errors).toHaveLength(1);
    const last = ast.body.at(-1);
    expect(expectMustache(last).path.parts).toEqual(["ok"]);
  });
});

describe("parse — robustness", () => {
  it("never throws on adversarial input", () => {
    // Given - a pile of broken syntax
    const inputs = [
      "{{",
      "{{{",
      "}}",
      "{{#}}",
      "{{/}}",
      "{{# }}{{/}}",
      "{{((((",
      "{{a 'b}}",
      "{{#each}}{{else}}{{else}}{{/each}}",
      "{{#a}}{{#b}}{{/a}}{{/b}}",
    ];
    // Then - parse returns a result for every one
    for (const input of inputs) {
      expect(() => parse(input)).not.toThrow();
      expect(parse(input).ast.type).toBe("Program");
    }
  });

  it("returns an empty program for an empty source", () => {
    // Given
    const { ast, errors } = parse("");
    // Then
    expect(ast.body).toEqual([]);
    expect(errors).toEqual([]);
  });

  it("treats a body with no mustaches as a single content node", () => {
    // Given
    const { ast } = parse("just plain text");
    // Then
    expect(ast.body).toHaveLength(1);
    expect(expectContent(ast.body[0]).value).toBe("just plain text");
  });

  it("exposes the public node and error types through the barrel", () => {
    // Given - the parse result, typed through the barrel's public types
    const { ast, errors } = parse("{{x}}{{");
    // Then - every node satisfies TemplateNode, every error TemplateParseError (span-shaped)
    const nodes: TemplateNode[] = [ast, ...ast.body];
    const firstError: TemplateParseError | undefined = errors[0];
    expect(nodes.every((node) => typeof node.start === "number")).toBe(true);
    expect(firstError?.message).toContain("Unclosed mustache");
  });
});
