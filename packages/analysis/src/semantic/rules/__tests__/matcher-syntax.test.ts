import { describe, expect, test } from 'vitest';

import { matcherSyntaxRule } from '../matcher-syntax.js';
import { diagnosticsOf, pairOf } from './rule-run.js';

const run = (request: object): string[] => diagnosticsOf(matcherSyntaxRule, pairOf(request));

describe('matcher-syntax', () => {
    test.each([
        {
            expected: [
                'HF230 error 8:23-8:28 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — flags an unbalanced-group pattern',
            request: { path: [{ matcher: 'regex', value: 'a(b' }] },
        },
        {
            expected: [
                'HF230 error 8:23-8:36 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — catches a lookbehind that is VALID in JS but invalid in RE2',
            request: { path: [{ matcher: 'regex', value: '(?<=foo)bar' }] },
        },
        {
            expected: [
                'HF230 error 8:23-8:31 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — catches a backreference (invalid in RE2)',
            request: { path: [{ matcher: 'regex', value: '(x)\\1' }] },
        },
        {
            expected: [],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — does NOT flag a Python-style named group (?P<n>…) — valid RE2, invalid JS',
            request: { path: [{ matcher: 'regex', value: '(?P<id>[0-9]+)' }] },
        },
        {
            expected: [],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — does NOT flag a complex valid RE2 pattern',
            request: { path: [{ matcher: 'regex', value: '^/v[0-9]+/[a-z-]+(\\?.*)?$' }] },
        },
        {
            expected: [],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — defers an empty regex value to HF211 (no HF230)',
            request: { path: [{ matcher: 'regex', value: '' }] },
        },
        {
            expected: [],
            label: 'invalid RE2 regex (via re2js, not new RegExp) — defers a non-string regex value to HF203 (no HF230)',
            request: { path: [{ matcher: 'regex', value: 5 }] },
        },
        {
            expected: [
                'HF231 error 8:23-8:35 "jwt" value must be JSON text; this is not valid JSON, so the pair never matches',
            ],
            label: 'json/jsonpartial/jwt value must be JSON text — flags the motivating jwt $.username bug as an HF231 JSON-syntax error',
            request: { body: [{ matcher: 'jwt', value: '$.username' }] },
        },
        {
            expected: [
                'HF231 error 8:23-8:35 "json" value must be JSON text; this is not valid JSON, so the pair never matches',
            ],
            label: 'json/jsonpartial/jwt value must be JSON text — flags broken json text',
            request: { body: [{ matcher: 'json', value: '{not valid' }] },
        },
        {
            expected: [
                'HF231 error 8:23-8:32 "jsonpartial" value must be JSON text; this is not valid JSON, so the pair never matches',
            ],
            label: 'json/jsonpartial/jwt value must be JSON text — flags broken jsonpartial text',
            request: { path: [{ matcher: 'jsonpartial', value: '{broken' }] },
        },
        {
            expected: [],
            label: 'json/jsonpartial/jwt value must be JSON text — does NOT flag valid JSON text for json',
            request: { body: [{ matcher: 'json', value: '{"a":[1,2,3]}' }] },
        },
        {
            expected: [],
            label: 'json/jsonpartial/jwt value must be JSON text — does NOT flag a valid partial JSON spec for jwt',
            request: { body: [{ matcher: 'jwt', value: '{"payload":{"username":"alice"}}' }] },
        },
        {
            expected: [],
            label: 'json/jsonpartial/jwt value must be JSON text — defers a non-string jwt value to HF203 (no HF231)',
            request: { body: [{ matcher: 'jwt', value: { payload: {} } }] },
        },
        {
            expected: [
                'HF235 warning 8:23-8:49 jwt value should be a partial {"header":...,"payload":...} spec; key "username" can never match a JWT',
            ],
            label: 'jwt value with non-header/payload top-level keys — warns when a top-level key is not header/payload',
            request: { body: [{ matcher: 'jwt', value: '{"username":"alice"}' }] },
        },
        {
            expected: [],
            label: 'jwt value with non-header/payload top-level keys — does NOT warn for a header/payload-only spec',
            request: {
                body: [
                    { matcher: 'jwt', value: '{"header":{"alg":"HS256"},"payload":{"sub":"a"}}' },
                ],
            },
        },
        {
            expected: [],
            label: 'jwt value with non-header/payload top-level keys — does NOT warn for an empty object (matches any JWT)',
            request: { body: [{ matcher: 'jwt', value: '{}' }] },
        },
        {
            expected: ['HF232 warning 8:23-8:30 JSONPath has unbalanced brackets or quotes'],
            label: 'JSONPath / XPath balance lint — warns on unbalanced jsonpath brackets',
            request: { body: [{ matcher: 'jsonpath', value: '$.a[0' }] },
        },
        {
            expected: ['HF232 warning 8:23-8:31 JSONPath has unbalanced brackets or quotes'],
            label: 'JSONPath / XPath balance lint — warns on unbalanced jwtjsonpath quotes',
            request: { path: [{ matcher: 'jwtjsonpath', value: "$['sub" }] },
        },
        {
            expected: ['HF233 warning 8:23-8:33 XPath has unbalanced brackets or quotes'],
            label: 'JSONPath / XPath balance lint — warns on unbalanced xpath brackets',
            request: { body: [{ matcher: 'xpath', value: "//a[b='c" }] },
        },
        {
            expected: [],
            label: 'JSONPath / XPath balance lint — does NOT warn on a balanced xpath with predicates and quotes',
            request: { body: [{ matcher: 'xpath', value: "//book[@id='42']/title" }] },
        },
        {
            expected: [
                'HF234 warning 8:23-8:35 "xml" value is not well-formed XML; this pair never matches',
            ],
            label: 'XML well-formedness — warns on malformed xml',
            request: { body: [{ matcher: 'xml', value: '<a><b></a>' }] },
        },
        {
            expected: [],
            label: 'XML well-formedness — does NOT warn on well-formed xml with CDATA and attributes',
            request: {
                body: [{ matcher: 'xml', value: '<o id="1"><n><![CDATA[a < b]]></n></o>' }],
            },
        },
        {
            expected: [
                'HF234 warning 8:23-8:47 "xmltemplated" value is not well-formed XML; this pair never matches',
            ],
            label: 'XML well-formedness — validates the XML skeleton of xmltemplated after neutralizing tokens',
            request: { body: [{ matcher: 'xmltemplated', value: '<a>{{ ignore }}<b></a>' }] },
        },
        {
            expected: [],
            label: 'XML well-formedness — does NOT warn on well-formed xmltemplated with ignore/regex leaves',
            request: {
                body: [
                    {
                        matcher: 'xmltemplated',
                        value: '<u><id>{{ regex: [0-9]+ }}</id><n>{{ ignore }}</n></u>',
                    },
                ],
            },
        },
        {
            expected: [
                'HF230 error 8:23-8:61 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'XML well-formedness — flags a bad {{ regex: … }} leaf inside xmltemplated as HF230 (RE2 reuse)',
            request: {
                body: [{ matcher: 'xmltemplated', value: '<u><id>{{ regex: (?<=x)y }}</id></u>' }],
            },
        },
        {
            expected: [
                'HF236 warning 10:16-10:17 array element 1 is not a string; Hoverfly cannot match a non-string element as written',
                'HF236 warning 11:16-11:20 array element 2 is not a string; Hoverfly cannot match a non-string element as written',
            ],
            label: 'array elements must be strings — warns once per non-string element with its index',
            request: { body: [{ matcher: 'array', value: ['a', 1, true, 'b'] }] },
        },
        {
            expected: [],
            label: 'array elements must be strings — does NOT warn on an all-string array',
            request: { body: [{ matcher: 'array', value: ['a', 'b'] }] },
        },
        {
            expected: [],
            label: 'array elements must be strings — defers a non-array array value to HF203 (no HF236)',
            request: { body: [{ matcher: 'array', value: 'a;b' }] },
        },
        {
            expected: [],
            label: 'glob — deliberately silent (no invalid syntax exists) — never flags any glob value',
            request: { path: [{ matcher: 'glob', value: '*.example.com' }] },
        },
        {
            expected: [],
            label: 'glob — deliberately silent (no invalid syntax exists) — never flags any glob value (2)',
            request: { path: [{ matcher: 'glob', value: 'a[b?c\\d' }] },
        },
        {
            expected: [
                'HF231 error 11:25-11:30 "jwt" value must be JSON text; this is not valid JSON, so the pair never matches',
            ],
            label: 'doMatch recursion — checks syntax inside an object-shaped doMatch chain',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.a',
                        doMatch: { matcher: 'jwt', value: '$.x' },
                    },
                ],
            },
        },
        {
            expected: [
                'HF230 error 8:23-8:27 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'the regex matcher spelled Regex, looked up case-insensitively',
            request: { path: [{ matcher: 'Regex', value: '(a' }] },
        },
        {
            expected: [],
            label: 'a regex matcher with no value',
            request: { path: [{ matcher: 'regex' }] },
        },
        {
            expected: [],
            label: 'an exact matcher holding regex syntax, which no rule judges',
            request: { path: [{ matcher: 'exact', value: '(a' }] },
        },
        {
            expected: [],
            label: 'jwt value with non-header/payload top-level keys — a null JWT spec',
            request: { body: [{ matcher: 'jwt', value: 'null' }] },
        },
        {
            expected: [],
            label: 'jwt value with non-header/payload top-level keys — an array JWT spec',
            request: { body: [{ matcher: 'jwt', value: '[1]' }] },
        },
        {
            expected: [],
            label: 'jwt value with non-header/payload top-level keys — a string JWT spec',
            request: { body: [{ matcher: 'jwt', value: '"ab"' }] },
        },
        {
            expected: [
                'HF234 warning 8:23-8:32 "xmltemplated" value is not well-formed XML; this pair never matches',
            ],
            label: 'XML well-formedness — a lone template token is no XML',
            request: { body: [{ matcher: 'xmltemplated', value: '{{ x }}' }] },
        },
        {
            expected: [
                'HF230 error 8:23-8:43 Invalid RE2 regex; Hoverfly (Go regexp) silently never matches this',
            ],
            label: 'XML well-formedness — flags a {{regex:…}} leaf written with no space',
            request: { body: [{ matcher: 'xmltemplated', value: '<a>{{regex:(}}</a>' }] },
        },
        {
            expected: [],
            label: 'XML well-formedness — plain xml reads a {{regex:…}} leaf as text',
            request: { body: [{ matcher: 'xml', value: '<a>{{regex:(}}</a>' }] },
        },
        {
            expected: [
                'HF234 warning 8:23-8:40 "xml" value is not well-formed XML; this pair never matches',
            ],
            label: "XML well-formedness — plain xml keeps a template token's markup",
            request: { body: [{ matcher: 'xml', value: '<a>{{</b>}}</a>' }] },
        },
        {
            expected: [],
            label: 'XML well-formedness — a whitespace-only xml value',
            request: { body: [{ matcher: 'xml', value: '  ' }] },
        },
        {
            expected: [],
            label: 'array elements must be strings — an array matcher with no value',
            request: { query: { tags: [{ matcher: 'array' }] } },
        },
    ])(
        // Given - a request whose matcher value holds the case $label names
        // Then - every HF23x diagnostic, its severity, its range and its message, or none
        'matcherSyntaxRule — $label',
        ({ expected, request }) => {
            expect(run(request)).toStrictEqual(expected);
        },
    );
});
