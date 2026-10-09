import { describe, expect, test } from 'vitest';

import { FAKER_NAMES } from '../../../src/registry/faker.js';
import { completionsAt, labelsAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function templatedBody(body: string): string {
    return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

describe('template-arguments', () => {
    test('inserts the arguments of a helper as snippet placeholders', async () => {
        // Given - a mustache head, the replace item read
        const result = await integration.call(async () => {
            const items = await completionsAt(templatedBody('{{⟦⟧}}'));
            return items.find((item) => item.label === 'replace')?.insertText;
        });

        // Then - its three argument placeholders
        expect(result.value).toMatch(`replace \${1:target} \${2:oldValue} \${3:newValue}`);
    });

    test('offers the Request members after `Request.`', async () => {
        // Given - a dotted Request path being continued
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{Request.⟦⟧}}')),
        );

        // Then - the documented members alone
        expect(result.value).toMatch([
            'Scheme',
            'Method',
            'Host',
            'Path',
            'QueryParam',
            'Header',
            'FormData',
            'Body',
        ]);
    });

    test('offers the declared State keys after `State.`', async () => {
        // Given - state keys declared by another pair's requiresState and transitionsState
        const doc = `{"data":{"pairs":[
      {"request":{"path":[],"requiresState":{"cart":"full"}},"response":{"status":200,"transitionsState":{"checkout":"done"}}},
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{State.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - both keys
        expect(result.value).toMatch(['cart', 'checkout']);
    });

    test('offers the declared Vars names after `Vars.`', async () => {
        // Given - data.variables declares a variable
        const doc = `{"data":{"variables":[{"name":"token","function":"randomUuid"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Vars.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the variable
        expect(result.value).toMatch(['token']);
    });

    test('offers the declared Literals names after `Literals.`', async () => {
        // Given - data.literals declares a literal
        const doc = `{"data":{"literals":[{"name":"apiBase","value":"https://x"}],"pairs":[
      {"request":{"path":[]},"response":{"status":200,"templated":true,"body":"{{Literals.⟦⟧}}"}}
    ]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - the literal
        expect(result.value).toMatch(['apiBase']);
    });

    test('offers the zero-arg faker types inside the faker argument', async () => {
        // Given - the cursor inside the faker string argument
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{faker '⟦⟧'}}")),
        );

        // Then - the registry's 210 zero-arg gofakeit names, in its order, no parameterized one
        expect(result.value).toMatch([...FAKER_NAMES]);
    });

    test('offers offset examples in the offset slot of now', async () => {
        // Given - the cursor in the first argument of now
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{now '⟦⟧'}}")),
        );

        // Then - the offset examples
        expect(result.value).toMatch(['-1d', '+1h', '-30m', '1y', '-1.5h']);
    });

    test('offers format strings in the format slot of now', async () => {
        // Given - the cursor in the second argument of now
        const result = await integration.call(
            async () => await labelsAt(templatedBody("{{now '-1d' '⟦⟧'}}")),
        );

        // Then - unix, epoch and the Go layouts
        expect(result.value).toMatch([
            '(empty → RFC3339)',
            'unix',
            'epoch',
            '2006-01-02',
            '2006-01-02T15:04:05Z07:00',
        ]);
    });

    test('offers the @-variables after `{{@` inside #each', async () => {
        // Given - a `{{@` continuation inside #each
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{#each items}}{{@⟦⟧')),
        );

        // Then - the @-variables
        expect(result.value).toMatch(['@index', '@first', '@last', '@key']);
    });

    test('offers the matching open block name at `{{/`', async () => {
        // Given - a block close typed inside an open #each
        const result = await integration.call(
            async () => await labelsAt(templatedBody('{{#each items}}{{/⟦⟧')),
        );

        // Then - each, to close the block
        expect(result.value).toMatch(['each']);
    });

    test(String.raw`maps the cursor after a \n escape to the Request continuation`, async () => {
        // Given - a two-character escape before the mustache
        const result = await integration.call(
            async () => await labelsAt(templatedBody(String.raw`line1\n{{Request.⟦⟧}}`)),
        );

        // Then - the Request members, the escape counted once
        expect(result.value).toMatch([
            'Scheme',
            'Method',
            'Host',
            'Path',
            'QueryParam',
            'Header',
            'FormData',
            'Body',
        ]);
    });

    test('offers nothing in a plain body', async () => {
        // Given - a body with no template syntax and no templated key
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"plain ⟦⟧text"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing
        expect(result.value).toMatch([]);
    });

    test('offers no helper in a requiresState value', async () => {
        // Given - a cursor in a requiresState value, which is not templated
        const doc = `{"data":{"pairs":[{"request":{"path":[],"requiresState":{"k":"⟦⟧"}},"response":{"status":200}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await labelsAt(doc));

        // Then - nothing templated
        expect(result.value).toMatch([]);
    });

    test('offers nothing in the literal text of a templated body', async () => {
        // Given - the cursor outside any mustache of a templated body
        const result = await integration.call(
            async () => await labelsAt(templatedBody('hello ⟦⟧ world')),
        );

        // Then - nothing
        expect(result.value).toMatch([]);
    });
});
