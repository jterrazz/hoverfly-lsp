import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, Range } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import type { SemanticRule } from '../rule.js';

// value: decision C4 — `v`, digits, an optional `.digits`.
const SCHEMA_VERSION_PATTERN = /^v\d+(?:\.\d+)?$/u;

// outside: Hoverfly upgrades v1–v4 on import.
const LEGACY_MAJORS = new Set([1, 2, 3, 4]);

/** HF101 on the document's first line: named for Hoverfly, yet no simulation — built by the service gate, which alone knows both. */
export function hf101NotASimulation(document: TextDocument): Diagnostic {
    const firstLine = document.getText().replace(/\n[\s\S]*/u, '');
    const range: Range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: firstLine.length },
    };
    return makeDiagnostic(document, 'HF101', range);
}

/** HF103 + HF104: validate `meta.schemaVersion`. */
export const hf1xxSchemaVersionRule: SemanticRule = {
    run(context): Diagnostic[] {
        const { valueNode } = context.model.meta.schemaVersion;
        if (valueNode?.type !== 'string') {
            return [];
        }
        const version = valueNode.value;

        if (!SCHEMA_VERSION_PATTERN.test(version)) {
            return [makeDiagnostic(context.textDocument, 'HF104', valueNode, { v: version })];
        }

        // invariant: the pattern above held, so the digits after `v` up to any `.` are the major.
        if (LEGACY_MAJORS.has(Number.parseInt(version.slice(1), 10))) {
            return [makeDiagnostic(context.textDocument, 'HF103', valueNode, { v: version })];
        }

        return [];
    },
};

/** All HF1xx model-driven rules (HF101 is emitted by the service gate, not here). */
export const HF1XX_RULES: readonly SemanticRule[] = [hf1xxSchemaVersionRule];
