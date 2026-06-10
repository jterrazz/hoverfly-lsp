import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";
import { DiagnosticSeverity } from "vscode-languageserver-types";

import { createRuleContext } from "../../src/semantic/engine.js";
import { hf601DelayPatternRule, hf602PostServeActionRule } from "../../src/semantic/rules/hf6xx.js";
import type { HoverflyServiceSettings } from "../../src/semantic/types.js";

const ls = getLanguageService({});

/**
 * Build a rule context, optionally attaching service settings. HF602 reads its allowlist off
 * `RuleContext.settings`, which the framework now plumbs through `createRuleContext`.
 */
function contextOf(text: string, settings?: HoverflyServiceSettings) {
  const doc = TextDocument.create("file:///s.hoverfly.json", "json", 1, text);
  return createRuleContext(doc, ls.parseJSONDocument(doc), settings);
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

/** A simulation with the given globalActions delays (HF601 fixtures). */
function withDelays(delays: unknown[]): string {
  return JSON.stringify({
    data: { pairs: [], globalActions: { delays } },
    meta: { schemaVersion: "v5.3" },
  });
}

/** A single-pair simulation whose response carries the given postServeAction (HF602 fixtures). */
function withAction(action: string): string {
  return JSON.stringify({
    data: {
      pairs: [
        {
          request: { path: [{ matcher: "exact", value: "/" }] },
          response: { status: 200, postServeAction: action },
        },
      ],
    },
    meta: { schemaVersion: "v5.3" },
  });
}

describe("HF601 — invalid globalActions delay urlPattern", () => {
  it("warns on an unbalanced-bracket pattern", () => {
    // Given - a delay with a malformed regex urlPattern
    const diags = hf601DelayPatternRule.run(
      contextOf(withDelays([{ urlPattern: "(unbalanced", delay: 100 }])),
    );
    // Then - one HF601 warning on the pattern
    expect(codes(diags)).toEqual(["HF601"]);
    expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
  });

  it("accepts a valid regex pattern", () => {
    // Given - a well-formed regex
    expect(
      hf601DelayPatternRule.run(contextOf(withDelays([{ urlPattern: "^/api/.*$", delay: 100 }]))),
    ).toEqual([]);
  });

  it("is silent when urlPattern is absent or non-string", () => {
    // Given - a delay with no urlPattern, then a non-string one
    expect(hf601DelayPatternRule.run(contextOf(withDelays([{ delay: 100 }])))).toEqual([]);
    expect(
      hf601DelayPatternRule.run(contextOf(withDelays([{ urlPattern: 42, delay: 100 }]))),
    ).toEqual([]);
  });
});

describe("HF602 — postServeAction not in registeredActions allowlist", () => {
  it("is silent when no allowlist is configured (default)", () => {
    // Given - a postServeAction but no settings
    expect(hf602PostServeActionRule.run(contextOf(withAction("webhook")))).toEqual([]);
  });

  it("is silent when the allowlist is empty", () => {
    // Given - an explicitly empty allowlist
    expect(
      hf602PostServeActionRule.run(contextOf(withAction("webhook"), { registeredActions: [] })),
    ).toEqual([]);
  });

  it("flags an action not in a non-empty allowlist", () => {
    // Given - allowlist that does not contain the action
    const diags = hf602PostServeActionRule.run(
      contextOf(withAction("webhook"), { registeredActions: ["logger"] }),
    );
    // Then - one HF602 information diagnostic naming the action
    expect(codes(diags)).toEqual(["HF602"]);
    expect(diags[0]?.severity).toBe(DiagnosticSeverity.Information);
    expect(diags[0]?.message).toContain("webhook");
  });

  it("accepts an action present in the allowlist", () => {
    // Given - the action is allowlisted
    expect(
      hf602PostServeActionRule.run(
        contextOf(withAction("webhook"), { registeredActions: ["webhook"] }),
      ),
    ).toEqual([]);
  });
});
