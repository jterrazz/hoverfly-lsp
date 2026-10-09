import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';
import type { Diagnostic } from 'vscode-languageserver-types';

import { applyHF102Layer, createRuleContext, runRules, sortByRange } from '../engine.js';
import type { SemanticRule } from '../rule.js';

type Span = readonly [number, number, number, number] | readonly [number, number, number];

function diagnostic(code: string, span: Span, message = code): Diagnostic {
    const [line, from, toLine, to] =
        span.length === 3 ? [span[0], span[1], span[0], span[2]] : span;
    return {
        code,
        message,
        range: { end: { character: to, line: toLine }, start: { character: from, line } },
        severity: DiagnosticSeverity.Error,
    };
}

const document = TextDocument.create('file:///s.hoverfly.json', 'json', 1, '{}');
const context = createRuleContext(document, getLanguageService({}).parseJSONDocument(document));

describe('engine', () => {
    test('runRules — concatenates the rules, and a rule that throws loses its own output alone', () => {
        // Given - a rule that throws between two that answer
        const rules: SemanticRule[] = [
            { run: () => [diagnostic('HF103', [0, 0, 1])] },
            {
                run: () => {
                    throw new Error('boom');
                },
            },
            { run: () => [diagnostic('HF104', [1, 0, 1])] },
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
        {
            label: 'an HF201 ending just before it',
            semantic: [diagnostic('HF201', [3, 0, 9])],
            survives: true,
        },
        {
            label: 'an HF201 ending where it starts',
            semantic: [diagnostic('HF201', [3, 0, 10])],
            survives: false,
        },
        {
            label: 'an HF201 starting where it ends',
            semantic: [diagnostic('HF201', [3, 17, 20])],
            survives: false,
        },
        {
            label: 'an HF201 starting just after it',
            semantic: [diagnostic('HF201', [3, 18, 20])],
            survives: true,
        },
        {
            label: 'an HF201 on earlier lines',
            semantic: [diagnostic('HF201', [1, 0, 2, 40])],
            survives: true,
        },
        {
            label: 'an HF201 on a later line',
            semantic: [diagnostic('HF201', [4, 0, 5])],
            survives: true,
        },
        {
            label: 'an HF201 spanning its line',
            semantic: [diagnostic('HF201', [2, 50, 4, 0])],
            survives: false,
        },
        {
            label: 'an HF201 ending inside it',
            semantic: [diagnostic('HF201', [2, 5, 3, 12])],
            survives: false,
        },
        {
            label: 'an HF201 starting inside it',
            semantic: [diagnostic('HF201', [3, 15, 5, 0])],
            survives: false,
        },
        {
            label: 'an HF201 ending on its line before it',
            semantic: [diagnostic('HF201', [2, 0, 3, 5])],
            survives: true,
        },
        {
            label: 'an HF201 starting on its line after it',
            semantic: [diagnostic('HF201', [3, 20, 5, 0])],
            survives: true,
        },
        {
            label: 'a code with text before HF2xx',
            semantic: [diagnostic('XHF201', [3, 10, 17])],
            survives: true,
        },
        {
            label: 'a code with digits after HF2xx',
            semantic: [diagnostic('HF2011', [3, 10, 17])],
            survives: true,
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

    test('applyHF102Layer — keeps a schema diagnostic with no severity without one', () => {
        // Given - a schema diagnostic that carries no severity
        const { severity: _severity, ...schema } = diagnostic(
            '0',
            [3, 10, 17],
            'Missing property.',
        );

        // Then - the re-tagged HF102, still with no severity key
        expect(applyHF102Layer([schema], [])).toStrictEqual([
            {
                ...schema,
                code: 'HF102',
                codeDescription: { href: 'https://hoverfly-lsp.dev/diagnostics/hf102' },
                source: 'hoverfly',
            },
        ]);
    });

    test('sortByRange — orders by start line, then character, then end line, then end character', () => {
        // Given - diagnostics out of order
        const unordered = [
            diagnostic('c', [1, 0, 1]),
            diagnostic('d', [0, 2, 1, 0]),
            diagnostic('b', [0, 2, 5]),
            diagnostic('a', [0, 2, 3]),
            diagnostic('e', [0, 2, 4]),
            diagnostic('z', [0, 0, 1]),
        ];

        // Then - ascending by position
        expect(sortByRange(unordered).map(({ code }) => code)).toStrictEqual([
            'z',
            'a',
            'e',
            'b',
            'd',
            'c',
        ]);
    });
});
