import { describe, expect, it } from "vitest";

import { ALL_HELPERS, FAKER_NAMES } from "../../src/registry/index.js";
import { expectCompletions, expectNoCompletions } from "../fourslash/harness.js";

/**
 * IntelliSense INSIDE templated strings — the flagship feature. These cursor-marker tests drive
 * the full service (`doComplete`), so they exercise the location bridge, the JSON-escape source
 * map, the context classifier, and the registry-sourced item builders end-to-end.
 *
 * The marker is `⟦⟧` (harness convention); it sits inside the JSON string body. A templated body
 * is `"templated": true` with a `{{…}}` body; mid-typing fixtures rely on the error-tolerant
 * classifier (the JSON stays parseable because the marker carries no special chars).
 */

const HELPER_NAMES = ALL_HELPERS.map((h) => h.name);

/** Wrap a templated response body (with `templated:true`) into a full simulation document. */
function templatedBody(body: string): string {
  return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

describe("template completion — helper/path start", () => {
  it("offers all 52+8 helpers and the path roots at a mustache head", async () => {
    // Given - a just-opened mustache in a templated body
    const doc = templatedBody("{{⟦⟧}}");
    // Then - every helper plus the data roots are offered; faker/Request both present
    await expectCompletions(doc, "", {
      contains: [...HELPER_NAMES, "Request", "State", "Vars", "Literals"],
    });
  });

  it("recovers mid-typing `{{fa` and still offers the helper list", async () => {
    // Given - a half-typed helper name with no closing braces (MID-TYPING)
    const doc = templatedBody("{{fa⟦⟧");
    // Then - completions still fire (the client filters by the typed prefix)
    await expectCompletions(doc, "", { contains: ["faker", "randomFloat"] });
  });

  it("inserts helper arguments as a snippet placeholder", async () => {
    // Given - a mustache head
    const doc = templatedBody("{{⟦⟧}}");
    // When
    const items = await expectCompletions(doc, "", { contains: ["replace"] });
    const replace = items.find((i) => i.label === "replace");
    // Then - the snippet carries the three argument placeholders (built via concatenation so the
    // Test source does not contain a literal `${…}` template placeholder)
    const open = "$".concat("{");
    expect(replace?.insertText).toContain("replace ");
    expect(replace?.insertText).toContain(`${open}1:target}`);
    expect(replace?.insertText).toContain(`${open}3:newValue}`);
  });
});

describe("template completion — path continuation", () => {
  it("offers the Request.* member list after `Request.`", async () => {
    // Given - a dotted Request path being continued
    const doc = templatedBody("{{Request.⟦⟧}}");
    // Then - the documented members appear (report 08 §6)
    await expectCompletions(doc, "", {
      contains: ["Scheme", "Method", "Host", "Path", "QueryParam", "Header", "FormData", "Body"],
      notContains: ["faker"],
    });
  });

  it("offers declared State keys after `State.`", async () => {
    // Given - a State path; the simulation declares state keys elsewhere
    const doc = `{"data":{"pairs":[
      {"request":{"path":[],"requiresState":{"cart":"full"}},"response":{"status":200,"transitionsState":{"checkout":"done"}}},
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{State.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - both the requiresState and transitionsState keys are cross-referenced
    await expectCompletions(doc, "", { contains: ["cart", "checkout"] });
  });

  it("offers declared Vars names after `Vars.`", async () => {
    // Given - data.variables declares a variable
    const doc = `{"data":{"variables":[{"name":"token","function":"randomUuid"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Vars.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then
    await expectCompletions(doc, "", { contains: ["token"] });
  });

  it("offers declared Literals names after `Literals.`", async () => {
    // Given - data.literals declares a literal
    const doc = `{"data":{"literals":[{"name":"apiBase","value":"https://x"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Literals.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
    await expectCompletions(doc, "", { contains: ["apiBase"] });
  });
});

describe("template completion — faker context", () => {
  it("offers the faker type list (contains Email, NOT Number)", async () => {
    // Given - inside the faker string arg
    const doc = templatedBody("{{faker '⟦⟧'}}");
    // Then - the zero-arg names are offered; Email present, the parameterized Number absent
    const items = await expectCompletions(doc, "", {
      contains: ["Email"],
      notContains: ["Number"],
    });
    expect(items.length).toBe(FAKER_NAMES.length);
  });
});

describe("template completion — now args", () => {
  it("offers offset examples in the now offset slot", async () => {
    // Given - cursor in the first now arg (offset)
    const doc = templatedBody("{{now '⟦⟧'}}");
    // Then - offset examples are offered
    await expectCompletions(doc, "", { contains: ["-1d", "+1h"] });
  });

  it("offers format strings in the now format slot", async () => {
    // Given - cursor in the second now arg (format)
    const doc = templatedBody("{{now '-1d' '⟦⟧'}}");
    // Then - the format examples (unix / epoch / Go layout) are offered
    await expectCompletions(doc, "", { contains: ["unix", "epoch", "2006-01-02"] });
  });
});

describe("template completion — #each scope", () => {
  it("offers @index/@first/@last/@key and this inside #each", async () => {
    // Given - a mustache head inside an (unclosed) #each block
    const doc = templatedBody("{{#each items}}{{⟦⟧");
    // Then - the each data variables and `this` are offered alongside helpers
    await expectCompletions(doc, "", { contains: ["@index", "@first", "@last", "@key", "this"] });
  });

  it("offers @-vars after `{{@` inside #each (nested mid-typing)", async () => {
    // Given - nested: a `{{@` continuation inside #each
    const doc = templatedBody("{{#each items}}{{@⟦⟧");
    await expectCompletions(doc, "", { contains: ["@index", "@key"] });
  });

  it("does NOT offer @-vars outside an #each scope", async () => {
    // Given - a top-level mustache head (no enclosing block)
    const doc = templatedBody("{{⟦⟧}}");
    await expectCompletions(doc, "", { notContains: ["@index", "this"] });
  });
});

describe("template completion — block close", () => {
  it("offers the matching open block name at `{{/`", async () => {
    // Given - typing a block close inside an open #each
    const doc = templatedBody("{{#each items}}{{/⟦⟧");
    // Then - `each` is offered to close the block
    await expectCompletions(doc, "", { contains: ["each"] });
  });
});

describe("template completion — header values", () => {
  it("offers template completions inside a templated response header value", async () => {
    // Given - templated:true and a header value containing a mustache head
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"headers":{"X-Trace":["{{⟦⟧}}"]}}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - helper completions fire in the header value too
    await expectCompletions(doc, "", { contains: ["randomUuid"] });
  });
});

describe("template completion — mid-typing without templated flag", () => {
  it("offers completions when the body already contains {{ but templated is absent", async () => {
    // Given - no `templated` key, but the body is clearly a template in progress
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"{{fa⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - completions still fire (HF501 diagnostic separately nudges them to set templated)
    await expectCompletions(doc, "", { contains: ["faker"] });
  });
});

describe("template completion — escape-heavy position mapping", () => {
  it(String.raw`maps the cursor correctly after a \n run (offset fidelity)`, async () => {
    // Given - the body has a `\n` escape before the mustache; the marker sits after `Request.`
    const doc = templatedBody(String.raw`line1\n{{Request.⟦⟧}}`);
    // Then - despite the 2-char escape, the cursor resolves to the Request continuation
    await expectCompletions(doc, "", { contains: ["Method", "Path"], notContains: ["faker"] });
  });
});

describe("template completion — negatives", () => {
  it("offers NO template completions in a plain non-templated body", async () => {
    // Given - a body with no template syntax and templated absent
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"plain ⟦⟧text"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - no template completions (and no helper noise leaks)
    await expectNoCompletions(doc, "");
  });

  it("offers NO template completions in a requiresState value", async () => {
    // Given - a cursor in a requiresState value (not a templatable string)
    const doc = `{"data":{"pairs":[{"request":{"path":[],"requiresState":{"k":"⟦⟧"}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - no helper/faker completions appear here
    await expectCompletions(doc, "", { notContains: [...HELPER_NAMES, "Request"] });
  });

  it("offers NO template completions in plain literal text inside a templated body", async () => {
    // Given - the cursor is in literal text (outside any mustache) of a templated body
    const doc = templatedBody("hello ⟦⟧ world");
    // Then - none (the cursor is not inside a `{{ }}`)
    await expectNoCompletions(doc, "");
  });
});
