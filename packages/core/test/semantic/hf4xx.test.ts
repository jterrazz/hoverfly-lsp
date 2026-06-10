import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { createRuleContext } from "../../src/semantic/engine.js";
import {
  hf401RequiresNeverSet,
  hf402TransitionsNeverRequired,
  hf403RemovesNeverSet,
} from "../../src/semantic/rules/hf4xx.js";
import type { RuleContext } from "../../src/semantic/types.js";

const ls = getLanguageService({});

function contextOf(value: unknown): RuleContext {
  const text = JSON.stringify(value, null, 2);
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  return createRuleContext(doc, ls.parseJSONDocument(doc));
}

/** A single request/response pair carrying optional state maps. */
interface StatePair {
  requiresState?: Record<string, string>;
  transitionsState?: Record<string, string>;
  removesState?: string[];
}

function sim(...pairs: StatePair[]): unknown {
  return {
    data: {
      // Schema-correct placement per Hoverfly source truth (see the hf4xx.ts workaround note):
      // `requiresState` sits in the request node; `transitionsState`/`removesState` in response.
      pairs: pairs.map((pair) => ({
        request: {
          path: [{ matcher: "exact", value: "/x" }],
          ...(pair.requiresState ? { requiresState: pair.requiresState } : {}),
        },
        response: {
          status: 200,
          ...(pair.transitionsState ? { transitionsState: pair.transitionsState } : {}),
          ...(pair.removesState ? { removesState: pair.removesState } : {}),
        },
      })),
    },
    meta: { schemaVersion: "v5.3" },
  };
}

describe("HF401 — requiresState key never set", () => {
  it("warns when a required state is never set by any transitionsState", () => {
    // Given - a pair requiring a state nothing transitions
    const diags = hf401RequiresNeverSet.run(contextOf(sim({ requiresState: { ready: "yes" } })));
    // Then - one HF401 warning on the key
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF401");
    expect(diags[0]?.message).toContain('State "ready"');
  });

  it("stays silent cross-pair: required in pair A, set in pair B", () => {
    // Given - pair A requires `auth`, pair B transitions `auth`
    const diags = hf401RequiresNeverSet.run(
      contextOf(sim({ requiresState: { auth: "true" } }, { transitionsState: { auth: "true" } })),
    );
    // Then - cross-pair satisfaction silences HF401
    expect(diags).toEqual([]);
  });

  it("still warns when required and set only in the SAME pair (state unset on first match)", () => {
    // Given - one pair both requires and transitions `loop`
    const diags = hf401RequiresNeverSet.run(
      contextOf(sim({ requiresState: { loop: "1" }, transitionsState: { loop: "1" } })),
    );
    // Then - the request fires before the response sets it, so HF401 still warns
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF401");
  });

  it("exempts sequence:-prefixed keys (Hoverfly built-in sequencing)", () => {
    // Given - a required state using the sequence: prefix
    const diags = hf401RequiresNeverSet.run(
      contextOf(sim({ requiresState: { "sequence:1": "2" } })),
    );
    // Then - sequence keys are never flagged
    expect(diags).toEqual([]);
  });

  it("flags an empty-string state key", () => {
    // Given - a required state whose key is the empty string
    const diags = hf401RequiresNeverSet.run(contextOf(sim({ requiresState: { "": "x" } })));
    // Then - the empty key is still required-but-never-set
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF401");
  });

  it("warns once per pair for a duplicate required key never set", () => {
    // Given - two pairs each requiring the same unset state
    const diags = hf401RequiresNeverSet.run(
      contextOf(sim({ requiresState: { gone: "1" } }, { requiresState: { gone: "1" } })),
    );
    // Then - each occurrence gets its own diagnostic (distinct ranges)
    expect(diags).toHaveLength(2);
    expect(diags.every((d) => d.code === "HF401")).toBe(true);
  });
});

describe("HF402 — transitionsState key never required", () => {
  it("informs when a set state is never required", () => {
    // Given - a pair transitioning a state nothing requires
    const diags = hf402TransitionsNeverRequired.run(
      contextOf(sim({ transitionsState: { done: "true" } })),
    );
    // Then - one HF402 information on the key
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF402");
    expect(diags[0]?.message).toContain('State "done"');
  });

  it("stays silent when the set state is required by another pair", () => {
    // Given - pair A transitions `auth`, pair B requires it
    const diags = hf402TransitionsNeverRequired.run(
      contextOf(sim({ transitionsState: { auth: "true" } }, { requiresState: { auth: "true" } })),
    );
    // Then - no HF402
    expect(diags).toEqual([]);
  });

  it("exempts sequence:-prefixed keys", () => {
    // Given - a transitioned sequence: state
    const diags = hf402TransitionsNeverRequired.run(
      contextOf(sim({ transitionsState: { "sequence:foo": "1" } })),
    );
    // Then - sequence keys are exempt
    expect(diags).toEqual([]);
  });
});

describe("HF403 — removesState entry never set", () => {
  it("informs when a removed state is never set anywhere", () => {
    // Given - a pair removing a state nothing transitions
    const diags = hf403RemovesNeverSet.run(contextOf(sim({ removesState: ["ghost"] })));
    // Then - one HF403 information on the entry
    expect(diags).toHaveLength(1);
    expect(diags[0]?.code).toBe("HF403");
    expect(diags[0]?.message).toContain('State "ghost"');
  });

  it("stays silent when the removed state is set by some transitionsState", () => {
    // Given - pair A sets `tmp`, pair B removes it
    const diags = hf403RemovesNeverSet.run(
      contextOf(sim({ transitionsState: { tmp: "1" } }, { removesState: ["tmp"] })),
    );
    // Then - no HF403
    expect(diags).toEqual([]);
  });

  it("exempts removesState of a sequence: key", () => {
    // Given - removing a sequence: key (auto-managed, never transitioned)
    const diags = hf403RemovesNeverSet.run(contextOf(sim({ removesState: ["sequence:2"] })));
    // Then - sequence keys are exempt from HF403
    expect(diags).toEqual([]);
  });
});

describe("HF4xx — defensive", () => {
  it("emits nothing on a document with no pairs", () => {
    // Given - an empty simulation
    const ctx = contextOf({ data: { pairs: [] }, meta: { schemaVersion: "v5.3" } });
    // Then - all three rules are silent
    expect(hf401RequiresNeverSet.run(ctx)).toEqual([]);
    expect(hf402TransitionsNeverRequired.run(ctx)).toEqual([]);
    expect(hf403RemovesNeverSet.run(ctx)).toEqual([]);
  });
});
