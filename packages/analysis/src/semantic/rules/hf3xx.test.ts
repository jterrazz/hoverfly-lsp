import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { Diagnostic, DiagnosticSeverity } from 'vscode-languageserver-types';

import { createRuleContext } from '../engine.js';
import { hf3xxResponseRule } from './hf3xx.js';

const ls = getLanguageService({});

/** Build a rule context from raw simulation text. */
function contextOf(text: string) {
    const doc = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
    return createRuleContext(doc, ls.parseJSONDocument(doc));
}

/** Wrap one response object into a single-pair simulation and run HF3xx over it. */
function diagnoseResponse(response: Record<string, unknown>) {
    const sim = {
        data: { pairs: [{ request: { path: [{ matcher: 'exact', value: '/' }] }, response }] },
        meta: { schemaVersion: 'v5.3' },
    };
    return hf3xxResponseRule.run(contextOf(JSON.stringify(sim)));
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

/** The message of the first diagnostic, as plain text — `undefined` when there is none. */
const firstMessage = (diags: Diagnostic[]) => {
    const first = diags[0];
    return first === undefined ? undefined : Diagnostic.getMessageString(first);
};

describe('hF301 — body and bodyFile both set', () => {
    test('warns and points at the bodyFile key', () => {
        // Given - a response with both body and bodyFile
        const diags = diagnoseResponse({ status: 200, body: 'hi', bodyFile: 'out.txt' });
        // Then - one HF301 warning
        expect(codes(diags)).toStrictEqual(['HF301']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
    });

    test('stays silent when only one of body/bodyFile is set', () => {
        // Given - body only, then bodyFile only
        expect(diagnoseResponse({ status: 200, body: 'hi' })).toStrictEqual([]);
        expect(diagnoseResponse({ status: 200, bodyFile: 'out.txt' })).toStrictEqual([]);
    });
});

describe('hF302 — Content-Length and Transfer-Encoding both set', () => {
    test('warns on the second header key (case-insensitive names)', () => {
        // Given - both conflicting headers, with array-shaped header values
        const diags = diagnoseResponse({
            status: 200,
            headers: { 'content-length': ['3'], 'Transfer-Encoding': ['chunked'] },
        });
        // Then - one HF302 warning
        expect(codes(diags)).toStrictEqual(['HF302']);
    });

    test('stays silent with only one of the two', () => {
        // Given - just Content-Length
        expect(
            diagnoseResponse({ status: 200, headers: { 'Content-Length': ['3'] } }),
        ).toStrictEqual([]);
    });
});

describe('hF303 — Content-Length mismatch', () => {
    test('warns when Content-Length disagrees with UTF-8 byte length', () => {
        // Given - a 5-byte body declared as length 3
        const diags = diagnoseResponse({
            status: 200,
            body: 'hello',
            headers: { 'Content-Length': ['3'] },
        });
        // Then - one HF303 carrying declared (3) and actual (5)
        expect(codes(diags)).toStrictEqual(['HF303']);
        expect(diags[0]?.message).toContain('3');
        expect(diags[0]?.message).toContain('5');
    });

    test('uses UTF-8 byte length, not code-unit length', () => {
        // Given - a 2-codepoint body that is 6 UTF-8 bytes ("€€"), declared as 2
        const diags = diagnoseResponse({
            status: 200,
            body: '€€',
            headers: { 'Content-Length': ['2'] },
        });
        // Then - HF303 reports actual byte length 6, not 2
        expect(diags[0]?.message).toContain('6');
    });

    test('is silent when length matches', () => {
        // Given - a correct Content-Length
        expect(
            diagnoseResponse({ status: 200, body: 'hello', headers: { 'Content-Length': ['5'] } }),
        ).toStrictEqual([]);
    });

    test('skips when templated/encodedBody/bodyFile makes the body unmeasurable', () => {
        // Given - templated body with a stale Content-Length
        expect(
            diagnoseResponse({
                status: 200,
                body: '{{ Request.Body }}',
                templated: true,
                headers: { 'Content-Length': ['3'] },
            }),
        ).toStrictEqual([]);
        // Given - encodedBody true
        expect(
            diagnoseResponse({
                status: 200,
                body: 'aGVsbG8=',
                encodedBody: true,
                headers: { 'Content-Length': ['3'] },
            }),
        ).toStrictEqual([]);
    });
});

describe('hF304 — status out of range', () => {
    test.each([99, 600, 0, 700])('warns on status %i', (status) => {
        // Given - an out-of-range status
        const diags = diagnoseResponse({ status });
        // Then - one HF304
        expect(codes(diags)).toStrictEqual(['HF304']);
    });

    test.each([100, 200, 404, 599])('accepts in-range status %i', (status) => {
        // Given - an in-range status
        expect(diagnoseResponse({ status })).toStrictEqual([]);
    });
});

describe('hF305 — encodedBody but invalid base64', () => {
    test('warns on a non-base64 body when encodedBody is true', () => {
        // Given - encodedBody true with an obviously non-base64 body
        const diags = diagnoseResponse({ status: 200, body: 'not base64!!', encodedBody: true });
        // Then - one HF305 on the body
        expect(codes(diags)).toStrictEqual(['HF305']);
    });

    test('accepts valid padded base64', () => {
        // Given - "hello" base64-encoded
        expect(
            diagnoseResponse({ status: 200, body: 'aGVsbG8=', encodedBody: true }),
        ).toStrictEqual([]);
    });

    test('accepts an empty body (decodes to empty) and ignores when encodedBody is false', () => {
        // Given - empty body / encodedBody false
        expect(diagnoseResponse({ status: 200, body: '', encodedBody: true })).toStrictEqual([]);
        expect(
            diagnoseResponse({ status: 200, body: 'not base64!!', encodedBody: false }),
        ).toStrictEqual([]);
    });
});

describe('hF306 — negative fixedDelay', () => {
    test('warns on a negative fixedDelay and is silent on >= 0', () => {
        // Given - negative delay
        expect(codes(diagnoseResponse({ status: 200, fixedDelay: -100 }))).toStrictEqual(['HF306']);
        // Given - zero and positive delay (both ignored / valid)
        expect(diagnoseResponse({ status: 200, fixedDelay: 0 })).toStrictEqual([]);
        expect(diagnoseResponse({ status: 200, fixedDelay: 250 })).toStrictEqual([]);
    });
});

describe('hF307 — logNormalDelay constraints', () => {
    test('accepts a valid log-normal delay', () => {
        // Given - min<=median<=mean<=max, all > 0
        expect(
            diagnoseResponse({
                status: 200,
                logNormalDelay: { min: 10, max: 100, mean: 50, median: 40 },
            }),
        ).toStrictEqual([]);
    });

    test('warns when mean or median <= 0', () => {
        // Given - mean 0 (Go: mean <= 0 fails)
        const diags = diagnoseResponse({ status: 200, logNormalDelay: { mean: 0, median: 5 } });
        expect(codes(diags)).toStrictEqual(['HF307']);
        expect(firstMessage(diags)?.toLowerCase()).toContain('mean');
    });

    test('warns when min is negative', () => {
        // Given - negative min
        const diags = diagnoseResponse({
            status: 200,
            logNormalDelay: { min: -1, max: 100, mean: 50, median: 40 },
        });
        expect(codes(diags)).toStrictEqual(['HF307']);
    });

    test('warns when max < min', () => {
        // Given - max below min
        const diags = diagnoseResponse({
            status: 200,
            logNormalDelay: { min: 100, max: 10, mean: 50, median: 40 },
        });
        expect(codes(diags)).toStrictEqual(['HF307']);
    });

    test('warns when median > mean', () => {
        // Given - median above mean (no max bound)
        const diags = diagnoseResponse({
            status: 200,
            logNormalDelay: { mean: 30, median: 50 },
        });
        expect(codes(diags)).toStrictEqual(['HF307']);
        expect(firstMessage(diags)?.toLowerCase()).toContain('median');
    });
});

describe('hF3xx — exported rule shape', () => {
    test('declares the seven HF3xx codes and never throws on a malformed model', () => {
        // Given - the rule's advertised codes
        expect(hf3xxResponseRule.codes).toStrictEqual([
            'HF301',
            'HF302',
            'HF303',
            'HF304',
            'HF305',
            'HF306',
            'HF307',
        ]);
        // Then - running over junk input yields no throw and no diagnostics
        expect(hf3xxResponseRule.run(contextOf(`{"data":123}`))).toStrictEqual([]);
    });
});
