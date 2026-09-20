import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';
import { DiagnosticSeverity } from 'vscode-languageserver-types';

import { createRuleContext } from '../engine.js';
import type { HoverflyServiceSettings } from '../types.js';
import { hf601DelayPatternRule, hf602PostServeActionRule } from './hf6xx.js';

const ls = getLanguageService({});

/**
 * Build a rule context, optionally attaching service settings. HF602 reads its allowlist off
 * `RuleContext.settings`, which the framework now plumbs through `createRuleContext`.
 */
function contextOf(text: string, settings?: HoverflyServiceSettings) {
    const doc = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
    return createRuleContext(doc, ls.parseJSONDocument(doc), settings);
}

const codes = (diags: { code?: unknown }[]) => diags.map((d) => String(d.code));

/** A simulation with the given globalActions delays (HF601 fixtures). */
function withDelays(delays: unknown[]): string {
    return JSON.stringify({
        data: { pairs: [], globalActions: { delays } },
        meta: { schemaVersion: 'v5.3' },
    });
}

/** A single-pair simulation whose response carries the given postServeAction (HF602 fixtures). */
function withAction(action: string): string {
    return JSON.stringify({
        data: {
            pairs: [
                {
                    request: { path: [{ matcher: 'exact', value: '/' }] },
                    response: { status: 200, postServeAction: action },
                },
            ],
        },
        meta: { schemaVersion: 'v5.3' },
    });
}

describe('hF601 — invalid globalActions delay urlPattern', () => {
    test('warns on an unbalanced-bracket pattern', () => {
        // Given - a delay with a malformed regex urlPattern
        const diags = hf601DelayPatternRule.run(
            contextOf(withDelays([{ urlPattern: '(unbalanced', delay: 100 }])),
        );
        // Then - one HF601 warning on the pattern
        expect(codes(diags)).toStrictEqual(['HF601']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Warning);
    });

    test('accepts a valid regex pattern', () => {
        // Given - a well-formed regex
        const diags = hf601DelayPatternRule.run(
            contextOf(withDelays([{ urlPattern: '^/api/.*$', delay: 100 }])),
        );
        expect(diags).toStrictEqual([]);
    });

    test('is silent when urlPattern is absent or non-string', () => {
        // Given - a delay with no urlPattern, then a non-string one
        const noPattern = hf601DelayPatternRule.run(contextOf(withDelays([{ delay: 100 }])));
        expect(noPattern).toStrictEqual([]);
        const nonString = hf601DelayPatternRule.run(
            contextOf(withDelays([{ urlPattern: 42, delay: 100 }])),
        );
        expect(nonString).toStrictEqual([]);
    });

    test('also scans delaysLogNormal[] (both arrays flagged)', () => {
        // Given - a malformed regex in BOTH delays and delaysLogNormal
        const text = JSON.stringify({
            data: {
                pairs: [],
                globalActions: {
                    delays: [{ urlPattern: '(unbalanced', delay: 100 }],
                    delaysLogNormal: [{ urlPattern: '*bad', min: 1, max: 2 }],
                },
            },
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - two HF601 warnings, one per array
        const diags = hf601DelayPatternRule.run(contextOf(text));
        expect(codes(diags)).toStrictEqual(['HF601', 'HF601']);
    });

    test('flags a malformed regex in delaysLogNormal alone', () => {
        // Given - only delaysLogNormal carries a bad pattern
        const text = JSON.stringify({
            data: {
                pairs: [],
                globalActions: { delaysLogNormal: [{ urlPattern: '(unbalanced', min: 1, max: 2 }] },
            },
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - HF601 fires on the log-normal pattern
        const diags = hf601DelayPatternRule.run(contextOf(text));
        expect(codes(diags)).toStrictEqual(['HF601']);
    });
});

describe('hF602 — postServeAction not in registeredActions allowlist', () => {
    test('is silent when no allowlist is configured (default)', () => {
        // Given - a postServeAction but no settings
        const diags = hf602PostServeActionRule.run(contextOf(withAction('webhook')));
        expect(diags).toStrictEqual([]);
    });

    test('is silent when the allowlist is empty', () => {
        // Given - an explicitly empty allowlist
        const diags = hf602PostServeActionRule.run(
            contextOf(withAction('webhook'), { registeredActions: [] }),
        );
        expect(diags).toStrictEqual([]);
    });

    test('flags an action not in a non-empty allowlist', () => {
        // Given - allowlist that does not contain the action
        const diags = hf602PostServeActionRule.run(
            contextOf(withAction('webhook'), { registeredActions: ['logger'] }),
        );
        // Then - one HF602 information diagnostic naming the action
        expect(codes(diags)).toStrictEqual(['HF602']);
        expect(diags[0]?.severity).toBe(DiagnosticSeverity.Information);
        expect(diags[0]?.message).toContain('webhook');
    });

    test('accepts an action present in the allowlist', () => {
        // Given - the action is allowlisted
        const diags = hf602PostServeActionRule.run(
            contextOf(withAction('webhook'), { registeredActions: ['webhook'] }),
        );
        expect(diags).toStrictEqual([]);
    });
});
