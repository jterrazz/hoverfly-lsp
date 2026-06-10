/**
 * Locate whether a document position sits inside a TEMPLATABLE Hoverfly string, and if so build
 * the bridge the template completion/hover providers need: the decoded template text, a
 * source-map (document↔decoded offsets), and the decoded-offset cursor.
 *
 * A string is templatable when it is one of:
 *   - a response `body` whose sibling `templated` is `true`, OR
 *   - a response header value (a string inside `response.headers.<name>[]`) when `templated` is
 *     `true` (Hoverfly templates header values too), OR
 *   - ANY response `body`/header string that already contains `{{` even though `templated` is
 *     absent/false — the author is clearly mid-typing a template; we still offer completions and
 *     let the HF501 diagnostic nudge them to set `templated: true`.
 *
 * Crucially, `template-completion.ts`/`template-hover.ts` are driven from `service.ts`, which has
 * the cursor {@link Position} (the `JSONWorkerContribution` API does not expose it). This module
 * walks the parsed AST to find the enclosing string node and classify its role.
 *
 * Reuses the parser-owned {@link createStringSourceMap}; adds no template grammar of its own.
 */

import type {
  ASTNode,
  JSONDocument,
  ObjectASTNode,
  StringASTNode,
} from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";

import {
  createStringSourceMap,
  hasTemplateSyntax,
  type StringSourceMap,
} from "../template/index.js";

/** A located templatable string + the cursor mapped into its decoded content. */
interface TemplateLocation {
  /** The decoded template text (escapes resolved, no surrounding quotes). */
  readonly decoded: string;
  /** The cursor as a decoded-string offset. */
  readonly decodedCursor: number;
  /** Document↔decoded offset bridge for this string token. */
  readonly sourceMap: StringSourceMap;
  /** The string AST node the cursor sits in. */
  readonly node: StringASTNode;
  /** Whether `templated: true` was set on the enclosing response (drives diagnostics, not us). */
  readonly templatedEnabled: boolean;
}

/**
 * If `offset` (a document offset) is inside a templatable string of `jsonDocument`, return the
 * {@link TemplateLocation}; otherwise `undefined`. Never throws.
 */
function findTemplateLocation(
  document: TextDocument,
  jsonDocument: JSONDocument,
  offset: number,
): TemplateLocation | undefined {
  const root = asObject(jsonDocument.root);
  const dataNode = asObject(propValue(root, "data"));
  const pairs = arrayItems(dataNode, "pairs");

  for (const pairNode of pairs) {
    const pair = asObject(pairNode);
    const response = asObject(propValue(pair, "response"));
    if (!response) {
      continue;
    }
    const located = locateInResponse(document, response, offset);
    if (located) {
      return located;
    }
  }
  return undefined;
}

/** Search a single response object for a templatable string containing `offset`. */
function locateInResponse(
  document: TextDocument,
  response: ObjectASTNode,
  offset: number,
): TemplateLocation | undefined {
  const templatedEnabled = boolValue(propValue(response, "templated")) === true;

  // Body: a single string.
  const bodyNode = propValue(response, "body");
  if (isStringNode(bodyNode) && containsOffset(bodyNode, offset)) {
    return buildLocation(document, bodyNode, templatedEnabled, offset);
  }

  // Header values: response.headers.<name> is an array of strings.
  const headers = asObject(propValue(response, "headers"));
  if (headers) {
    for (const property of headers.properties) {
      const value = property.valueNode;
      if (value?.type === "array") {
        for (const item of value.items) {
          if (isStringNode(item) && containsOffset(item, offset)) {
            return buildLocation(document, item, templatedEnabled, offset);
          }
        }
      }
    }
  }
  return undefined;
}

/**
 * Build a {@link TemplateLocation} for `node`, but only when the string is actually templatable:
 * `templated: true`, OR the string already contains `{{` (mid-typing). Returns `undefined`
 * otherwise so a plain non-templated body gets NO template completions/hover.
 */
function buildLocation(
  document: TextDocument,
  node: StringASTNode,
  templatedEnabled: boolean,
  offset: number,
): TemplateLocation | undefined {
  const rawToken = document.getText().slice(node.offset, node.offset + node.length);
  const sourceMap = createStringSourceMap(rawToken, node.offset);

  if (!templatedEnabled && !hasTemplateSyntax(sourceMap.decoded)) {
    return undefined;
  }

  // `offset` was validated by containsOffset; map it into the decoded content.
  const decodedCursor = sourceMap.toDecodedOffset(offset);
  return {
    decoded: sourceMap.decoded,
    decodedCursor,
    sourceMap,
    node,
    templatedEnabled,
  };
}

/* --------------------------------------- AST helpers ------------------------------------- */

function asObject(node: ASTNode | undefined): ObjectASTNode | undefined {
  return node?.type === "object" ? node : undefined;
}

function propValue(node: ObjectASTNode | undefined, key: string): ASTNode | undefined {
  return node?.properties.find((p) => p.keyNode.value === key)?.valueNode;
}

function arrayItems(node: ObjectASTNode | undefined, key: string): readonly ASTNode[] {
  const value = propValue(node, key);
  return value?.type === "array" ? value.items : [];
}

function boolValue(node: ASTNode | undefined): boolean | undefined {
  return node?.type === "boolean" ? node.value : undefined;
}

function isStringNode(node: ASTNode | undefined): node is StringASTNode {
  return node?.type === "string";
}

/**
 * Whether `offset` lies within the CONTENT of a string node — between its opening and closing
 * quotes (inclusive of both ends so a cursor right after the opening quote or just before the
 * closing quote both count). The node's `offset`/`length` cover the quotes.
 */
function containsOffset(node: StringASTNode, offset: number): boolean {
  const start = node.offset + 1; // Just after opening quote
  const end = node.offset + node.length - 1; // The closing quote
  return offset >= start && offset <= end;
}

export { findTemplateLocation, type TemplateLocation };
