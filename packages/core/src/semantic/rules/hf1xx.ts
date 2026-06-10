/**
 * HF1xx — structure & meta rules.
 *
 *   HF101  file matched a hoverfly filename but failed the content fingerprint (D3).
 *          File-level, range = first line; emitted by the service gate (it owns the
 *          filename + fingerprint result), via {@link hf101NotASimulation}.
 *   HF103  schemaVersion is legacy v1–v4 (information; Hoverfly auto-upgrades).
 *   HF104  schemaVersion does not match `^v\d+(\.\d+)?$` (error; unrecognised).
 *
 * HF103/HF104 are a single {@link SemanticRule} ({@link hf1xxSchemaVersionRule}) consuming the
 * model's `meta.schemaVersion` node — they never re-walk the AST.
 */

import type { TextDocument } from "vscode-languageserver-textdocument";
import { type Diagnostic, type Range } from "vscode-languageserver-types";

import { makeDiagnostic } from "../diagnostics.js";
import type { SemanticRule } from "../types.js";

/** Syntactically-valid schema version (decision C4): `v` then digits, optional `.digits`. */
const SCHEMA_VERSION_PATTERN = /^v\d+(?:\.\d+)?$/;

/** Captures the leading major-version digits of a `vN(.M)?` string. */
const MAJOR_VERSION_PATTERN = /^v(?<major>\d+)/;

/** Legacy major versions Hoverfly auto-upgrades on import (v1–v4). */
const LEGACY_MAJORS = new Set([1, 2, 3, 4]);

/** Parse the major version from a `vN(.M)?` string; `undefined` when not parseable. */
function majorVersion(version: string): number | undefined {
  const major = MAJOR_VERSION_PATTERN.exec(version)?.groups?.["major"];
  if (major === undefined) {
    return undefined;
  }
  const parsed = Number(major);
  return Number.isNaN(parsed) ? undefined : parsed;
}

/**
 * HF101: the file matched a hoverfly filename pattern but is not a simulation. File-level,
 * so the range is the document's first line. Built by the service gate, which alone knows
 * the filename and the fingerprint outcome.
 */
export function hf101NotASimulation(document: TextDocument): Diagnostic {
  const firstLine = document.getText().split("\n", 1)[0] ?? "";
  const range: Range = {
    start: { line: 0, character: 0 },
    end: { line: 0, character: firstLine.length },
  };
  return makeDiagnostic(document, "HF101", range);
}

/** HF103 + HF104: validate `meta.schemaVersion`. */
export const hf1xxSchemaVersionRule: SemanticRule = {
  codes: ["HF103", "HF104"],
  run(context): Diagnostic[] {
    const { valueNode } = context.model.meta.schemaVersion;
    // Only inspect a present string value; a missing/non-string version is a schema concern.
    if (!valueNode || valueNode.type !== "string") {
      return [];
    }
    const version = valueNode.value;

    if (!SCHEMA_VERSION_PATTERN.test(version)) {
      // HF104 — unrecognised version syntax.
      return [makeDiagnostic(context.textDocument, "HF104", valueNode, { v: version })];
    }

    const major = majorVersion(version);
    if (major !== undefined && LEGACY_MAJORS.has(major)) {
      // HF103 — legacy v1–v4, auto-upgraded.
      return [makeDiagnostic(context.textDocument, "HF103", valueNode, { v: version })];
    }

    return [];
  },
};

/** All HF1xx model-driven rules (HF101 is emitted by the service gate, not here). */
export const HF1XX_RULES: readonly SemanticRule[] = [hf1xxSchemaVersionRule];
