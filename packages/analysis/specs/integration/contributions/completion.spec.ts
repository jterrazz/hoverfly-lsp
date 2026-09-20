import { describe, expect, test } from 'vitest';

import { REGISTRY_MATCHER_NAMES } from '../../../src/registry/index.js';
import { completionsAt, expectLabels } from '../fourslash/harness.js';
import { integration } from '../integration.specification.js';

/** Matcher names offered everywhere = the registry names minus the empty default matcher. */
const NAMED_MATCHERS = REGISTRY_MATCHER_NAMES.filter((name) => name !== '');

describe('matcher-name completions', () => {
    test('offers the named registry matchers on request.path (quoted value)', async () => {
        // Given - a cursor inside the quoted matcher value on request.path
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        /*
         * Then - the dropdown is EXACTLY the body-excluded registry names: no `form` (path is not
         * body), no empty default, and crucially no quoted-label `"form"`/`"exact"` duplicates from
         * schema `examples`. Asserting the full label set (not just `notContains: ["form"]`) is what
         * catches the quoted-label leak the schema previously produced.
         */
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { exact: NAMED_MATCHERS });
    });

    test('offers matchers on an UNQUOTED matcher value position', async () => {
        // Given - a bare (unquoted) value position after the colon
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":⟦⟧}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the same named matchers are offered (insertText quotes them)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['exact', 'regex', 'jsonpath'] });
    });

    test('adds `form` ONLY on request.body', async () => {
        // Given - a matcher value on request.body
        const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        /*
         * Then - the dropdown is EXACTLY the registry names INCLUDING the body-only `form`, with no
         * duplicate quoted-label items (schema `examples` no longer contribute matcher names).
         */
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { exact: [...NAMED_MATCHERS, 'form'] });
    });

    test('offers matchers inside a header matcher array', async () => {
        // Given - a matcher value inside request.headers.<name>[]
        const doc = `{"data":{"pairs":[{"request":{"headers":{"Accept":[{"matcher":"⟦⟧"}]}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - registry matchers are offered but not `form` (headers are not body)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['exact'], notContains: ['form'] });
    });

    test('offers matchers inside a doMatch chain link', async () => {
        // Given - a matcher value inside a nested doMatch
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"jsonpath","value":"$.x","doMatch":{"matcher":"⟦⟧"}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - matcher names are offered in the chained position too
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['exact', 'regex'] });
    });

    test('carries documentation, detail, and a quoted insertText on each item', async () => {
        // Given - a matcher value position
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // When - completions are produced
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, { contains: ['regex'] });
        const regex = items.find((i) => i.label === 'regex');
        // Then - the item sources docs/detail from the registry and quotes its insert text
        expect(regex?.detail).toContain('value:');
        const documentation = regex?.documentation;
        const docText = typeof documentation === 'string' ? documentation : documentation?.value;
        expect(docText).toContain('Regular-expression match');
        expect(docText).toContain('Value type:');
        expect(regex?.insertText).toBe('"regex"');
    });

    test('keeps completion documentation consistent with the hover policy (no generic panic notes)', async () => {
        // Given - a matcher value position; documentation shares the docs.ts renderer with hover
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, { contains: ['regex', 'array'] });
        const docOf = (label: string): string => {
            const documentation = items.find((i) => i.label === label)?.documentation;
            return typeof documentation === 'string' ? documentation : (documentation?.value ?? '');
        };
        // Then - regex (no footgun) carries no ⚠️ note and no generic panic text
        const regexDoc = docOf('regex');
        expect(regexDoc).not.toContain('⚠️');
        expect(regexDoc).not.toContain('Unknown matcher name');
        expect(regexDoc).toContain('**Config:** not supported.');
        // And - array still carries its OWN config-keys footgun, but not the generic panic
        const arrayDoc = docOf('array');
        expect(arrayDoc).toContain('⚠️');
        expect(arrayDoc).toContain('must be a JSON boolean');
        expect(arrayDoc).not.toContain('Unknown matcher name');
    });
});

describe('matcher-name completions — negative contexts', () => {
    test('does NOT offer matcher names in a non-simulation JSON document', async () => {
        // Given - arbitrary JSON whose shape coincidentally has a "matcher" key but no sim fingerprint
        const doc = `{"random":{"matcher":"⟦⟧"}}`;
        // Then - no Hoverfly matcher completions are injected (path is not a request matcher position)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { notContains: NAMED_MATCHERS });
    });

    test('does not offer matcher names on a response field', async () => {
        // Given - a cursor in the response.body string (not a matcher position)
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - no matcher-name completions appear
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { notContains: NAMED_MATCHERS });
    });

    test('does not crash and offers nothing Hoverfly-specific on broken JSON', async () => {
        // Given - a structurally broken document with a dangling matcher value
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"`;
        const result = await integration.call(async () => await completionsAt(doc, ''));
        // Then - the service stays alive: matcher completion may or may not fire, but the call
        // Answered a list rather than refusing.
        await expect(result.error).toBeEmpty();
        expect(Array.isArray(result.value.value)).toBe(true);
    });
});

