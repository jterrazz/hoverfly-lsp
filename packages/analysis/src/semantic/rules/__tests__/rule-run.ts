import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';

import { createRuleContext } from '../../engine.js';
import type { HoverflyServiceSettings, SemanticRule } from '../../rule.js';

const SEVERITIES: ReadonlyMap<unknown, string> = new Map([
    [DiagnosticSeverity.Error, 'error'],
    [DiagnosticSeverity.Warning, 'warning'],
    [DiagnosticSeverity.Information, 'information'],
    [DiagnosticSeverity.Hint, 'hint'],
]);

const parser = getLanguageService({});

/** Each diagnostic a rule emits over a simulation, as `code severity line:char-line:char message`. */
export function diagnosticsOf(
    rule: SemanticRule,
    simulation: unknown,
    settings?: HoverflyServiceSettings,
): string[] {
    const text = typeof simulation === 'string' ? simulation : JSON.stringify(simulation, null, 2);
    const document = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
    return rule
        .run(createRuleContext(document, parser.parseJSONDocument(document), settings ?? {}))
        .map((diagnostic) => {
            const { end, start } = diagnostic.range;
            return `${String(diagnostic.code)} ${SEVERITIES.get(diagnostic.severity) ?? 'none'} ${start.line}:${start.character}-${end.line}:${end.character} ${Diagnostic.getMessageString(diagnostic)}`;
        });
}

/** A one-pair simulation around a request and a response, beside the data keys given. */
export function pairOf(request: unknown, response?: unknown, data?: unknown): object {
    const keys = typeof data === 'object' && data !== null ? data : {};
    return {
        data: { ...keys, pairs: [{ request, response: response ?? { status: 200 } }] },
        meta: { schemaVersion: 'v5.3' },
    };
}
