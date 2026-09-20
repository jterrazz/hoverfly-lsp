import { describe, expect, test } from 'vitest';

import { REGISTRY_MATCHER_NAMES } from '../../../src/registry/index.js';
import { completionsAt, expectLabels } from '../fourslash/harness.js';
import { integration } from '../integration.specification.js';

/**
 * COMPLETION COVERAGE MATRIX.
 *
 * One systematic sweep over every documented completion context, under the cursor conditions a
 * REAL editor produces. Each context is exercised at:
 *
 *   (a) empty quotes      `"⟦⟧"`              — cursor between two quotes (manual invoke / `"` trigger)
 *   (b) mid-word          `"au⟦⟧"`            — a partial token already typed (client filters by prefix)
 *   (c) bare position     `{⟦⟧` / `[⟦⟧`       — cursor before any quotes, right after `{` or `[`
 *
 * The fourth dimension editors add — WITH vs WITHOUT a trigger character — does not change the
 * contribution path: `vscode-json-languageservice`'s `doComplete` keys completions off the AST
 * position, not off a `CompletionContext.triggerCharacter` (the service signature used here takes
 * no context). A trigger character only INVOKES completion; the same position logic then runs.
 * The server advertises `"`, `{`, `.`, `#`, `@`, `'`, `(` as triggers (capabilities.ts), which is
 * exactly the set that reaches these positions, so trigger-vs-manual is behaviourally identical.
 *
 * The truth table this encodes is documented in packages/analysis/src/contributions/README.md.
 */

const NAMED_MATCHERS = REGISTRY_MATCHER_NAMES.filter((name) => name !== '');

/** Wrap a matcher `value` expression on a request field into a full simulation document. */
function matcherDoc(field: string, inner: string): string {
    return `{"data":{"pairs":[{"request":{"${field}":[{"matcher":${inner}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

/** Wrap a `meta.schemaVersion` value expression. */
function schemaVersionDoc(inner: string): string {
    return `{"data":{"pairs":[]},"meta":{"schemaVersion":${inner}}}`;
}

/** A pair that DECLARES a state key — `requiresState` on the request, the rest on the response. */
function producerPair(
    kind: 'removesState' | 'requiresState' | 'transitionsState',
    body: string,
): string {
    if (kind === 'requiresState') {
        return `{"request":{"path":[{"matcher":"exact","value":"/p"}],"requiresState":${body}},"response":{"status":200}}`;
    }
    return `{"request":{"path":[{"matcher":"exact","value":"/p"}]},"response":{"status":200,"${kind}":${body}}}`;
}

/** A consumer pair typing a new `requiresState` (request) or `transitionsState` (response) KEY. */
function consumerPair(kind: 'requiresState' | 'transitionsState', typedKey: string): string {
    if (kind === 'requiresState') {
        return `{"request":{"path":[{"matcher":"exact","value":"/q"}],"requiresState":${typedKey}},"response":{"status":200}}`;
    }
    return `{"request":{"path":[{"matcher":"exact","value":"/q"}]},"response":{"status":200,"transitionsState":${typedKey}}}`;
}

/** Glue a producer + consumer pair into a full simulation document. */
function stateDoc(producer: string, consumer: string): string {
    return `{"data":{"pairs":[${producer},${consumer}]},"meta":{"schemaVersion":"v5.3"}}`;
}

/** A producer's requiresState `auth` plus a consumer pair whose removesState array is being typed. */
function removesStateDoc(inner: string): string {
    const producer = `{"request":{"path":[{"matcher":"exact","value":"/p"}],"requiresState":{"auth":"yes"}},"response":{"status":200}}`;
    const consumer = `{"request":{"path":[{"matcher":"exact","value":"/q"}]},"response":{"status":200,"removesState":${inner}}}`;
    return `{"data":{"pairs":[${producer},${consumer}]},"meta":{"schemaVersion":"v5.3"}}`;
}

/** Wrap a `response.postServeAction` value expression. */
function postServeDoc(inner: string): string {
    return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":${inner}}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

/* ----------------------------------- matcher names ------------------------------------- */

describe('coverage: matcher-name value (request.path)', () => {
    test('(a) empty quotes offers the full named registry set', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('path', `"⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, { exact: NAMED_MATCHERS });
    });

    test('(b) mid-word still offers matchers (client filters by prefix)', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('path', `"ex⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, { contains: ['exact', 'regex'] });
    });

    test('(c) bare position (no quotes) offers matchers; insertText quotes them', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('path', `⟦⟧`), ''),
        );
        const items = completions.value.value;
        expectLabels(items, {
            contains: ['exact'],
        });
        expect(items.find((i) => i.label === 'exact')?.insertText).toBe('"exact"');
    });
});

describe('coverage: matcher-name value (request.body adds form)', () => {
    test('(a) empty quotes includes form', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('body', `"⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, {
            exact: [...NAMED_MATCHERS, 'form'],
        });
    });

    test('(b) mid-word still offers form', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('body', `"fo⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, { contains: ['form'] });
    });

    test('(c) bare position includes form', async () => {
        const completions = await integration.call(
            async () => await completionsAt(matcherDoc('body', `⟦⟧`), ''),
        );
        expectLabels(completions.value.value, { contains: ['form', 'exact'] });
    });
});

/* ----------------------------------- schemaVersion ------------------------------------- */

describe('coverage: meta.schemaVersion value', () => {
    test('(a) empty quotes offers the version enum', async () => {
        const completions = await integration.call(
            async () => await completionsAt(schemaVersionDoc(`"⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, {
            contains: ['v5.3', 'v5', 'v5.1', 'v5.2'],
        });
    });

    test('(b) mid-word offers the version enum', async () => {
        const completions = await integration.call(
            async () => await completionsAt(schemaVersionDoc(`"v5⟦⟧"`), ''),
        );
        expectLabels(completions.value.value, { contains: ['v5.3'] });
    });

    test('(c) bare position offers the version enum; insertText quotes it', async () => {
        const completions = await integration.call(
            async () => await completionsAt(schemaVersionDoc(`⟦⟧`), ''),
        );
        const items = completions.value.value;
        expectLabels(items, { contains: ['v5.3'] });
        expect(items.find((i) => i.label === 'v5.3')?.insertText).toBe('"v5.3"');
    });
});

