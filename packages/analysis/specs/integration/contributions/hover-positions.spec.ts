import { describe, expect, test } from 'vitest';

import { hoverAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function simulation(request: string, response = '{"status":200}'): string {
    return `{"data":{"pairs":[{"request":${request},"response":${response}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

function templatedBody(body: string): string {
    return simulation('{"path":[]}', `{"status":200,"templated":true,"body":"${body}"}`);
}

const SCHEMA_BODY =
    'body\n\nResponse body\\. If both body and bodyFile are present, body takes precedence\\.';

const SCHEMA_MATCHER =
    "matcher\n\nMatching strategy name\\. Hoverfly's registry is case\\-insensitive; canonical names are lowercase\\. An empty/absent matcher defaults to exact\\.";

const SCHEMA_FIELD_MATCHER =
    "field\\-matcher\n\nA single matcher applied to a request field\\. The matcher name selects the matching strategy; the value's interpretation depends on the matcher\\. Must be a JSON object: Hoverfly's official schema types this \\`object\\`, so a non\\-object \\(e\\.g\\. an array\\-shaped \\`doMatch\\`\\) is rejected at import\\.";

const RANDOM_UUID = [
    '### `randomUuid` (inline helper)',
    '',
    '`randomUuid`',
    '',
    'Random UUID. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html',
    '',
    '**Kind:** inline helper · **Arity:** 0 argument(s) · **Source:** Hoverfly helper',
    '',
    'Example: `{{randomUuid}}`',
].join('\n');

const REPLACE = [
    '### `replace` (inline helper)',
    '',
    '`replace target: string oldValue: string newValue: string`',
    '',
    'Replace all occurrences of oldValue with newValue in target. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html',
    '',
    '**Kind:** inline helper · **Arity:** 3 argument(s) · **Source:** Hoverfly helper',
    '',
    "Example: `{{replace (Request.Body 'jsonpath' '$.x') 'a' 'b'}}`",
].join('\n');

const EXACT = [
    '### `exact` matcher',
    '',
    'Exact string equality. Non-string value never matches. https://docs.hoverfly.io/en/latest/pages/keyconcepts/matching/matchers.html',
    '',
    '**Value type:** `string`',
    '**Config:** not supported.',
    '**doMatch:** AND-semantics; re-tests the same input against the next matcher.',
].join('\n');

describe('hover positions', () => {
    test.each([
        {
            doc: simulation('{"path":["gl⟦⟧ob"]}'),
            hover: SCHEMA_FIELD_MATCHER,
            label: 'a bare string in a matcher list is no matcher name',
        },
        {
            doc: simulation('{"path":[{"matcher":⟦⟧5}]}'),
            hover: SCHEMA_MATCHER,
            label: 'a matcher that is no string',
        },
        {
            doc: simulation('{"path":[{"matcher":"no⟦⟧pe"}]}'),
            hover: SCHEMA_MATCHER,
            label: 'a matcher name the registry does not hold',
        },
        {
            doc: simulation('{"body":[{"matcher":"Fo⟦⟧rm"}]}'),
            hover: SCHEMA_MATCHER,
            label: 'form read case-sensitively',
        },
        {
            doc: simulation('{"path":[{"matcher":"fo⟦⟧rm"}]}'),
            hover: SCHEMA_MATCHER,
            label: 'form outside the request body',
        },
        {
            doc: simulation('{"path":[{"matcher":"EXA⟦⟧CT"}]}'),
            hover: EXACT,
            label: 'a registry name read case-insensitively',
        },
        {
            doc: simulation(
                '{"path":[{"matcher":"regex","doMatch":{"doMatch":{"matcher":"EXA⟦⟧CT"}}}]}',
            ),
            hover: EXACT,
            label: 'a matcher two doMatch links deep',
        },
        {
            doc: simulation('{"headers":{"A":[{"matcher":"EXA⟦⟧CT"}]}}'),
            hover: EXACT,
            label: 'a matcher in a header list',
        },
    ])('$label', async ({ doc, hover }) => {
        // Given - a hover at the position the label names
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the matcher's docs where a registry matcher is named, the schema's text elsewhere
        expect(result.value).toMatch(hover);
    });

    test.each([
        {
            doc: templatedBody('{{repl⟦⟧ace}}'),
            hover: SCHEMA_BODY,
            label: 'a helper that takes arguments, written with none',
        },
        {
            doc: templatedBody('{{@randomUui⟦⟧d}}'),
            hover: SCHEMA_BODY,
            label: 'a data variable named like a helper',
        },
        {
            doc: templatedBody('{{this.randomUui⟦⟧d}}'),
            hover: SCHEMA_BODY,
            label: 'a field of this named like a helper',
        },
        {
            doc: templatedBody('{{foo.Meth⟦⟧od}}'),
            hover: SCHEMA_BODY,
            label: 'a member named like a Request one, of another root',
        },
        { doc: templatedBody('{{Reque⟦⟧st}}'), hover: SCHEMA_BODY, label: 'Request alone' },
        {
            doc: templatedBody('{{Request.No⟦⟧pe}}'),
            hover: SCHEMA_BODY,
            label: 'a Request member that does not exist',
        },
        {
            doc: templatedBody('{{randomUuid.x⟦⟧}}'),
            hover: SCHEMA_BODY,
            label: 'a dotted path starting with a helper',
        },
        {
            doc: templatedBody("{{faker 'Email' 'Em⟦⟧ail'}}"),
            hover: SCHEMA_BODY,
            label: 'the second argument of faker',
        },
        {
            doc: templatedBody("{{replace 'Em⟦⟧ail' 'a' 'b'}}"),
            hover: SCHEMA_BODY,
            label: 'a string argument of another helper',
        },
        {
            doc: templatedBody("{{replace (rando⟦⟧mUuid) 'a' 'b'}}"),
            hover: RANDOM_UUID,
            label: 'a helper called as a subexpression',
        },
        {
            doc: templatedBody('{{#each (rando⟦⟧mUuid)}}{{/each}}'),
            hover: RANDOM_UUID,
            label: 'a subexpression in a block head',
        },
        {
            doc: templatedBody('{{#each x}}{{randomUui⟦⟧d}}{{/each}}'),
            hover: RANDOM_UUID,
            label: 'a mustache in a block body',
        },
        {
            doc: templatedBody('{{#if x}}a{{else}}{{randomUui⟦⟧d}}{{/if}}'),
            hover: RANDOM_UUID,
            label: 'a mustache in a block inverse',
        },
        {
            doc: simulation(
                '{"path":[]}',
                '{"status":200,"templated":true,"headers":{"A":["x","{{randomUui⟦⟧d}}"],"B":["{{randomUuid}}"]}}',
            ),
            hover: RANDOM_UUID,
            label: 'a response header, the second value of its list',
        },
        {
            doc: simulation(
                '{"path":[]}',
                '{"status":200,"templated":true,"headers":{"A":"x","B":["{{randomUui⟦⟧d}}"]}}',
            ),
            hover: RANDOM_UUID,
            label: 'a response header list after a header that is no list',
        },
        {
            doc: simulation(
                '{"path":[]}',
                '{"status":200,"templated":true,"headers":{"A":,"B":["{{randomUui⟦⟧d}}"]}}',
            ),
            hover: RANDOM_UUID,
            label: 'a response header list after a header with no value',
        },
        {
            doc: simulation(
                '{"path":[]}',
                '{"status":200,"templated":true,"headers":{"A":["x"],"B":["{{randomUui⟦⟧d}}"]}}',
            ),
            hover: RANDOM_UUID,
            label: 'a response header list after a list the cursor is not in',
        },
        {
            doc: simulation('{"path":[]}', '{"status":⟦⟧200,"templated":true}'),
            hover: 'status\n\nHTTP status code returned to the caller\\.',
            label: 'a response with no header',
        },
        {
            doc: templatedBody("{{concat (repl⟦⟧ace 'a' 'b' 'c')}}"),
            hover: REPLACE,
            label: 'a helper that takes arguments, called as a subexpression',
        },
        {
            doc: simulation(
                '{"path":[]}',
                '{"status":200,"templated":true,"headers":{"A":"{{randomUui⟦⟧d}}"}}',
            ),
            hover: '',
            label: 'a response header that is no list',
        },
    ])('$label', async ({ doc, hover }) => {
        // Given - a hover at the position the label names
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the helper's hover where one is named, the schema's text or none elsewhere
        expect(result.value).toMatch(hover);
    });

    test.each([
        {
            body: "{{csvAsA⟦⟧rray 'pets'}}",
            hover: [
                '### `csvAsArray` (inline helper)',
                '',
                '`csvAsArray dataSourceName: string`',
                '',
                'Return the CSV as `[][]string`; iterate with #each. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html',
                '',
                '**Kind:** inline helper · **Arity:** 1 argument(s) · **Source:** Hoverfly helper',
                '',
                "Example: `{{#each (csvAsArray 'pets')}}...{{/each}}`",
            ].join('\n'),
            label: 'a plain helper',
        },
        {
            body: "{{conc⟦⟧at 'a' 'b'}}",
            hover: [
                '### `concat` (inline helper)',
                '',
                '`concat ...`',
                '',
                'Concatenate all arguments into one string; flattens any []interface{} argument. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html',
                '',
                '**Kind:** inline helper · **Arity:** at least 0 argument(s) · **Source:** Hoverfly helper',
                '',
                "Example: `{{concat 'a' 'b' (getArray 'x')}}`",
            ].join('\n'),
            label: 'a variadic helper',
        },
        {
            body: "{{no⟦⟧w '1d'}}",
            hover: [
                '### `now` (inline helper)',
                '',
                '`now [offset: string] [format: string]`',
                '',
                'Current time, optionally offset and formatted. format "" => RFC3339, "unix" => seconds, "epoch" => MILLISECONDS (misnamed), else a Go time layout. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html',
                '',
                '**Kind:** inline helper · **Arity:** 0 to 2 argument(s) · **Source:** Hoverfly helper',
                '',
                "Example: `{{now '-1d' 'unix'}}`",
            ].join('\n'),
            label: 'a helper with optional arguments',
        },
    ])('writes the arity of $label', async ({ body, hover }) => {
        // Given - the cursor on the helper's name
        const result = await integration.call(async () => await hoverAt(templatedBody(body)));

        // Then - its signature, arity and example
        expect(result.value).toMatch(hover);
    });
});
