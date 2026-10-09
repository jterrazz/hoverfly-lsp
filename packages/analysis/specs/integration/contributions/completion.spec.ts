import { describe, expect, test } from 'vitest';

import { completionsAt, insertionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

describe('completion', () => {
    test('offers the named registry matchers on request.path', async () => {
        // Given - a cursor inside the quoted matcher value on request.path
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the dropdown is the registry's named matchers, with no quoted duplicate from the schema's examples
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('offers matchers on an unquoted matcher value position', async () => {
        // Given - a bare value position after the colon
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":⟦⟧}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the same named matchers are offered
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('adds form on request.body', async () => {
        // Given - a matcher value on request.body
        const doc = `{"data":{"pairs":[{"request":{"body":[{"matcher":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the registry's named matchers and the body-only form
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
            'form',
        ]);
    });

    test('offers matchers inside a header matcher array, without form', async () => {
        // Given - a matcher value inside request.headers.<name>[]
        const doc = `{"data":{"pairs":[{"request":{"headers":{"Accept":[{"matcher":"⟦⟧"}]}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the registry matchers, a header being no body
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('offers matchers inside a doMatch chain link', async () => {
        // Given - a matcher value inside a nested doMatch
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"jsonpath","value":"$.x","doMatch":{"matcher":"⟦⟧"}}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - matcher names are offered in the chained position too
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('offers no matcher name in a document that is no simulation', async () => {
        // Given - arbitrary JSON whose shape has a "matcher" key but no simulation fingerprint
        const doc = `{"random":{"matcher":"⟦⟧"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - only what the bundled schema offers there
        expect(result.value).toMatch([]);
    });

    test('offers no matcher name in a response body', async () => {
        // Given - a cursor in the response.body string
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing Hoverfly-specific
        expect(result.value).toMatch([]);
    });

    test('answers a list on broken JSON rather than refusing', async () => {
        // Given - a structurally broken document with a dangling matcher value
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"⟦⟧"`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the service stays alive and answers what it can
        expect(result.value).toMatch([
            'exact',
            'negate',
            'glob',
            'regex',
            'xml',
            'xmltemplated',
            'xpath',
            'json',
            'jsonpartial',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
            'array',
        ]);
    });

    test('offers the standard HTTP methods on an exact method value, quoted on insert', async () => {
        // Given - a cursor in a method matcher value with an exact matcher
        const doc = `{"data":{"pairs":[{"request":{"method":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await insertionsAt(doc));

        // Then - the IANA core methods
        expect(result.value).toMatch([
            {
                insertText: '"GET"',
                label: 'GET',
            },
            {
                insertText: '"HEAD"',
                label: 'HEAD',
            },
            {
                insertText: '"POST"',
                label: 'POST',
            },
            {
                insertText: '"PUT"',
                label: 'PUT',
            },
            {
                insertText: '"DELETE"',
                label: 'DELETE',
            },
            {
                insertText: '"CONNECT"',
                label: 'CONNECT',
            },
            {
                insertText: '"OPTIONS"',
                label: 'OPTIONS',
            },
            {
                insertText: '"TRACE"',
                label: 'TRACE',
            },
            {
                insertText: '"PATCH"',
                label: 'PATCH',
            },
        ]);
    });

    test('offers methods when the matcher key is absent (default exact)', async () => {
        // Given - a method matcher with no matcher key
        const doc = `{"data":{"pairs":[{"request":{"method":[{"value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - methods are still offered, default exact being enum-shaped
        expect(result.value).toMatch([
            'GET',
            'HEAD',
            'POST',
            'PUT',
            'DELETE',
            'CONNECT',
            'OPTIONS',
            'TRACE',
            'PATCH',
        ]);
    });

    test('offers http, https, ws and wss on an exact scheme value', async () => {
        // Given - a cursor in a scheme matcher value with an exact matcher
        const doc = `{"data":{"pairs":[{"request":{"scheme":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the four schemes
        expect(result.value).toMatch(['http', 'https', 'ws', 'wss']);
    });

    test('offers no method on a regex method value, a pattern being no enum', async () => {
        // Given - a method matcher whose matcher is regex
        const doc = `{"data":{"pairs":[{"request":{"method":[{"matcher":"regex","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - no method value
        expect(result.value).toMatch([]);
    });

    test('offers no scheme on a glob scheme value', async () => {
        // Given - a scheme matcher whose matcher is glob
        const doc = `{"data":{"pairs":[{"request":{"scheme":[{"matcher":"glob","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - no scheme value
        expect(result.value).toMatch([]);
    });

    test('offers no method or scheme on a free-string field like path', async () => {
        // Given - a cursor in a path matcher value
        const doc = `{"data":{"pairs":[{"request":{"path":[{"matcher":"exact","value":"⟦⟧"}]},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - no enum value leaks onto path
        expect(result.value).toMatch([]);
    });

    test('offers v5.3 preselected first, then v5, v5.1 and v5.2', async () => {
        // Given - a cursor in the meta.schemaVersion value
        const doc = `{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧"}}`;
        const result = await integration.call(async () => {
            const items = await completionsAt(doc);
            return items.map(({ insertText, label, preselect, sortText }) => ({
                insertText,
                label,
                preselect,
                sortText,
            }));
        });

        // Then - the contribution's four versions, and the quoted duplicates the schema's examples add
        expect(result.value).toMatch([
            {
                insertText: '"v5.3"',
                label: '"v5.3"',
            },
            {
                insertText: '"v5.2"',
                label: '"v5.2"',
            },
            {
                insertText: '"v5.1"',
                label: '"v5.1"',
            },
            {
                insertText: '"v5"',
                label: '"v5"',
            },
            {
                insertText: '"v5.3"',
                label: 'v5.3',
                preselect: true,
                sortText: '0',
            },
            {
                insertText: '"v5"',
                label: 'v5',
                preselect: false,
                sortText: '1-1',
            },
            {
                insertText: '"v5.1"',
                label: 'v5.1',
                preselect: false,
                sortText: '1-2',
            },
            {
                insertText: '"v5.2"',
                label: 'v5.2',
                preselect: false,
                sortText: '1-3',
            },
        ]);
    });

    test('offers the registered actions on postServeAction when the setting names them', async () => {
        // Given - a cursor in response.postServeAction and a registeredActions allowlist
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(
            async () =>
                await labelsAt(doc, '', { settings: { registeredActions: ['webhook', 'logger'] } }),
        );

        // Then - the configured action names
        expect(result.value).toMatch(['webhook', 'logger']);
    });

    test('offers nothing on postServeAction when no action is registered', async () => {
        // Given - a postServeAction position and no settings
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"postServeAction":"⟦⟧"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing, the actions being registered at runtime
        expect(result.value).toMatch([]);
    });

    test('offers the requiresState keys declared elsewhere in the file, plus a sequence: snippet', async () => {
        // Given - one pair declares requiresState keys; a second pair types a new requiresState key
        const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"cart":"full","loggedIn":"yes"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}],"requiresState":{"⟦⟧":""}},"response":{"status":200}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the cross-referenced keys and sequence:
        expect(result.value).toMatch(['cart', 'loggedIn', 'sequence:']);
    });

    test('offers the requiresState keys as transitionsState keys, without the sequence: snippet', async () => {
        // Given - a requiresState key declared on one pair; another pair types a transitionsState key
        const doc = `{"data":{"pairs":[
      {"request":{"path":[{"matcher":"exact","value":"/a"}],"requiresState":{"step":"1"}},"response":{"status":200}},
      {"request":{"path":[{"matcher":"exact","value":"/b"}]},"response":{"status":200,"transitionsState":{"⟦⟧":""}}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the requiresState key
        expect(result.value).toMatch(['step']);
    });

    test('offers request, response and labels inside an empty pair', async () => {
        // Given - a cursor inside an empty pair object
        const doc = `{"data":{"pairs":[{⟦⟧}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the pair's three properties
        expect(result.value).toMatch(['labels', 'request', 'response']);
    });
});
