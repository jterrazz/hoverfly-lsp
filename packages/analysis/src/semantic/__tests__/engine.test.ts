import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import type { Diagnostic } from 'vscode-languageserver-types';

import { applyHF102Layer, createRuleContext, runRules, sortByRange } from '../engine.js';
import type { SemanticRule } from '../rule.js';

function diagnostic(
    code: string,
    [line, from, to]: readonly [number, number, number],
    message = code,
): Diagnostic {
    return {
        code,
        message,
        range: { end: { character: to, line }, start: { character: from, line } },
        severity: DiagnosticSeverity.Error,
    };
}

const document = TextDocument.create('file:///s.hoverfly.json', 'json', 1, '{}');
const context = createRuleContext(document, getLanguageService({}).parseJSONDocument(document));

describe('engine', () => {
    test('runRules — concatenates the rules, and a rule that throws loses its own output alone', () => {
        // Given - a rule that throws between two that answer
        const rules: SemanticRule[] = [
            { codes: ['HF103'], run: () => [diagnostic('HF103', [0, 0, 1])] },
            {
                codes: ['HF104'],
                run: () => {
                    throw new Error('boom');
                },
            },
            { codes: ['HF104'], run: () => [diagnostic('HF104', [1, 0, 1])] },
        ];

        // Then - the two answers, in order
        expect(runRules(rules, context)).toStrictEqual([
            diagnostic('HF103', [0, 0, 1]),
            diagnostic('HF104', [1, 0, 1]),
        ]);
    });

    test.each([
        { label: 'no semantic diagnostic', semantic: [], survives: true },
        {
            label: 'an HF2xx diagnostic on the node',
            semantic: [diagnostic('HF201', [3, 10, 17])],
            survives: false,
        },
        {
            label: 'an HF1xx diagnostic on the node',
            semantic: [diagnostic('HF104', [3, 10, 17])],
            survives: true,
        },
        {
            label: 'an HF308 diagnostic on the node',
            semantic: [diagnostic('HF308', [3, 10, 17])],
            survives: false,
        },
        {
            label: 'an HF404 diagnostic on the node',
            semantic: [diagnostic('HF404', [3, 10, 17])],
            survives: false,
        },
        {
            label: 'an HF405 diagnostic on the node',
            semantic: [diagnostic('HF405', [3, 10, 17])],
            survives: false,
        },
    ])(
        // Given - a schema diagnostic, and $label
        // Then - re-tagged HF102 with the hoverfly source and its href, or dropped when a code that restates it overlaps
        'applyHF102Layer — beside $label',
        ({ semantic, survives }) => {
            const schema = {
                ...diagnostic('0', [3, 10, 17], 'Incorrect type. Expected "array".'),
                source: 'json',
            };
            expect(applyHF102Layer([schema], semantic)).toStrictEqual(
                survives
                    ? [
                          {
                              ...schema,
                              code: 'HF102',
                              codeDescription: {
                                  href: 'https://hoverfly-lsp.dev/diagnostics/hf102',
                              },
                              source: 'hoverfly',
                          },
                      ]
                    : [],
            );
        },
    );

    test('sortByRange — orders by start line, then character, then end', () => {
        // Given - diagnostics out of order
        const unordered = [
            diagnostic('c', [1, 0, 1]),
            diagnostic('a', [0, 2, 3]),
            diagnostic('b', [0, 2, 5]),
            diagnostic('z', [0, 0, 1]),
        ];

        // Then - ascending by position
        expect(sortByRange(unordered).map(({ code }) => code)).toStrictEqual(['z', 'a', 'b', 'c']);
    });
});
