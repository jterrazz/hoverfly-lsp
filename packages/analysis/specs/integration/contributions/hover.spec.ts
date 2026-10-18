import { describe, expect, test } from 'vitest';

import { hoverAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

// invariant: a matcher hover describes that matcher alone: its semantics, value type, doMatch
// behaviour, config support, docs link and the notes intrinsic to it. The generic "unknown matcher
// panics" and "config on a non-array matcher panics" warnings are HF201's and HF204's, raised where
// the mistake is made.

describe('hover', () => {
    test('renders the registry docs of a glob matcher name', async () => {
        // Given - the cursor on a "glob" matcher name
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧glob","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - its docs, value type, config, doMatch and docs link
        expect(result.value).toMatch(`
            ### \`glob\` matcher

            Glob (wildcard) match, e.g. \`*.example.com\`. Non-string value never matches. https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html

            **Value type:** \`string\`
            **Config:** not supported.
            **doMatch:** AND-semantics; re-tests the same input against the next matcher.`);
    });

    test('renders a valid regex matcher with no panic note', async () => {
        // Given - a valid "regex" matcher name
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧regex","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the registry docs, a neutral config line and no warning
        expect(result.value).toMatch(`
            ### \`regex\` matcher

            Regular-expression match. Non-string value never matches; an invalid pattern silently never matches. https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html

            **Value type:** \`string\`
            **Config:** not supported.
            **doMatch:** AND-semantics; re-tests the same input against the next matcher.`);
    });

    test("renders the array matcher's own config-keys note", async () => {
        // Given - the cursor on an "array" matcher name, the one config-bearing matcher
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧array","value":[]}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - its config keys and the non-boolean footgun, not the generic panic
        expect(result.value).toMatch(`
            ### \`array\` matcher

            Array match, value MUST be a JSON array (a plain string is rejected; the ';'-split applies to the incoming request value, NOT the matcher value). The ONLY matcher that accepts \`config\` (booleans \`ignoreUnknown\`/\`ignoreOrder\`/\`ignoreOccurrences\`). https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html

            **Value type:** \`array\`
            **Config:** supported, booleans \`ignoreUnknown\`, \`ignoreOrder\`, \`ignoreOccurrences\`.
            **doMatch:** AND-semantics; re-tests the same input against the next matcher.

            **Warning:** each \`config\` value must be a JSON boolean; a string like \`"true"\` or a number is a mistake.`);
    });

    test("renders form's body-only and case-sensitivity note under request.body", async () => {
        // Given - a "form" matcher name on request.body
        const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧form","value":{}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the pseudo-matcher's own placement note
        expect(result.value).toMatch(`
            ### \`form\` matcher

            Body-layer pseudo-matcher (NOT in the registry). Value is an object {fieldName: [matchers...]}. Valid ONLY on the request \`body\` and ONLY as a top-level matcher; the literal name \`form\` is case-SENSITIVE (\`Form\`/\`FORM\` or non-body placement is not recognised). https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html

            **Value type:** \`object\`
            **Config:** not supported.
            **doMatch:** AND-semantics; re-tests the same input against the next matcher.

            **Warning:** valid ONLY on the request \`body\`, only as a top-level matcher, and case-SENSITIVE (\`form\`, not \`Form\`/\`FORM\`).`);
    });

    test("renders negate's vacuous-true footgun", async () => {
        // Given - a "negate" matcher name
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧negate","value":"x"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the vacuous-true note
        expect(result.value).toMatch(`
            ### \`negate\` matcher

            Matches when the value is NOT equal to the request value. A non-string value matches vacuously (always true), almost always a mistake. Registry key is \`negate\` (NOT \`negation\`). https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html

            **Value type:** \`string\`
            **Config:** not supported.
            **doMatch:** AND-semantics; re-tests the same input against the next matcher.

            **Warning:** a non-string value matches vacuously (always true), which is almost always a mistake.`);
    });

    test('leaves a field that is no matcher to the schema hover', async () => {
        // Given - the cursor on the schemaVersion value
        const doc = `{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the schema's own description of the field
        expect(result.value).toMatch(`
            schemaVersion

            Simulation schema version\\. Hoverfly validates anything starting with v5 against the v5 schema; the current default is v5\\.3\\. Older v1\\-v4 files are auto\\-upgraded on import\\.`);
    });

    test('renders no matcher docs in a document that is no simulation', async () => {
        // Given - arbitrary JSON with a "matcher" key and no simulation fingerprint
        const doc = `{"foo":{"matcher":"⟦⟧glob"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - no hover
        expect(result.value).toMatch('');
    });
});
