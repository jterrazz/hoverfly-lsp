import { describe, expect, test } from 'vitest';

import { hoverAt } from '../__setup__/fourslash.js';
import { integration } from '../integration.specification.js';

function templatedBody(body: string): string {
    return `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"templated":true,"body":"${body}"}}]},"meta":{"schemaVersion":"v5.3"}}`;
}

describe('template-hover', () => {
    test('renders the signature, arity, kind and example of an inline helper', async () => {
        // Given - the cursor on the replace helper
        const doc = templatedBody("{{replac⟦⟧e (Request.Body 'jsonpath' '$.x') 'a' 'b'}}");
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the registry's entry for replace
        expect(result.value).toMatch(`
            ### \`replace\` — inline helper

            \`replace target: string oldValue: string newValue: string\`

            Replace all occurrences of oldValue with newValue in target. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html

            **Kind:** inline helper · **Arity:** 3 argument(s) · **Source:** Hoverfly helper

            Example: \`{{replace (Request.Body 'jsonpath' '$.x') 'a' 'b'}}\``);
    });

    test('marks a raymond built-in block helper', async () => {
        // Given - the cursor on the each block built-in
        const doc = templatedBody('{{#eac⟦⟧h items}}{{this}}{{/each}}');
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - a block helper, built into raymond
        expect(result.value).toMatch(`
            ### \`each\` — block helper

            \`#each iterable: any\`

            Block: iterate arrays/slices/maps/structs; sets @index/@key/@first/@last and this. https://handlebarsjs.com/guide/builtin-helpers.html

            **Kind:** block helper · **Arity:** 1 argument(s) · **Source:** raymond built-in

            Example: \`{{#each (csvAsMap 'pets')}}{{this.name}}{{/each}}\``);
    });

    test('renders a zero-arg helper on a bare mustache', async () => {
        // Given - randomUuid used inline
        const doc = templatedBody('{{randomUui⟦⟧d}}');
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the helper's entry
        expect(result.value).toMatch(`
            ### \`randomUuid\` — inline helper

            \`randomUuid\`

            Random UUID. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html

            **Kind:** inline helper · **Arity:** 0 argument(s) · **Source:** Hoverfly helper

            Example: \`{{randomUuid}}\``);
    });

    test('describes a faker type as a zero-arg gofakeit method of the pinned version', async () => {
        // Given - the cursor inside the faker type string
        const doc = templatedBody("{{faker 'Em⟦⟧ail'}}");
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - gofakeit and its version
        expect(result.value).toMatch(`
            ### faker \`'Email'\`

            A zero-arg gofakeit (v6.28.0) method.`);
    });

    test('warns that a parameterized faker method used with no argument panics', async () => {
        // Given - Number, a parameterized gofakeit method
        const doc = templatedBody("{{faker 'Num⟦⟧ber'}}");
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the panic warning
        expect(result.value).toMatch(`
            ### faker \`'Number'\`

            ⚠️ \`Number\` is a PARAMETERIZED gofakeit method — calling it with no arguments panics at render time.`);
    });

    test('documents Request.Body with its kubectl-JSONPath and xsel dialects', async () => {
        // Given - the cursor on the Request.Body method call
        const doc = templatedBody("{{Request.Bod⟦⟧y 'jsonpath' '$.id'}}");
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the method-call form and the dialect note
        expect(result.value).toMatch(`
            ### \`Request.Body\` — method call

            Invoked as a function with two string args: \`Request.Body '<queryType>' '<query>'\`, where \`queryType\` ∈ {\`jsonpath\`, \`xpath\`, \`jsonpathfromxml\`} (equivalent to the \`requestBody\` helper). The JSONPath engine is **kubectl** (\`k8s.io/client-go/util/jsonpath\`), NOT Jayway/RFC9535; XPath is \`ChrisTrenkamp/xsel\` and returns a single string. https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html

            Example: \`{{Request.Body 'jsonpath' '$.id'}}\``);
    });

    test('documents a Request scalar field', async () => {
        // Given - the cursor on Request.Method
        const doc = templatedBody('{{Request.Meth⟦⟧od}}');
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - the field's entry
        expect(result.value).toMatch(`
            ### \`Request.Method\` — field

            The HTTP method (\`GET\`, \`POST\`, …). https://docs.hoverfly.io/en/latest/pages/keyconcepts/templating/templating.html

            Example: \`{{Request.Method}}\``);
    });

    test('renders no template hover on a token that is no helper or member', async () => {
        // Given - a bare unknown lookup, which could be a context variable
        const doc = templatedBody('{{somethingUnknow⟦⟧n}}');
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - only the schema's description of body
        expect(result.value).toMatch(`
            body

            Response body\\. If both body and bodyFile are present, body takes precedence\\.`);
    });

    test('renders no template hover in a plain body', async () => {
        // Given - a body with no template syntax
        const doc = `{"data":{"pairs":[{"request":{"path":[]},"response":{"status":200,"body":"plain te⟦⟧xt"}}]},"meta":{"schemaVersion":"v5.3"}}`;
        const result = await integration.call(async () => await hoverAt(doc));

        // Then - only the schema's description of body
        expect(result.value).toMatch(`
            body

            Response body\\. If both body and bodyFile are present, body takes precedence\\.`);
    });
});