/* -------------------------------- requiresState KEYS ----------------------------------- */

describe('coverage: request.requiresState KEY (cross-ref)', () => {
    const fromTransitions = producerPair('transitionsState', `{"auth":"yes"}`);

    test('(a) empty quotes offers cross-referenced requiresState keys + sequence:', async () => {
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{"⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['auth', 'sequence:'] });
    });

    test('(b) mid-word offers the keys (client filters by prefix)', async () => {
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{"au⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['auth'] });
    });

    test('(c) bare position right after `{` offers keys; insertText appends the value', async () => {
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{⟦⟧}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, { contains: ['auth'] });
        // The `addValue` flag is true at the bare `{` position, so the snippet inserts `"key": "$1"`.
        expect(items.find((i) => i.label === 'auth')?.insertText).toBe('"auth": "$1"');
    });

    test('tHE BUG: a key declared only via transitionsState is offered in requiresState', async () => {
        // Reproduces the reported gap: `auth` set by a producer's transitionsState, consumed here.
        const doc = stateDoc(fromTransitions, consumerPair('requiresState', `{"⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['auth'] });
    });

    test('also unions keys declared only via removesState', async () => {
        const fromRemoves = producerPair('removesState', `["auth"]`);
        const doc = stateDoc(fromRemoves, consumerPair('requiresState', `{"⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['auth'] });
    });
});

/* ------------------------------- transitionsState KEYS --------------------------------- */

describe('coverage: response.transitionsState KEY (cross-ref)', () => {
    const fromRequires = producerPair('requiresState', `{"step":"1"}`);

    test('(a) empty quotes offers cross-referenced keys WITHOUT a sequence: snippet', async () => {
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', `{"⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['step'], notContains: ['sequence:'] });
    });

    test('(b) mid-word offers the keys', async () => {
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', `{"st⟦⟧":""}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        expectLabels(completions.value.value, { contains: ['step'] });
    });

    test('(c) bare position offers keys with an appended value', async () => {
        const doc = stateDoc(fromRequires, consumerPair('transitionsState', `{⟦⟧}`));
        const completions = await integration.call(async () => await completionsAt(doc, ''));
        const items = completions.value.value;
        expectLabels(items, { contains: ['step'] });
        expect(items.find((i) => i.label === 'step')?.insertText).toBe('"step": "$1"');
    });
});

/* -------------------------------- removesState (by design) ----------------------------- */

describe('coverage: response.removesState array entry (by design: no completion)', () => {
    // Array string ELEMENTS invoke neither collectPropertyCompletions (no object) nor
    // CollectValueCompletions (that hook only fires for object property values, with a propertyKey).
    // Vscode-json-languageservice exposes no contribution hook for a plain array-of-strings element,
    // So cross-ref completion here is not achievable through the JSONWorkerContribution API. We
    // Assert the (intended) absence so the limitation is pinned rather than silently regressing.

    test('(a) empty quotes inside the array offers no cross-referenced state key', async () => {
        const completions = await integration.call(
            async () => await completionsAt(removesStateDoc(`["⟦⟧"]`), ''),
        );
        expectLabels(completions.value.value, { notContains: ['auth'] });
    });

    test('(c) bare array position offers no cross-referenced state key', async () => {
        const completions = await integration.call(
            async () => await completionsAt(removesStateDoc(`[⟦⟧]`), ''),
        );
        expectLabels(completions.value.value, { notContains: ['auth'] });
    });
});

/* -------------------------------- postServeAction value -------------------------------- */

describe('coverage: response.postServeAction value (settings-gated)', () => {
    const settings = { settings: { registeredActions: ['webhook', 'logger'] } } as const;

    test('(a) empty quotes offers the registered actions', async () => {
        const completions = await integration.call(
            async () => await completionsAt(postServeDoc(`"⟦⟧"`), '', settings),
        );
        expectLabels(completions.value.value, { contains: ['webhook', 'logger'] });
    });

    test('(b) mid-word offers the registered actions', async () => {
        const completions = await integration.call(
            async () => await completionsAt(postServeDoc(`"web⟦⟧"`), '', settings),
        );
        expectLabels(completions.value.value, { contains: ['webhook'] });
    });

    test('(c) bare position offers the actions; insertText quotes them', async () => {
        const completions = await integration.call(
            async () => await completionsAt(postServeDoc(`⟦⟧`), '', settings),
        );
        const items = completions.value.value;
        expectLabels(items, { contains: ['webhook'] });
        expect(items.find((i) => i.label === 'webhook')?.insertText).toBe('"webhook"');
    });
});
