import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';

import { createRuleContext } from '../engine.js';
import { structureRule } from './structure.js';

const ls = getLanguageService({});

function run(value: unknown) {
    const text = JSON.stringify(value);
    const doc = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
    return structureRule.run(createRuleContext(doc, ls.parseJSONDocument(doc)));
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

/** A one-pair simulation with the given request/response objects. */
function sim(request: unknown, response: unknown, extra: Record<string, unknown> = {}) {
    return {
        data: { pairs: [{ request, response }], ...extra },
        meta: { schemaVersion: 'v5.3' },
    };
}

describe('hF603 — unknown key (silent drop) with did-you-mean', () => {
    test('flags a true typo on request with the nearest canonical suggestion', () => {
        // Given - a `methd` typo (the user's observed bug)
        const diags = run(sim({ methd: [{ matcher: 'exact', value: 'GET' }] }, { status: 200 }));
        // Then - one HF603 warning suggesting `method`
        expect(codes(diags)).toStrictEqual(['HF603']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
        expect(diags[0]?.message).toContain('did you mean "method"');
    });

    test('flags nested field-matcher / response / globalActions / meta typos at every level', () => {
        // Given - a typo at multiple closed-object levels
        const diags = run(
            sim(
                { path: [{ matcher: 'exact', value: '/a', machter: 'glob' }] },
                { status: 200, transitionState: { x: '1' } },
                {
                    globalActions: { delays: [{ delay: 1, urlPatter: '/a' }] },
                    literals: [{ name: 'n', value: 'v', values: 'oops' }],
                },
            ),
        );
        // Then - HF603 fires for each (machter, transitionState, urlPatter, values)
        const messages = diags
            .filter((d) => d.code === 'HF603')
            .map((d) => Diagnostic.getMessageString(d));
        expect(messages).toHaveLength(4);
        expect(messages.some((m) => m.includes('"machter"') && m.includes('matcher'))).toBeTruthy();
        expect(messages.some((m) => m.includes('"transitionState"'))).toBeTruthy();
    });

    test('omits the suggestion when no allowed key is within distance 2', () => {
        // Given - an unknown key far from every allowed key
        const diags = run(sim({ path: [], somethingEntirelyDifferent: 1 }, { status: 200 }));
        // Then - HF603 with no `did you mean` suffix
        expect(codes(diags)).toStrictEqual(['HF603']);
        expect(diags[0]?.message).not.toContain('did you mean');
    });

    test('does NOT flag `request.method` (legal despite being schema-absent)', () => {
        // Given - the schema-absent-but-legal `method` key
        expect(
            run(sim({ method: [{ matcher: 'exact', value: 'GET' }] }, { status: 200 })),
        ).toStrictEqual([]);
    });

    test('does NOT flag user-defined keys inside headers/query/state maps', () => {
        // Given - arbitrary header / query / state names
        const diags = run(
            sim(
                {
                    headers: { 'X-Custom': [{ matcher: 'glob', value: '*' }] },
                    query: { anyParam: [{ matcher: 'exact', value: '1' }] },
                    requiresState: { whateverStateName: 'v' },
                },
                {
                    status: 200,
                    headers: { 'X-Out': ['v'] },
                    transitionsState: { someStateKey: 'v' },
                },
            ),
        );
        // Then - none of the user-defined map keys are flagged as unknown
        expect(codes(diags)).toStrictEqual([]);
    });

    test('does NOT run on the ROOT object (already HF102 via additionalProperties)', () => {
        // Given - an unknown ROOT key
        const text = JSON.stringify({
            data: { pairs: [] },
            meta: { schemaVersion: 'v5.3' },
            dataX: 1,
        });
        const doc = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
        // Then - the structure rule emits nothing for the root typo (HF102 owns it)
        const diags = structureRule.run(createRuleContext(doc, ls.parseJSONDocument(doc)));
        expect(diags).toStrictEqual([]);
    });
});

describe('hF604 — case-only variant of a known key', () => {
    test('flags `Method`/`BodyFile` as HF604 only (never HF603)', () => {
        // Given - case variants that Go binds case-insensitively
        const diags = run(
            sim(
                { Method: [{ matcher: 'exact', value: 'GET' }] },
                { status: 200, BodyFile: 'f.json' },
            ),
        );
        // Then - two HF604 information diagnostics, no HF603
        expect(codes(diags)).toStrictEqual(['HF604', 'HF604']);
        for (const diagnostic of diags) {
            expect(diagnostic.severity).toBe(DiagnosticSeverity.Information);
        }
        expect(diags[0]?.message).toContain('canonical "method"');
    });
});

describe('hF212 — field-matcher with no value', () => {
    test('flags a matcher-only object and an empty {}', () => {
        // Given - `{matcher:"exact"}` (no value) and an empty `{}`
        const diags = run(sim({ path: [{ matcher: 'exact' }], method: [{}] }, { status: 200 }));
        // Then - two HF212 warnings
        expect(codes(diags)).toStrictEqual(['HF212', 'HF212']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
    });

    test('does NOT flag a bare {value} shorthand, nor `negate`/`form` (other codes own those)', () => {
        // Given - a legal default-exact shorthand, a value-less negate, and a value-less form
        const diags = run(
            sim(
                {
                    scheme: [{ value: 'https' }],
                    destination: [{ matcher: 'negate' }],
                    body: [{ matcher: 'form' }],
                },
                { status: 200 },
            ),
        );
        // Then - HF212 stays silent on all three
        expect(codes(diags)).not.toContain('HF212');
    });
});

describe('hF308 — response header not an array of strings', () => {
    test('flags a plain-string header and an array with a non-string element', () => {
        // Given - a string header, a mixed array, and a valid string array
        const diags = run(
            sim(
                { path: [{ matcher: 'exact', value: '/a' }] },
                { status: 200, headers: { A: 'x', B: [1, '2'], C: ['ok'] } },
            ),
        );
        // Then - HF308 fires for A and B only
        expect(codes(diags)).toStrictEqual(['HF308', 'HF308']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Error);
    });
});

describe('hF404 / HF405 — non-string state values', () => {
    test('flags non-string requiresState/transitionsState values (HF404)', () => {
        // Given - boolean and number state values
        const diags = run(
            sim(
                { path: [{ matcher: 'exact', value: '/a' }], requiresState: { a: true } },
                { status: 200, transitionsState: { b: 2 } },
            ),
        );
        const hf404 = diags.filter((d) => d.code === 'HF404');
        // Then - two HF404 errors
        expect(hf404).toHaveLength(2);
        expect(hf404[0]?.severity).toBe(DiagnosticSeverity.Error);
    });

    test('flags non-string removesState entries (HF405), one per bad element', () => {
        // Given - a removesState mixing strings and non-strings
        const diags = run(
            sim(
                { path: [{ matcher: 'exact', value: '/a' }] },
                { status: 200, removesState: ['ok', 5, true] },
            ),
        );
        const hf405 = diags.filter((d) => d.code === 'HF405');
        // Then - two HF405 errors (for 5 and true), not for "ok"
        expect(hf405).toHaveLength(2);
        expect(hf405[0]?.severity).toBe(DiagnosticSeverity.Error);
    });
});
