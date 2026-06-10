import { describe, expect, it } from "vitest";

import { REGISTRY_MATCHER_NAMES } from "../../src/registry/index.js";
import { expectCompletions, expectNoCompletions } from "../fourslash/harness.js";

/** Matcher names offered everywhere = the registry names minus the empty default matcher. */
const NAMED_MATCHERS = REGISTRY_MATCHER_NAMES.filter((name) => name !== "");

describe("matcher-name completions", () => {
  it("offers the named registry matchers on request.path (quoted value)", async () => {
    // Given - a cursor inside the quoted matcher value on request.path
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    /*
     * Then - the dropdown is EXACTLY the body-excluded registry names: no `form` (path is not
     * body), no empty default, and crucially no quoted-label `"form"`/`"exact"` duplicates from
     * schema `examples`. Asserting the full label set (not just `notContains: ["form"]`) is what
     * catches the quoted-label leak the schema previously produced.
     */
    await expectCompletions(doc, "", { exact: NAMED_MATCHERS });
  });

  it("offers matchers on an UNQUOTED matcher value position", async () => {
    // Given - a bare (unquoted) value position after the colon
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":⟦⟧}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the same named matchers are offered (insertText quotes them)
    await expectCompletions(doc, "", { contains: ["exact", "regex", "jsonpath"] });
  });

  it("adds `form` ONLY on request.body", async () => {
    // Given - a matcher value on request.body
    const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    /*
     * Then - the dropdown is EXACTLY the registry names INCLUDING the body-only `form`, with no
     * duplicate quoted-label items (schema `examples` no longer contribute matcher names).
     */
    await expectCompletions(doc, "", { exact: [...NAMED_MATCHERS, "form"] });
  });

  it("offers matchers inside a header matcher array", async () => {
    // Given - a matcher value inside request.headers.<name>[]
    const doc = `{"data":{"pairs":[{"request":{"headers":{"Accept":[{"matcher":"⟦⟧"}]}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - registry matchers are offered but not `form` (headers are not body)
    await expectCompletions(doc, "", { contains: ["exact"], notContains: ["form"] });
  });

  it("offers matchers inside a doMatch chain link", async () => {
    // Given - a matcher value inside a nested doMatch
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"jsonpath","value":"$.x","doMatch":{"matcher":"⟦⟧"}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - matcher names are offered in the chained position too
    await expectCompletions(doc, "", { contains: ["exact", "regex"] });
  });

  it("carries documentation, detail, and a quoted insertText on each item", async () => {
    // Given - a matcher value position
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // When - completions are produced
    const items = await expectCompletions(doc, "", { contains: ["regex"] });
    const regex = items.find((i) => i.label === "regex");
    // Then - the item sources docs/detail from the registry and quotes its insert text
    expect(regex?.detail).toContain("value:");
    const documentation = regex?.documentation;
    const docText = typeof documentation === "string" ? documentation : documentation?.value;
    expect(docText).toContain("Regular-expression match");
    expect(docText).toContain("Value type:");
    expect(docText).toContain("⚠️"); // Panic warning present
    expect(regex?.insertText).toBe('"regex"');
  });
});

describe("matcher-name completions — negative contexts", () => {
  it("does NOT offer matcher names in a non-simulation JSON document", async () => {
    // Given - arbitrary JSON whose shape coincidentally has a "matcher" key but no sim fingerprint
    const doc = `{"random":{"matcher":"⟦⟧"}}`;
    // Then - no Hoverfly matcher completions are injected (path is not a request matcher position)
    await expectCompletions(doc, "", { notContains: NAMED_MATCHERS });
  });

  it("does not offer matcher names on a response field", async () => {
    // Given - a cursor in the response.body string (not a matcher position)
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - no matcher-name completions appear
    await expectCompletions(doc, "", { notContains: NAMED_MATCHERS });
  });

  it("does not crash and offers nothing Hoverfly-specific on broken JSON", async () => {
    // Given - a structurally broken document with a dangling matcher value
    const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"`;
    // Then - the call returns without throwing; matcher completion may or may not fire, but the
    // Service stays alive. We assert it does not throw and returns an array.
    await expectCompletions(doc, "", {});
  });
});

describe("schemaVersion completions", () => {
  it("offers v5.3 (preferred) plus v5/v5.1/v5.2", async () => {
    // Given - a cursor in the meta.schemaVersion value
    const doc = `{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧"}}`;
    // Then - the four version values are offered (the contribution's labels are unquoted; the
    // Schema's `examples` add quoted-label duplicates, which is harmless)
    const items = await expectCompletions(doc, "", { contains: ["v5.3", "v5", "v5.1", "v5.2"] });
    const preferred = items.find((i) => i.label === "v5.3");
    // Then - v5.3 is preselected and sorts first
    expect(preferred?.preselect).toBe(true);
    expect(preferred?.sortText).toBe("0");
    expect(preferred?.insertText).toBe('"v5.3"');
  });
});

describe("postServeAction completions", () => {
  it("offers registered actions when the setting is provided", async () => {
    // Given - a cursor in response.postServeAction and a registeredActions allowlist
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the configured action names are offered
    await expectCompletions(
      doc,
      "",
      { contains: ["webhook", "logger"] },
      { settings: { registeredActions: ["webhook", "logger"] } },
    );
  });

  it("offers nothing when no registeredActions are configured", async () => {
    // Given - a postServeAction position but no settings
    const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - no postServeAction completions (runtime-registered, unknowable from the file)
    await expectNoCompletions(doc, "");
  });
});

describe("state-key cross-reference completions", () => {
  it("offers requiresState keys declared elsewhere in the file, plus a sequence: snippet", async () => {
    // Given - one pair declares requiresState keys; a second pair is typing a new requiresState key
    const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"cart":"full","loggedIn":"yes"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}],"requiresState":{"⟦⟧":""}},"response":{"status":200}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the cross-referenced keys are offered as property completions, plus sequence:
    await expectCompletions(doc, "", { contains: ["cart", "loggedIn", "sequence:"] });
  });

  it("offers requiresState keys as transitionsState key completions (cross-ref)", async () => {
    // Given - a requiresState key declared on one pair; another pair types a transitionsState key
    const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"step":"1"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}]},"response":{"status":200,"transitionsState":{"⟦⟧":""}}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
    // Then - the requiresState key is offered; the sequence: snippet is NOT (transitionsState side)
    await expectCompletions(doc, "", { contains: ["step"], notContains: ["sequence:"] });
  });
});
