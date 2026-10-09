import { describe, expect, test } from 'vitest';

import { completionsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function documentationOf(
    items: Awaited<ReturnType<typeof completionsAt>>,
    label: string,
): { detail: string | undefined; documentation: string; insertText: string | undefined } {
    const item = items.find((candidate) => candidate.label === label);
    const documentation = item?.documentation;
    return {
        detail: item?.detail,
        documentation:
            typeof documentation === 'string' ? documentation : (documentation?.value ?? ''),
        insertText: item?.insertText,
    };
}

describe('matcher-documentation', () => {
    test('documents a matcher item from the registry and quotes its insert text', async () => {
        // Given - a matcher value position, the regex item read whole
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () =>
            documentationOf(await completionsAt(doc), 'regex'),
        );

        // Then - its detail, its documentation and a quoted insert text, with no generic panic note
        expect(result.value).toMatch({
            detail: 'Hoverfly matcher · value: string',
            documentation:
                '### `regex` matcher\n\nRegular-expression match. Non-string value never matches; an invalid pattern silently never matches. https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html\n\n**Value type:** `string`\n**Config:** not supported.\n**doMatch:** AND-semantics — re-tests the same input against the next matcher.',
            insertText: '"regex"',
        });
    });

    test("carries the array matcher's own config-keys note, never the generic panic", async () => {
        // Given - a matcher value position, the array item read whole
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () =>
            documentationOf(await completionsAt(doc), 'array'),
        );

        // Then - the documentation the hover renders, its config footgun included
        expect(result.value).toMatch({
            detail: 'Hoverfly matcher · value: array',
            documentation:
                '### `array` matcher\n\nArray match, value MUST be a JSON array (a plain string is rejected; the \';\'-split applies to the incoming request value, NOT the matcher value). The ONLY matcher that accepts `config` (booleans `ignoreUnknown`/`ignoreOrder`/`ignoreOccurrences`). https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html\n\n**Value type:** `array`\n**Config:** supported — booleans `ignoreUnknown`, `ignoreOrder`, `ignoreOccurrences`.\n**doMatch:** AND-semantics — re-tests the same input against the next matcher.\n\n⚠️ Each `config` value must be a JSON boolean — a string like `"true"` or a number is a mistake.',
            insertText: '"array"',
        });
    });
});
