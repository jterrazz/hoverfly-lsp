/**
 * HF5xx — response-templating rules. The pure template parser + analyzer (`../../template/*`)
 * does the grammar/semantic work on the DECODED template string; this file is the glue that:
 *
 *   1. finds every templatable string in the model,
 *   2. decodes it through an escape-aware source map (`createStringSourceMap`),
 *   3. runs {@link analyze} with the document's `Vars`/`Literals` names in context, and
 *   4. maps each template-relative finding back to a document range and emits a catalog
 *      diagnostic via {@link makeDiagnostic}.
 *
 * Codes:
 *   HF501 (W)  `{{…}}` in a response `body` while `templated` is absent/false — sent literally.
 *   HF502 (E)  template parse error (unclosed `{{`, unclosed/mismatched block) — parser message.
 *   HF503 (E)  unknown helper name (helper-position calls AND subexpression heads).
 *   HF504 (E)  helper arity / block-vs-inline misuse (per `registry/helpers.ts`).
 *   HF505 (E)  `Vars.X` not in `data.variables[].name`.
 *   HF506 (E)  `Literals.X` not in `data.literals[].name`.
 *   HF507 (I)  unknown `faker '<Type>'` (string literal only) for the pinned gofakeit version.
 *   HF508 (W)  parameterized gofakeit method used as `faker '<Type>'` — panics at render.
 *   HF509 (I)  invalid `now` offset token (unit not in ns/us/µs/μs/ms/s/m/h/d/y).
 *   HF510 (E)  `data.variables[].function` is a raymond block built-in, not a Hoverfly helper.
 *
 * ## Which strings are templated?
 * Per report 01 §8 (`templated: true` enables `{{ }}` in `body` AND `headers`) and §10, this
 * rule analyses, when `response.templated === true`, the response **`body`** string and every
 * response **header value** string. `transitionsState`/`requiresState` values are NOT templated
 * by Hoverfly (report 01 lists only body/headers), so they are deliberately left untouched.
 * HF501 (syntax-while-not-templated) is checked on the `body` only — that is the catalog's
 * trigger ("Body contains template syntax…").
 *
 * The HF502–HF509 finding `kind` maps 1:1 to the catalog code; HF501 and HF510 are emitted here
 * directly because they need model/document context the template AST does not carry.
 */

import type { ASTNode, ObjectASTNode } from "vscode-json-languageservice";
import { type Diagnostic, type Range } from "vscode-languageserver-types";

import { VARIABLE_FUNCTION_NAMES } from "../../registry/index.js";
import {
  analyze,
  type AnalyzerContext,
  createStringSourceMap,
  hasTemplateSyntax,
} from "../../template/index.js";
import type { DiagnosticCode } from "../catalog.js";
import { makeDiagnostic } from "../diagnostics.js";
import type { RuleContext, SemanticRule, SimulationModel } from "../types.js";

/** Built-in `data.variables[].function` names that are valid (the 52 Hoverfly helpers). */
const VALID_VARIABLE_FUNCTIONS: ReadonlySet<string> = new Set(VARIABLE_FUNCTION_NAMES);

/* --------------------------------- string source mapping --------------------------------- */

/**
 * Run the analyzer on one templatable string node and emit its HF502–HF509 diagnostics, mapped
 * from template-relative offsets back to document ranges through the JSON-escape source map.
 */
function analyzeStringNode(
  context: RuleContext,
  node: ASTNode,
  analyzerContext: AnalyzerContext,
  diagnostics: Diagnostic[],
): void {
  if (node.type !== "string") {
    return;
  }
  const rawToken = context.textDocument.getText().slice(node.offset, node.offset + node.length);
  const sourceMap = createStringSourceMap(rawToken, node.offset);

  for (const finding of analyze(sourceMap.decoded, analyzerContext)) {
    const range: Range = {
      start: context.textDocument.positionAt(sourceMap.toDocOffset(finding.start)),
      end: context.textDocument.positionAt(sourceMap.toDocOffset(finding.end)),
    };
    diagnostics.push(makeDiagnostic(context.textDocument, finding.kind, range, finding.args));
  }
}

/** Emit HF501 at the first `{{` in a non-templated body, source-mapped to its document range. */
function emitHf501(context: RuleContext, node: ASTNode, diagnostics: Diagnostic[]): void {
  if (node.type !== "string" || !hasTemplateSyntax(node.value)) {
    return;
  }
  const rawToken = context.textDocument.getText().slice(node.offset, node.offset + node.length);
  const sourceMap = createStringSourceMap(rawToken, node.offset);
  const firstMustache = sourceMap.decoded.indexOf("{{");
  const start = sourceMap.toDocOffset(firstMustache);
  const end = sourceMap.toDocOffset(firstMustache + 2);
  const range: Range = {
    start: context.textDocument.positionAt(start),
    end: context.textDocument.positionAt(end),
  };
  diagnostics.push(makeDiagnostic(context.textDocument, "HF501", range));
}

