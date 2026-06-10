import { describe, expect, it } from "vitest";

import {
  FAKER_NAMES,
  FAKER_PARAMETERIZED_PANICS,
  GOFAKEIT_VERSION,
} from "../../src/registry/faker.js";

describe("FAKER_NAMES", () => {
  it("has exactly 210 names (gofakeit v6.28.0 zero-arg methods)", () => {
    // Then - the frozen count from report 08 §3.3
    expect(FAKER_NAMES).toHaveLength(210);
  });

  it("has no duplicate names", () => {
    // Given - the names
    // Then - all unique
    expect(new Set(FAKER_NAMES).size).toBe(FAKER_NAMES.length);
  });

  it("contains Email and UUID exactly as spelled in the report", () => {
    // Then - case-sensitive spot-checks
    expect(FAKER_NAMES).toContain("Email");
    expect(FAKER_NAMES).toContain("UUID");
    expect(FAKER_NAMES).toContain("Name");
    expect(FAKER_NAMES).toContain("IPv4Address");
    expect(FAKER_NAMES).toContain("SSN");
  });

  it("does NOT contain parameterized methods like Number", () => {
    // Then - Number/Sentence/Password/Regex are excluded (they panic when zero-arg called)
    expect(FAKER_NAMES).not.toContain("Number");
    expect(FAKER_NAMES).not.toContain("Sentence");
    expect(FAKER_NAMES).not.toContain("Password");
    expect(FAKER_NAMES).not.toContain("Regex");
  });

  it("names are case-sensitive exact spellings (no lowercase variants)", () => {
    // Then - the lowercase form is absent
    expect(FAKER_NAMES).not.toContain("email");
    expect(FAKER_NAMES).not.toContain("uuid");
  });
});

describe("FAKER_PARAMETERIZED_PANICS", () => {
  it("lists the known panic-on-zero-arg methods from the report", () => {
    // Then - Number, Sentence, Password, Regex are flagged
    expect(FAKER_PARAMETERIZED_PANICS).toContain("Number");
    expect(FAKER_PARAMETERIZED_PANICS).toContain("Sentence");
    expect(FAKER_PARAMETERIZED_PANICS).toContain("Password");
    expect(FAKER_PARAMETERIZED_PANICS).toContain("Regex");
  });

  it("does not overlap with the valid zero-arg FAKER_NAMES", () => {
    // Then - no name is both valid and a panic
    const valid = new Set(FAKER_NAMES);
    for (const name of FAKER_PARAMETERIZED_PANICS) {
      expect(valid.has(name)).toBe(false);
    }
  });
});

describe("GOFAKEIT_VERSION", () => {
  it("is the pinned 6.28.0", () => {
    // Then - matches the go.mod pin (report 08 §3.1)
    expect(GOFAKEIT_VERSION).toBe("6.28.0");
  });
});
