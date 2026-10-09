import type { TextDocument } from 'vscode-languageserver-textdocument';
import type { Diagnostic, Range } from 'vscode-languageserver-types';

import { makeDiagnostic } from '../diagnostics.js';
import type { SemanticRule } from '../rule.js';

// value: decision C4 — `v`, digits, an optional `.digits`.
const SCHEMA_VERSION_PATTERN = /^v\d+(?:\.\d+)?$/u;

const MAJOR_VERSION_PATTERN = /^v(?<major>\d+)/u;

// outside: Hoverfly upgrades v1–v4 on import.
const LEGACY_MAJORS = new Set([1, 2, 3, 4]);

function majorVersion(version: string): number | undefined {
    const major = MAJOR_VERSION_PATTERN.exec(version)?.groups?.major;
    if (major === undefined) {
        return undefined;
    }
    const parsed = Number(major);
    return Number.isNaN(parsed) ? undefined : parsed;
}

/** HF101 on the document's first line: named for Hoverfly, yet no simulation — built by the service gate, which alone knows both. */
export function hf101NotASimulation(document: TextDocument): Diagnostic {
    const firstLine = document.getText().split('\n', 1)[0] ?? '';
    const range: Range = {
        start: { line: 0, character: 0 },
        end: { line: 0, character: firstLine.length },
    };
    return makeDiagnostic(document, 'HF101', range);
}

/** HF103 + HF104: validate `meta.schemaVersion`. */
export const hf1xxSchemaVersionRule: SemanticRule = {
    codes: ['HF103', 'HF104'],
    run(context): Diagnostic[] {
        const { valueNode } = context.model.meta.schemaVersion;
        if (!valueNode || valueNode.type !== 'string') {
            return [];
        }
        const version = valueNode.value;

        if (!SCHEMA_VERSION_PATTERN.test(version)) {
            return [makeDiagnostic(context.textDocument, 'HF104', valueNode, { v: version })];
        }

        const major = majorVersion(version);
        if (major !== undefined && LEGACY_MAJORS.has(major)) {
            return [makeDiagnostic(context.textDocument, 'HF103', valueNode, { v: version })];
        }

        return [];
    },
};

/** All HF1xx model-driven rules (HF101 is emitted by the service gate, not here). */
export const HF1XX_RULES: readonly SemanticRule[] = [hf1xxSchemaVersionRule];