describe('method/scheme value completions', () => {
    test('offers the standard HTTP methods on an exact method value', async () => {
        // Given - a cursor in a method matcher value with an exact matcher
        const doc = `{"data":{"pairs":[{"request":{"method":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the IANA core methods are offered, quoted on insert
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, {
            contains: ['GET', 'POST', 'DELETE', 'PATCH'],
        });
        const get = items.find((i) => i.label === 'GET');
        expect(get?.insertText).toBe('"GET"');
    });

    test('offers methods when the matcher key is absent (default-exact)', async () => {
        // Given - a method matcher with no `matcher` key (defaults to exact)
        const doc = `{"data":{"pairs":[{"request":{"method":[{"value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - methods are still offered (default-exact is enum-shaped)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['GET', 'OPTIONS'] });
    });

    test('offers http/https/ws/wss on an exact scheme value', async () => {
        // Given - a cursor in a scheme matcher value with an exact matcher
        const doc = `{"data":{"pairs":[{"request":{"scheme":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the common schemes are offered
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { exact: ['http', 'https', 'ws', 'wss'] });
    });

    test('offers NOTHING on a regex method value (a pattern, not an enum)', async () => {
        // Given - a method matcher whose matcher is regex
        const doc = `{"data":{"pairs":[{"request":{"method":[{"matcher":"regex","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - no method-value completions appear (the values are not offered for a pattern)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { notContains: ['GET', 'POST', 'DELETE'] });
    });

    test('offers NOTHING on a glob scheme value', async () => {
        // Given - a scheme matcher whose matcher is glob
        const doc = `{"data":{"pairs":[{"request":{"scheme":[{"matcher":"glob","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - no scheme-value completions appear
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { notContains: ['http', 'https'] });
    });

    test('does not offer method values on a free-string field like path', async () => {
        // Given - a cursor in a path matcher value (path is a free string, not an enum)
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - no method/scheme enum values leak onto path
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { notContains: ['GET', 'http'] });
    });
});

describe('schemaVersion completions', () => {
    test('offers v5.3 (preferred) plus v5/v5.1/v5.2', async () => {
        // Given - a cursor in the meta.schemaVersion value
        const doc = `{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧"}}`;
        // Then - the four version values are offered (the contribution's labels are unquoted; the
        // Schema's `examples` add quoted-label duplicates, which is harmless)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, {
            contains: ['v5.3', 'v5', 'v5.1', 'v5.2'],
        });
        const preferred = items.find((i) => i.label === 'v5.3');
        // Then - v5.3 is preselected and sorts first
        expect(preferred?.preselect).toBeTruthy();
        expect(preferred?.sortText).toBe('0');
        expect(preferred?.insertText).toBe('"v5.3"');
    });
});

describe('postServeAction completions', () => {
    test('offers registered actions when the setting is provided', async () => {
        // Given - a cursor in response.postServeAction and a registeredActions allowlist
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the configured action names are offered
        const completions = await integration.call(
            async () =>
                await completionsAt(doc, '', {
                    settings: { registeredActions: ['webhook', 'logger'] },
                }),
        );
        expectLabels(completions.value.value, { contains: ['webhook', 'logger'] });
    });

    test('offers nothing when no registeredActions are configured', async () => {
        // Given - a postServeAction position but no settings
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - no postServeAction completions (runtime-registered, unknowable from the file)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expect(completions.value.value).toHaveLength(0);
    });
});

describe('state-key cross-reference completions', () => {
    test('offers requiresState keys declared elsewhere in the file, plus a sequence: snippet', async () => {
        // Given - one pair declares requiresState keys; a second pair is typing a new requiresState key
        const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"cart":"full","loggedIn":"yes"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}],"requiresState":{"⟦⟧":""}},"response":{"status":200}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the cross-referenced keys are offered as property completions, plus sequence:
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['cart', 'loggedIn', 'sequence:'] });
    });

    test('offers requiresState keys as transitionsState key completions (cross-ref)', async () => {
        // Given - a requiresState key declared on one pair; another pair types a transitionsState key
        const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"step":"1"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}]},"response":{"status":200,"transitionsState":{"⟦⟧":""}}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        // Then - the requiresState key is offered; the sequence: snippet is NOT (transitionsState side)
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['step'], notContains: ['sequence:'] });
    });
});
