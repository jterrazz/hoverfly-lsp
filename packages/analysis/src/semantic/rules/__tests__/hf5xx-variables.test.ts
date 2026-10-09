import { describe, expect, test } from 'vitest';

import { hf5xxVariablesRule } from '../hf5xx-variables.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (input: readonly object[] | string): string[] =>
    diagnosticsOf(
        hf5xxVariablesRule,
        typeof input === 'string' ? input : pairOf(input[1] ?? {}, undefined, input[0]),
    );

describe('hf5xx-variables', () => {
    test.each([
        {
            expected: [
                'HF510 error 5:20-5:26 data.variables only accepts Hoverfly helper functions, not block built-ins',
            ],
            label: 'variable function precedence — hF510 for a raymond block built-in, never HF511',
            input: [{ variables: [{ name: 'v', function: 'each' }] }],
        },
        {
            expected: [
                'HF511 error 5:20-5:32 Unknown variable function "notAHelper"; Hoverfly rejects the import (only the 52 helper functions are valid)',
            ],
            label: 'variable function precedence — hF511 for an otherwise-unknown function, never HF510',
            input: [{ variables: [{ name: 'v', function: 'notAHelper' }] }],
        },
        {
            expected: [
                'HF511 error 5:20-5:40 Unknown variable function "randomStringLenght"; Hoverfly rejects the import (only the 52 helper functions are valid)',
            ],
            label: 'variable function precedence — hF511 for a near-miss misspelling of a real helper',
            input: [{ variables: [{ name: 'v', function: 'randomStringLenght' }] }],
        },
        {
            expected: [],
            label: 'variable function precedence — accepts a valid Hoverfly helper function (no HF510/HF511)',
            input: [{ variables: [{ name: 'v', function: 'randomUuid' }] }],
        },
        {
            expected: [],
            label: "variable function precedence — ignores a missing/non-string function (schema's concern)",
            input: [{ variables: [{ name: 'v' }] }],
        },
        {
            expected: [
                'HF512 warning 6:21-8:9 "requestBody" expects 2 arguments, got 1; the variable renders empty',
            ],
            label: "argument arity vs the helper's HelperSpec — flags too few args for a fixed-arity helper",
            input: [
                { variables: [{ name: 'v', function: 'requestBody', arguments: ['jsonpath'] }] },
            ],
        },
        {
            expected: [
                'HF512 warning 6:21-9:9 "randomStringLength" expects 1 arguments, got 2; the variable renders empty',
            ],
            label: "argument arity vs the helper's HelperSpec — flags too many args for a fixed-arity helper",
            input: [
                {
                    variables: [
                        { name: 'v', function: 'randomStringLength', arguments: ['5', '6'] },
                    ],
                },
            ],
        },
        {
            expected: [
                'HF512 warning 3:6-6:7 "randomStringLength" expects 1 arguments, got 0; the variable renders empty',
            ],
            label: "argument arity vs the helper's HelperSpec — treats missing arguments as zero args",
            input: [{ variables: [{ name: 'v', function: 'randomStringLength' }] }],
        },
        {
            expected: [],
            label: "argument arity vs the helper's HelperSpec — accepts exact arity",
            input: [
                {
                    variables: [
                        { name: 'v', function: 'requestBody', arguments: ['jsonpath', '$.id'] },
                    ],
                },
            ],
        },
        {
            expected: [],
            label: "argument arity vs the helper's HelperSpec — enforces only a minimum for variadic helpers",
            input: [{ variables: [{ name: 'v', function: 'concat', arguments: ['a', 'b', 'c'] }] }],
        },
        {
            expected: [
                'HF511 error 5:20-5:26 Unknown variable function "nope"; Hoverfly rejects the import (only the 52 helper functions are valid)',
            ],
            label: "argument arity vs the helper's HelperSpec — does NOT arity-check an unknown function (HF511 owns that)",
            input: [{ variables: [{ name: 'v', function: 'nope', arguments: [] }] }],
        },
        {
            expected: [
                'HF214 warning 4:16-4:24 Name "my.var" contains a character that breaks "{{Literals.my.var}}" / "{{Vars.my.var}}" templating references',
            ],
            label: 'templatable name charset — flags a variable name with a dot',
            input: [{ variables: [{ name: 'my.var', function: 'randomUuid' }] }],
        },
        {
            expected: [
                'HF214 warning 4:16-4:25 Name "my name" contains a character that breaks "{{Literals.my name}}" / "{{Vars.my name}}" templating references',
            ],
            label: 'templatable name charset — flags a literal name with a space',
            input: [{ literals: [{ name: 'my name', value: 'x' }] }],
        },
        {
            expected: [],
            label: 'templatable name charset — accepts a word-char-only name on both variables and literals',
            input: [
                {
                    variables: [{ name: 'user_id', function: 'randomUuid' }],
                    literals: [{ name: 'brand1', value: 'acme' }],
                },
            ],
        },
        {
            expected: [
                'HF213 information 8:23-8:50 destination matches the request host only (host[:port]); "http://api.example.com/v1" includes a scheme or path and will never match',
            ],
            label: 'destination full URL — flags an exact destination value containing a scheme',
            input: [
                {},
                { destination: [{ matcher: 'exact', value: 'http://api.example.com/v1' }] },
            ],
        },
        {
            expected: [
                'HF213 information 7:23-7:42 destination matches the request host only (host[:port]); "https://host/path" includes a scheme or path and will never match',
            ],
            label: 'destination full URL — flags a default (no matcher) destination value containing ://',
            input: [{}, { destination: [{ value: 'https://host/path' }] }],
        },
        {
            expected: [],
            label: 'destination full URL — does NOT flag a glob/regex destination (slashes may be intentional)',
            input: [{}, { destination: [{ matcher: 'glob', value: 'http://*' }] }],
        },
        {
            expected: [],
            label: 'destination full URL — does NOT flag a bare host[:port] exact destination',
            input: [{}, { destination: [{ matcher: 'exact', value: 'api.example.com:443' }] }],
        },
        {
            expected: [],
            label: 'destination full URL — does NOT flag :// on a non-destination field (e.g. path)',
            input: [{}, { path: [{ matcher: 'exact', value: 'http://x' }] }],
        },
        {
            expected: [],
            label: 'a valid variables+literals+destination block stays silent — correct faker/requestBody arities, clean names, host:port destination',
            input: [
                {
                    variables: [
                        { name: 'id', function: 'randomUuid' },
                        {
                            name: 'userId',
                            function: 'requestBody',
                            arguments: ['jsonpath', '$.id'],
                        },
                        { name: 'name', function: 'faker', arguments: ['Name'] },
                    ],
                    literals: [{ name: 'brand', value: 'acme' }],
                },
                { destination: [{ matcher: 'exact', value: 'api.example.com:8080' }] },
            ],
        },
        {
            expected: [
                'HF512 warning 6:21-10:9 "now" expects 0 to 2 arguments, got 3; the variable renders empty',
            ],
            label: "argument arity vs the helper's HelperSpec — names the range of a helper with optional arguments",
            input: [{ variables: [{ name: 'v', function: 'now', arguments: ['a', 'b', 'c'] }] }],
        },
        {
            expected: [],
            label: 'templatable name charset — ignores a numeric or missing name',
            input: [
                { variables: [{ name: 5, function: 'randomUuid' }], literals: [{ value: 'x' }] },
            ],
        },
        {
            expected: [],
            label: 'templatable name charset — skips an item that is no object',
            input: [{ variables: ['a.b'], literals: [7] }],
        },
        {
            expected: [
                'HF213 information 8:23-8:33 destination matches the request host only (host[:port]); "http://x" includes a scheme or path and will never match',
            ],
            label: 'destination full URL — flags an empty-named (default) matcher holding ://',
            input: [{}, { destination: [{ matcher: '', value: 'http://x' }] }],
        },
        {
            expected: [],
            label: 'destination full URL — does NOT flag a header named destination',
            input: [{}, { headers: { destination: [{ matcher: 'exact', value: 'http://x' }] } }],
        },
        {
            expected: [],
            label: "destination full URL — ignores a numeric or missing value, the schema's concern",
            input: [{}, { destination: [{ matcher: 'exact', value: 5 }, { matcher: 'exact' }] }],
        },
        {
            expected: [],
            label: 'a document with no data',
            input: '{"meta":{"schemaVersion":"v5.3"}}',
        },
        {
            expected: [],
            label: "argument arity vs the helper's HelperSpec — accepts no argument where every one is optional",
            input: [{ variables: [{ name: 'v', function: 'now' }] }],
        },
    ])(
        // Given - data, and a request, holding the case $label names
        // Then - every HF510–HF512, HF213 and HF214 diagnostic, its severity, its range and its message, or none
        'hf5xxVariablesRule — $label',
        ({ expected, input }) => {
            expect(run(input)).toStrictEqual(expected);
        },
    );
});
