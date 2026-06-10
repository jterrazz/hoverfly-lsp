import { describe, expect, it } from "vitest";

import {
  MATCHER_PANIC_NOTES,
  MATCHER_SPECS,
  REGISTRY_MATCHER_NAMES,
  TRANSFORMING_MATCHER_NAMES,
} from "../../src/registry/matchers.js";

describe("MATCHER_SPECS", () => {
  it("has exactly 15 specs (14 registry matchers + the form pseudo-matcher)", () => {
    // Then - the count is frozen per the task spec
    expect(MATCHER_SPECS).toHaveLength(15);
  });

  it("has no duplicate matcher names", () => {
    // Given - the set of names
    const names = MATCHER_SPECS.map((spec) => spec.name);
    // Then - the unique set is the same size
    expect(new Set(names).size).toBe(names.length);
  });

  it("contains every documented registry matcher name (incl. the empty default)", () => {
    // Given - the canonical registry spellings from report 07 §1
    const expected = [
      "",
      "exact",
      "negate",
      "glob",
      "regex",
      "xml",
      "xmltemplated",
      "xpath",
      "json",
      "jsonpartial",
      "jsonpath",
      "jwt",
      "jwtjsonpath",
      "array",
    ];
    // Then - all present
    const names = new Set(MATCHER_SPECS.map((spec) => spec.name));
    for (const name of expected) {
      expect(names.has(name)).toBe(true);
    }
  });

  it("uses the negate registry key, NOT negation (spelling trap)", () => {
    // Then - the negation matcher's key is `negate`
    const names = MATCHER_SPECS.map((spec) => spec.name);
    expect(names).toContain("negate");
    expect(names).not.toContain("negation");
  });

  it("REGISTRY_MATCHER_NAMES has 14 entries (excludes the form pseudo-matcher)", () => {
    // Then - form is excluded
    expect(REGISTRY_MATCHER_NAMES).toHaveLength(14);
    expect(REGISTRY_MATCHER_NAMES).not.toContain("form");
  });

  it("array supportsConfig with exactly the 3 documented config keys", () => {
    // Given - the array spec
    const array = MATCHER_SPECS.find((spec) => spec.name === "array");
    // Then - it supports config with the three boolean keys
    expect(array?.supportsConfig).toBe(true);
    expect(array?.configKeys).toEqual(["ignoreUnknown", "ignoreOrder", "ignoreOccurrences"]);
    expect(array?.valueTypes).toEqual(["array"]);
  });

  it("array is the ONLY matcher that supports config", () => {
    // Then - exactly one supportsConfig spec, and it is array
    const withConfig = MATCHER_SPECS.filter((spec) => spec.supportsConfig);
    expect(withConfig).toHaveLength(1);
    expect(withConfig[0]?.name).toBe("array");
  });

  it("form is body-only, case-sensitive, and takes an object value", () => {
    // Given - the form spec
    const form = MATCHER_SPECS.find((spec) => spec.name === "form");
    // Then - the load-bearing flags hold (D8)
    expect(form?.bodyOnly).toBe(true);
    expect(form?.caseSensitiveLookup).toBe(true);
    expect(form?.valueTypes).toEqual(["object"]);
  });

  it("every registry matcher is case-insensitive; only form is case-sensitive", () => {
    // Then - exactly one case-sensitive spec, and it is form
    const caseSensitive = MATCHER_SPECS.filter((spec) => spec.caseSensitiveLookup);
    expect(caseSensitive).toHaveLength(1);
    expect(caseSensitive[0]?.name).toBe("form");
  });

  it("only jsonpath/xpath/jwt/jwtjsonpath transform the value for doMatch", () => {
    // Then - the four extracting matchers, no more no less
    expect([...TRANSFORMING_MATCHER_NAMES].sort()).toEqual(
      ["jsonpath", "jwt", "jwtjsonpath", "xpath"].sort(),
    );
  });

  it("jsonpath doMatchTransforms is true; exact doMatchTransforms is false", () => {
    // Given - the two contrasting specs
    const jsonpath = MATCHER_SPECS.find((spec) => spec.name === "jsonpath");
    const exact = MATCHER_SPECS.find((spec) => spec.name === "exact");
    // Then - jsonpath extracts, exact is identity
    expect(jsonpath?.doMatchTransforms).toBe(true);
    expect(exact?.doMatchTransforms).toBe(false);
  });

  it("negate has vacuous-true wrong-type behaviour (silent logic inversion)", () => {
    // Given - the negate spec
    const negate = MATCHER_SPECS.find((spec) => spec.name === "negate");
    // Then - non-string value matches vacuously
    expect(negate?.wrongTypeBehavior).toBe("vacuous-true");
  });

  it("exposes the three documented panic-path notes (D8)", () => {
    // Then - the validators have the panic constants to reference
    expect(MATCHER_PANIC_NOTES.unknownMatcher).toMatch(/panic/i);
    expect(MATCHER_PANIC_NOTES.configOnNonArray).toMatch(/panic/i);
    expect(MATCHER_PANIC_NOTES.nonBoolArrayConfigValue).toMatch(/panic/i);
    expect(MATCHER_PANIC_NOTES.formWrongCaseOrPlacement).toMatch(/panic/i);
  });

  it("every spec carries a docs.hoverfly.io link", () => {
    // Then - hover docs are wired for each entry
    for (const spec of MATCHER_SPECS) {
      expect(spec.docs).toContain("docs.hoverfly.io");
    }
  });
});
