/**
 * Diagnostic construction. Every HFxxx diagnostic is built here so that severity, message
 * template, source, and docs href all come from the frozen catalog — rules never assemble a
 * `Diagnostic` by hand. The range is the exact span of the supplied AST node (or an explicit
 * Range), mapped through the document's offset→position conversion.
 */

import type { ASTNode } from "vscode-json-languageservice";
import type { TextDocument } from "vscode-languageserver-textdocument";
import { type Diagnostic, type Range } from "vscode-languageserver-types";

import {
  type CatalogEntry,
  DIAGNOSTIC_CATALOG,
  DIAGNOSTIC_SOURCE,
  type DiagnosticCode,
  formatMessage,
} from "./catalog.js";

function isAstNode(target: ASTNode | Range): target is ASTNode {
  return (
    typeof (target as ASTNode).offset === "number" && typeof (target as ASTNode).length === "number"
  );
}

/** A target for a diagnostic range: either an AST node (span = offset..offset+length) or a Range. */
export type RangeTarget = ASTNode | Range;

/** Convert an AST node's offset/length span to an LSP Range via the document. */
export function nodeRange(document: TextDocument, node: ASTNode): Range {
  return {
    start: document.positionAt(node.offset),
    end: document.positionAt(node.offset + node.length),
  };
}

/** Resolve a {@link RangeTarget} to a concrete Range. */
export function resolveRange(document: TextDocument, target: RangeTarget): Range {
  return isAstNode(target) ? nodeRange(document, target) : target;
}

/**
 * Build a catalog-backed {@link Diagnostic}.
 *
 * @param document the source document (for offset→position).
 * @param code     the HFxxx code; pulls severity/template/href from the catalog.
 * @param target   the AST node to point at, or an explicit Range.
 * @param args     template substitution args (`{name}` → args.name). For passthrough codes
 *                 (HF102/HF307/HF502) pass the full text as `{ message }` / `{ explain }`.
 */
export function makeDiagnostic(
  document: TextDocument,
  code: DiagnosticCode,
  target: RangeTarget,
  args: Readonly<Record<string, unknown>> = {},
): Diagnostic {
  const entry: CatalogEntry = DIAGNOSTIC_CATALOG[code];
  return {
    code,
    source: DIAGNOSTIC_SOURCE,
    severity: entry.severity,
    range: resolveRange(document, target),
    message: formatMessage(entry.messageTemplate, args),
    codeDescription: { href: entry.href },
  };
}