/* ---------------------------------- data.variables/literals ------------------------------ */

/** The value node for a property `key` on an object node, if present. */
function propValue(object: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return object?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

/** String items of a `data.<key>[].<field>` (e.g. every `variables[].name`). */
function collectNames(
  dataNode: ObjectASTNode | undefined,
  key: string,
  field: string,
): Set<string> {
  const names = new Set<string>();
  const array = propValue(dataNode, key);
  if (array?.type !== "array") {
    return names;
  }
  for (const item of array.items) {
    if (item.type !== "object") {
      continue;
    }
    const value = propValue(item, field);
    if (value?.type === "string") {
      names.add(value.value);
    }
  }
  return names;
}

/**
 * HF510 — every `data.variables[].function` whose value is a string NOT in the 52 Hoverfly
 * helper names (raymond block built-ins like `each`/`if` are rejected by `SupportedMethodMap`).
 */
function checkVariableFunctions(
  context: RuleContext,
  dataNode: ObjectASTNode | undefined,
  diagnostics: Diagnostic[],
): void {
  const array = propValue(dataNode, "variables");
  if (array?.type !== "array") {
    return;
  }
  for (const item of array.items) {
    if (item.type !== "object") {
      continue;
    }
    const fnNode = propValue(item, "function");
    if (fnNode?.type !== "string") {
      continue;
    }
    if (!VALID_VARIABLE_FUNCTIONS.has(fnNode.value)) {
      diagnostics.push(makeDiagnostic(context.textDocument, "HF510", fnNode));
    }
  }
}

/* ------------------------------------------ rule ----------------------------------------- */

/** Whether a `templated` field node is the JSON boolean `true`. */
function isTemplated(node: ASTNode | undefined): boolean {
  return node?.type === "boolean" && node.value === true;
}

const HF5XX_CODES: readonly DiagnosticCode[] = [
  "HF501",
  "HF502",
  "HF503",
  "HF504",
  "HF505",
  "HF506",
  "HF507",
  "HF508",
  "HF509",
  "HF510",
];

/**
 * A response header value is `string | string[]` in Hoverfly. Analyse a string directly, or
 * each string element of an array; ignore other shapes (a schema concern).
 */
function analyzeHeaderValue(
  context: RuleContext,
  node: ASTNode | undefined,
  analyzerContext: AnalyzerContext,
  diagnostics: Diagnostic[],
): void {
  if (!node) {
    return;
  }
  if (node.type === "string") {
    analyzeStringNode(context, node, analyzerContext, diagnostics);
    return;
  }
  if (node.type === "array") {
    for (const item of node.items) {
      analyzeStringNode(context, item, analyzerContext, diagnostics);
    }
  }
}

/**
 * The HF5xx templating rule: analyses every templated response body/header value and validates
 * `data.variables[].function` names. Never throws; absent/wrong-shaped nodes degrade to no-ops.
 */
const hf5xxTemplateRule: SemanticRule = {
  codes: HF5XX_CODES,
  run(context: RuleContext): Diagnostic[] {
    const diagnostics: Diagnostic[] = [];
    const model: SimulationModel = context.model;

    const analyzerContext: AnalyzerContext = {
      variableNames: collectNames(model.dataNode, "variables", "name"),
      literalNames: collectNames(model.dataNode, "literals", "name"),
    };

    // HF510 — data.variables[].function validity (independent of any response).
    checkVariableFunctions(context, model.dataNode, diagnostics);

    for (const pair of model.pairs) {
      const { response } = pair;
      const templated = isTemplated(response.templated.valueNode);
      const bodyNode = response.body.valueNode;

      if (bodyNode) {
        if (templated) {
          analyzeStringNode(context, bodyNode, analyzerContext, diagnostics);
        } else {
          // HF501 — template syntax in a body that is not templated; sent literally.
          emitHf501(context, bodyNode, diagnostics);
        }
      }

      // Header values are templated too (report 01 §8) — but only when templated === true.
      if (templated) {
        for (const header of response.headers) {
          analyzeHeaderValue(context, header.valueNode, analyzerContext, diagnostics);
        }
      }
    }

    return diagnostics;
  },
};

/** All HF5xx templating rules. The integrator spreads this into `ALL_RULES`. */
const HF5XX_RULES: readonly SemanticRule[] = [hf5xxTemplateRule];

export { HF5XX_RULES, hf5xxTemplateRule };
