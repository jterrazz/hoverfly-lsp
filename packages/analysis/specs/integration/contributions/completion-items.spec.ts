import { describe, expect, test } from 'vitest';
import type { CompletionItem } from 'vscode-languageserver-types';

import { completionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function simulation(request: string, response = '{"status":200}', data = ''): string {
    return `{"data":{${data}"pairs":[{"request":${request},"response":${response}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

function templatedBody(body: string, data = ''): string {
    return simulation('{"path":[]}', `{"status":200,"templated":true,"body":"${body}"}`, data);
}

// value: an item as the editor draws and inserts it, without the range the JSON library derives.
function shown(items: CompletionItem[], labels: string[]): Record<string, unknown>[] {
    return items
        .filter(({ label }) => labels.includes(label))
        .map(
            ({
                detail,
                documentation,
                insertText,
                insertTextFormat,
                kind,
                label,
                preselect,
                sortText,
            }) => ({
                detail,
                documentation,
                insertText,
                insertTextFormat,
                kind,
                label,
                preselect,
                sortText,
            }),
        );
}

const STATE_KEY = {
    detail: 'State key (declared in this simulation)',
    insertTextFormat: 2,
    kind: 10,
};

const SEQUENCE = {
    detail: 'Sequence-state key prefix (ordered sequence responses)',
    documentation: {
        kind: 'markdown',
        value: 'A `requiresState` key prefixed `sequence:` drives ordered sequence responses (Hoverfly increments the sequence as each pair is served).',
    },
    insertTextFormat: 2,
    kind: 15,
    label: 'sequence:',
};

describe('completion items', () => {
    test('describe an HTTP method and a URI scheme, inserted quoted', async () => {
        // Given - a cursor in an exact method value, and in an exact scheme value
        const result = await integration.call(async () => ({
            method: shown(
                await completionsAt(simulation('{"method":[{"matcher":"exact","value":"⟦⟧"}]}')),
                ['GET'],
            ),
            scheme: shown(
                await completionsAt(simulation('{"scheme":[{"matcher":"exact","value":"⟦⟧"}]}')),
                ['https'],
            ),
        }));

        // Then - each item states what its value is, and inserts it as a JSON string
        expect(result.value).toMatch({
            method: [
                {
                    detail: 'Standard HTTP method (custom verbs are also allowed)',
                    insertText: '"GET"',
                    insertTextFormat: 1,
                    kind: 20,
                    label: 'GET',
                },
            ],
            scheme: [
                {
                    detail: 'Common URI scheme (any scheme is allowed)',
                    insertText: '"https"',
                    insertTextFormat: 1,
                    kind: 20,
                    label: 'https',
                },
            ],
        });
    });

    test('offer no method or scheme under a header that happens to be named like one, or for another key', async () => {
        // Given - a header named method, and the config of a method matcher
        const result = await integration.call(async () => [
            await labelsAt(simulation('{"headers":{"method":[{"matcher":"exact","value":"⟦⟧"}]}}')),
            await labelsAt(
                simulation('{"method":[{"matcher":"exact","value":"GET","config":"⟦⟧"}]}'),
            ),
        ]);

        // Then - no verb or scheme: the schema's own new-object suggestion at most
        expect(result.value).toMatch([[], ['{}']]);
    });

    test('rank the current schema version first and explain the others', async () => {
        // Given - a cursor in the schemaVersion value
        const result = await integration.call(async () =>
            shown(await completionsAt(`{"data":{"pairs":[]},"meta":{"schemaVersion":"⟦⟧"}}`), [
                'v5.3',
                'v5',
            ]),
        );

        // Then - the default is preselected and sorts first, the other is one of the v5.x
        expect(result.value).toMatch([
            {
                detail: 'Hoverfly schema version (current default)',
                documentation: {
                    kind: 'markdown',
                    value: '`v5.3`: the current default schema version.',
                },
                insertText: '"v5.3"',
                insertTextFormat: 1,
                kind: 20,
                label: 'v5.3',
                preselect: true,
                sortText: '0',
            },
            {
                detail: 'Hoverfly schema version',
                documentation: {
                    kind: 'markdown',
                    value: '`v5`: Hoverfly validates any `v5.x` against the same v5 schema.',
                },
                insertText: '"v5"',
                insertTextFormat: 1,
                kind: 20,
                label: 'v5',
                preselect: false,
                sortText: '1-1',
            },
        ]);
    });

    test('give a state key and the sequence prefix a value to type when the key stands alone', async () => {
        // Given - a state key declared by the response, and a bare requiresState object
        const doc = simulation(
            '{"requiresState":{⟦⟧}}',
            '{"status":200,"transitionsState":{"k":"v"}}',
        );
        const result = await integration.call(async () =>
            shown(await completionsAt(doc), ['k', 'sequence:']),
        );

        // Then - each insertion carries its `: "$n"` tab stop
        expect(result.value).toMatch([
            { ...STATE_KEY, insertText: '"k": "$1"', label: 'k' },
            { ...SEQUENCE, insertText: `"sequence:\${1:name}": "$2"` },
        ]);
    });

    test('insert a state key alone when its value is already written', async () => {
        // Given - the same state key, the cursor in a key that already has its value
        const doc = simulation(
            '{"requiresState":{"⟦⟧":""}}',
            '{"status":200,"transitionsState":{"k":"v"}}',
        );
        const result = await integration.call(async () =>
            shown(await completionsAt(doc), ['k', 'sequence:']),
        );

        // Then - the key and the sequence prefix, no tab stop for a value
        expect(result.value).toMatch([
            { ...STATE_KEY, insertText: '"k"', label: 'k' },
            { ...SEQUENCE, insertText: `sequence:\${1:name}` },
        ]);
    });

    test('offer the keys the three state maps declare, sorted, without an empty one', async () => {
        // Given - requiresState, transitionsState and removesState each declaring a key and an empty one
        const doc = `{"data":{"pairs":[
      {"request":{"path":[],"requiresState":{"b":"1","":"x"}},"response":{"status":200,"transitionsState":{"c":"1","":"x"},"removesState":["a",""]}},
      {"request":{"path":[],"requiresState":{"⟦⟧":""}},"response":{"status":200}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the three keys in order, then the prefix
        expect(result.value).toMatch(['a', 'b', 'c', 'sequence:']);
    });

    test('offer no state key where a state map is not being written', async () => {
        // Given - a declared state key and a cursor in an empty pair
        const doc = `{"data":{"pairs":[
      {"request":{"path":[],"requiresState":{"cart":"full"}},"response":{"status":200}},
      {⟦⟧}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the pair's own properties alone
        expect(result.value).toMatch(['labels', 'request', 'response']);
    });

    test('describe a registered post-serve action, and offer it nowhere else', async () => {
        // Given - one registered action, the cursor in postServeAction and then in the body
        const settings = { settings: { registeredActions: ['hook'] } };
        const result = await integration.call(async () => ({
            action: shown(
                await completionsAt(
                    simulation('{}', '{"status":200,"postServeAction":"⟦⟧"}'),
                    '',
                    settings,
                ),
                ['hook'],
            ),
            body: await completionsAt(simulation('{}', '{"status":200,"body":"⟦⟧"}'), '', settings),
        }));

        // Then - the action is described and inserted quoted, the body offers nothing
        expect(result.value).toMatch({
            action: [
                {
                    detail: 'Registered post-serve action',
                    insertText: '"hook"',
                    insertTextFormat: 1,
                    kind: 12,
                    label: 'hook',
                },
            ],
            body: [],
        });
    });

    test('mark the body-only matcher in its detail', async () => {
        // Given - a cursor in a request.body matcher name
        const result = await integration.call(async () =>
            shown(await completionsAt(simulation('{"body":[{"matcher":"⟦⟧"}]}')), [
                'exact',
                'form',
            ]).map(({ detail, label }) => ({ detail, label })),
        );

        // Then - form states it is body only, exact does not
        expect(result.value).toMatch([
            { detail: 'Hoverfly matcher · value: string', label: 'exact' },
            { detail: 'Hoverfly matcher · value: object (body only)', label: 'form' },
        ]);
    });

    test('name the declared State keys, Vars and Literals of a template, skipping an empty one', async () => {
        // Given - a state key, a variable and a literal, each beside an empty-named one
        const data =
            '"variables":[{"name":"token","function":"randomUuid"},{"name":"","function":"randomUuid"},{"function":"randomUuid"},{"name":5},{"name":null},{"name":{}}],"literals":[{"name":"base","value":"x"},{"name":"","value":"y"},{"value":"z"},{"name":false}],';
        const result = await integration.call(async () => [
            await completionsAt(
                `{"data":{${data}"pairs":[{"request":{"path":[],"requiresState":{"cart":"full","":"x"}},"response":{"status":200,"templated":true,"body":"{{State.⟦⟧}}"}}]},"meta":{"schemaVersion":"v5.3"}}`,
            ),
            await completionsAt(templatedBody('{{Vars.⟦⟧}}', data)),
            await completionsAt(templatedBody('{{Literals.⟦⟧}}', data)),
        ]);

        // Then - each is a variable item inserted as written
        expect(result.value).toMatch([
            [
                {
                    detail: 'State key (declared in this simulation)',
                    insertText: 'cart',
                    insertTextFormat: 1,
                    kind: 6,
                    label: 'cart',
                },
            ],
            [
                {
                    detail: 'Declared variable (data.variables)',
                    insertText: 'token',
                    insertTextFormat: 1,
                    kind: 6,
                    label: 'token',
                },
            ],
            [
                {
                    detail: 'Declared literal (data.literals)',
                    insertText: 'base',
                    insertTextFormat: 1,
                    kind: 6,
                    label: 'base',
                },
            ],
        ]);
    });

    test('write a helper signature with its optional and variadic arguments', async () => {
        // Given - the helper list at a mustache head
        const result = await integration.call(async () =>
            shown(await completionsAt(templatedBody('{{⟦⟧}}')), ['now', 'concat']).map(
                ({ detail, label }) => ({ detail, label }),
            ),
        );

        // Then - optional arguments bracketed, a variadic helper ended by an ellipsis
        expect(result.value).toMatch([
            { detail: 'now [offset] [format] · Hoverfly helper', label: 'now' },
            { detail: 'concat ... · Hoverfly helper', label: 'concat' },
        ]);
    });
});
