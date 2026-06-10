import { describe, expect, it } from "vitest";

import { expectHover, getHoverText } from "../fourslash/harness.js";

/**
 * Hover on tokens INSIDE templated strings: helper names, faker type names, and `Request.*`
 * members. Driven through the full service (`doHover`), so these exercise the location bridge and
 * the decoded↔document range mapping. All rendered facts must trace back to the registry / member
 * data (no hardcoded copy in the provider).
 */

function templatedBody(body: string): string {
  return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

describe("template hover — helpers", () => {
  it("shows signature, arity, kind and example for an inline helper", async () => {
    // Given - the cursor on the `replace` helper name
    const doc = templatedBody("{{replac⟦⟧e (Request.Body 'jsonpath' '$.x') 'a' 'b'}}");
    // Then - the hover sources signature + docs + example from the registry
    await expectHover(doc, "", {
      includes: ["replace", "inline helper", "Arity:", "Example:"],
    });
  });

  it("marks raymond built-ins and block-vs-inline", async () => {
    // Given - the cursor on the `each` block built-in
    const doc = templatedBody("{{#eac⟦⟧h items}}{{this}}{{/each}}");
    // Then - block + builtin are surfaced
    await expectHover(doc, "", { includes: ["each", "block helper", "raymond built-in"] });
  });

  it("shows zero-arg helpers (no asCall needed) on a bare mustache", async () => {
    // Given - a bare zero-arg helper used inline
    const doc = templatedBody("{{randomUui⟦⟧d}}");
    await expectHover(doc, "", { includes: ["randomUuid", "inline helper"] });
  });
});

describe("template hover — faker", () => {
  it("describes a known faker type as a zero-arg gofakeit method with the version", async () => {
    // Given - the cursor inside the faker type string
    const doc = templatedBody("{{faker 'Em⟦⟧ail'}}");
    // Then - the hover names gofakeit + the pinned version
    await expectHover(doc, "", { includes: ["faker", "gofakeit", "6.28.0"] });
  });

  it("warns when a parameterized faker method is used zero-arg (panics)", async () => {
    // Given - `Number` is a parameterized gofakeit method that panics with no args
    const doc = templatedBody("{{faker 'Num⟦⟧ber'}}");
    // Then - the hover flags the panic risk
    await expectHover(doc, "", { includes: ["Number", "panic"] });
  });
});

describe("template hover — Request members", () => {
  it("documents Request.Body with the kubectl-JSONPath / xsel dialect note", async () => {
    // Given - the cursor on the Request.Body method-call form
    const doc = templatedBody("{{Request.Bod⟦⟧y 'jsonpath' '$.id'}}");
    // Then - the hover surfaces the method-call form and the dialect note (report 08 §6)
    await expectHover(doc, "", {
      includes: ["Request.Body", "method call", "kubectl", "xsel"],
    });
  });

  it("documents a Request scalar field", async () => {
    // Given - the cursor on Request.Method
    const doc = templatedBody("{{Request.Meth⟦⟧od}}");
    await expectHover(doc, "", { includes: ["Request.Method", "field"] });
  });
});

describe("template hover — negatives", () => {
  it("does not render template hover for a token that is not a known helper/member", async () => {
    // Given - a bare unknown single-segment lookup (could be a context var; not a helper)
    const doc = templatedBody("{{somethingUnknow⟦⟧n}}");
    // Then - no template-specific hover fires (schema hover may still describe the `body` field,
    // But none of the template markers — helper/faker/Request docs — appear)
    const text = await getHoverText(doc, "");
    expect(text).not.toContain("inline helper");
    expect(text).not.toContain("gofakeit");
    expect(text).not.toContain("Request.");
  });

  it("does not render template hover in a plain non-templated body", async () => {
    // Given - a non-templated body with no `{{` (schema hover still describes the field)
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"plain te⟦⟧xt"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    const text = await getHoverText(doc, "");
    expect(text).not.toContain("inline helper");
    expect(text).not.toContain("gofakeit");
  });
});
