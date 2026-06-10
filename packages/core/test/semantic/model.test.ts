import { describe, expect, it } from "vitest";
import { getLanguageService } from "vscode-json-languageservice";
import { TextDocument } from "vscode-languageserver-textdocument";

import { buildSimulationModel } from "../../src/semantic/model.js";

const ls = getLanguageService({});

function modelOf(text: string) {
  const doc = TextDocument.create("file:///m.hoverfly.json", "json", 1, text);
  return buildSimulationModel(ls.parseJSONDocument(doc));
}

describe("buildSimulationModel", () => {
  it("builds a typed view of pairs, matcher fields, response and meta", () => {
    // Given - a rich single-pair simulation
    const model = modelOf(
      JSON.stringify({
        data: {
          pairs: [
            {
              request: {
                path: [{ matcher: "exact", value: "/x" }],
                headers: { Authorization: [{ matcher: "glob", value: "Bearer *" }] },
                requiresState: { loggedIn: "yes" },
              },
              response: {
                status: 200,
                body: "hi",
                transitionsState: { step: "2" },
                removesState: ["temp"],
              },
            },
          ],
          globalActions: { delays: [{ urlPattern: "a.*", delay: 100 }] },
        },
        meta: { schemaVersion: "v5.3" },
      }),
    );

    // Then - the pair and its matcher fields are exposed with AST nodes
    expect(model.pairs).toHaveLength(1);
    const pair = model.pairs[0]!;
    const path = pair.request.fields.find((f) => f.fieldName === "path");
    expect(path?.container).toBe("request");
    expect(path?.matchers[0]?.matcherName).toBe("exact");
    expect(path?.matchers[0]?.valueNode?.type).toBe("string");

    // Then - nested header matcher maps are flattened with their container kind
    const auth = pair.request.fields.find((f) => f.fieldName === "Authorization");
    expect(auth?.container).toBe("headers");
    expect(auth?.matchers[0]?.matcherName).toBe("glob");

    // Then - response, state and meta accessors resolve
    expect(pair.response.status.valueNode?.type).toBe("number");
    expect(pair.requiresState[0]?.key).toBe("loggedIn");
    expect(pair.transitionsState[0]?.key).toBe("step");
    expect(pair.removesState[0]?.key).toBe("temp");
    expect(model.meta.schemaVersion.valueNode?.type).toBe("string");
    expect(model.globalActions.delays[0]?.urlPattern).toBe("a.*");
  });

  it("never throws and degrades to empty/undefined on malformed shapes", () => {
    // Given - a document where every shape is wrong (pairs as object, data missing, etc.)
    const model = modelOf(`{"data":{"pairs":{}},"meta":42}`);
    // Then - it degrades gracefully
    expect(model.pairs).toEqual([]);
    expect(model.meta.node).toBeUndefined();
    expect(model.meta.schemaVersion.valueNode).toBeUndefined();
    expect(model.globalActions.delays).toEqual([]);
  });

  it("tolerates a non-object root", () => {
    // Given - a JSON array at the root
    const model = modelOf(`[]`);
    // Then - no root object, no pairs
    expect(model.root).toBeUndefined();
    expect(model.pairs).toEqual([]);
  });
});
