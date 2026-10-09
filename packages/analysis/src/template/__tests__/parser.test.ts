import { describe, expect, test } from 'vitest';

import { parse } from '../parser.js';
import { outline } from './outline.js';

describe('parse', () => {
    test.each([
        {
            outline: ['program@0-9', '"a "@0-2', '{{x<x>@4-5}}@2-7', '" b"@7-9'],
            source: 'a {{x}} b',
        },
        {
            outline: [
                'program@0-27',
                "{{substring<substring>@2-11 'hello'@12-19 '0'@20-23 2=2@24-25}}@0-27",
            ],
            source: "{{substring 'hello' '0' 2}}",
        },
        {
            outline: [
                'program@0-38',
                '{{csvSqlCommand<csvSqlCommand>@2-15 "SELECT * FROM pets"@16-36}}@0-38',
            ],
            source: '{{csvSqlCommand "SELECT * FROM pets"}}',
        },
        {
            outline: ['program@0-5', '{{x<x>@2-3}}@0-5'],
            source: '{{x}}',
        },
        {
            outline: ['program@0-7', '{{{x<x>@3-4}}}@0-7'],
            source: '{{{x}}}',
        },
        {
            outline: ['program@0-30', "{{now<now>@5-8 '-1d'@11-16 'unix'@19-25}}@0-30"],
            source: "{{   now   '-1d'   'unix'   }}",
        },
        {
            outline: [
                'program@0-22',
                "{{replace<replace>@2-9 x<x>@10-11 '}}'@12-16 'y'@17-20}}@0-22",
            ],
            source: "{{replace x '}}' 'y'}}",
        },
        {
            outline: [
                'program@0-26',
                '{{Request.QueryParam.foo<Request.QueryParam.foo>@2-24}}@0-26',
            ],
            source: '{{Request.QueryParam.foo}}',
        },
        {
            outline: [
                'program@0-36',
                '{{Request.Header.Authorization.0<Request.Header.Authorization.[0]>@2-34}}@0-36',
            ],
            source: '{{Request.Header.Authorization.[0]}}',
        },
        {
            outline: ['program@0-10', '{{@index<@index>@2-8}}@0-10'],
            source: '{{@index}}',
        },
        {
            outline: ['program@0-8', '{{this:<this>@2-6}}@0-8'],
            source: '{{this}}',
        },
        {
            outline: ['program@0-13', '{{this:name<this.name>@2-11}}@0-13'],
            source: '{{this.name}}',
        },
        {
            outline: [
                'program@0-39',
                "{{multiply<multiply>@2-10 (this:price<this.price>@12-22)@11-23 (this:qty<this.qty>@25-33)@24-34 ''@35-37}}@0-39",
            ],
            source: "{{multiply (this.price) (this.qty) ''}}",
        },
        {
            outline: [
                'program@0-34',
                "{{outer<outer>@2-7 (helper<helper>@9-15 (inner<inner>@17-22 'a'@23-26)@16-27 'b'@28-31)@8-32}}@0-34",
            ],
            source: "{{outer (helper (inner 'a') 'b')}}",
        },
        {
            outline: [
                'program@0-37',
                "{{Request.Body<Request.Body>@2-14 'jsonpath'@15-25 '$.items'@26-35}}@0-37",
            ],
            source: "{{Request.Body 'jsonpath' '$.items'}}",
        },
        {
            outline: [
                'program@0-29',
                '#if<if>@3-5 x<x>@6-7 ["yes"@9-12] else ["no"@20-22] open 0-9 close 22-29@0-29',
            ],
            source: '{{#if x}}yes{{else}}no{{/if}}',
        },
        {
            outline: [
                'program@0-78',
                '#each<each>@3-7 (csvAsMap<csvAsMap>@9-17 "pets"@18-24)@8-25 [{{this:name<this.name>@29-38}}@27-40 #unless<unless>@43-49 @last<@last>@50-55 [","@57-58] open 40-57 close 58-69@40-69] open 0-27 close 69-78@0-78',
            ],
            source: '{{#each (csvAsMap "pets")}}{{this.name}}{{#unless @last}},{{/unless}}{{/each}}',
        },
        {
            outline: [
                'program@0-70',
                '#each<each>@3-7 (csvAsArray<csvAsArray>@9-19 \'pets\'@20-26)@8-27 [#each<each>@32-36 this:<this>@37-41 [{{this:<this>@45-49}}@43-51 " "@51-52] open 29-43 close 52-61@29-61] open 0-29 close 61-70@0-70',
            ],
            source: "{{#each (csvAsArray 'pets')}}{{#each this}}{{this}} {{/each}}{{/each}}",
        },
        {
            outline: [
                'program@0-84',
                '#equal<equal>@3-8 (csvDeleteRows<csvDeleteRows>@10-23 "pets"@24-30 "category"@31-41 "cats"@42-48 true@49-53)@9-54 "0"@55-58 ["none"@60-64] else ["ok"@72-74] open 0-60 close 74-84@0-84',
            ],
            source: '{{#equal (csvDeleteRows "pets" "category" "cats" true) "0"}}none{{else}}ok{{/equal}}',
        },
        {
            outline: [
                'program@0-20',
                '#if<if>@3-5 x<x>@6-7 ["body"@9-13] open 0-9 close 13-20@0-20',
            ],
            source: '{{#if x}}body{{/if}}',
        },
        {
            outline: [
                'program@0-25',
                '"a "@0-2',
                '{{y<y>@4-5}}@2-7',
                '" then "@7-13',
                '"x and more"@15-25',
                'error Unclosed mustache — missing closing braces@13-25',
            ],
            source: 'a {{y}} then {{x and more',
        },
        {
            outline: [
                'program@0-16',
                '#each<each>@3-7 xs<xs>@8-10 ["item"@12-16] open 0-12 close unclosed@0-16',
                'error Unclosed block {{#each}} — missing {{/each}}@0-12',
            ],
            source: '{{#each xs}}item',
        },
        {
            outline: [
                'program@0-22',
                '#if<if>@3-5 x<x>@6-7 ["body"@9-13] open 0-9 close 13-22@0-22',
                'error Mismatched closing block: expected {{/if}} but found {{/each}}@13-22',
            ],
            source: '{{#if x}}body{{/each}}',
        },
        {
            outline: [
                'program@0-17',
                '"text "@0-5',
                '" more"@12-17',
                'error Unexpected closing block {{/if}} — no matching open block@5-12',
            ],
            source: 'text {{/if}} more',
        },
        {
            outline: ['program@0-4', 'error Empty mustache — expected a path or helper@0-4'],
            source: '{{}}',
        },
        {
            outline: [
                'program@0-20',
                "{{outer<outer>@2-7 (inner<inner>@9-14 'a'@15-18)@8-18}}@0-20",
                "error Unclosed subexpression — missing ')'@8-18",
            ],
            source: "{{outer (inner 'a'}}",
        },
        {
            outline: [
                'program@0-10',
                '"x \'abc}}"@2-10',
                'error Unclosed mustache — missing closing braces@0-10',
            ],
            source: "{{x 'abc}}",
        },
        {
            outline: [
                'program@0-25',
                '#if<if>@3-5 x<x>@6-7 ["a"@9-10] open 0-9 close 10-19@0-19',
                '{{ok<ok>@21-23}}@19-25',
                'error Mismatched closing block: expected {{/if}} but found {{/each}}@10-19',
            ],
            source: '{{#if x}}a{{/each}}{{ok}}',
        },
        {
            outline: ['program@0-2', 'error Unclosed mustache — missing closing braces@0-2'],
            source: '{{',
        },
        {
            outline: ['program@0-3', 'error Unclosed mustache — missing closing braces@0-3'],
            source: '{{{',
        },
        {
            outline: ['program@0-2', '"}}"@0-2'],
            source: '}}',
        },
        {
            outline: [
                'program@0-5',
                '#<>@3-3 [] open 0-5 close unclosed@0-5',
                'error Block open {{#…}} is missing a helper name@0-5',
                'error Unclosed block {{#}} — missing {{/}}@0-5',
            ],
            source: '{{#}}',
        },
        {
            outline: [
                'program@0-5',
                'error Unexpected closing block {{/}} — no matching open block@0-5',
            ],
            source: '{{/}}',
        },
        {
            outline: [
                'program@0-11',
                '#<>@3-3 [] open 0-6 close 6-11@0-11',
                'error Block open {{#…}} is missing a helper name@0-6',
            ],
            source: '{{# }}{{/}}',
        },
        {
            outline: [
                'program@0-6',
                '"(((("@2-6',
                'error Unclosed mustache — missing closing braces@0-6',
            ],
            source: '{{((((',
        },
        {
            outline: [
                'program@0-8',
                '"a \'b}}"@2-8',
                'error Unclosed mustache — missing closing braces@0-8',
            ],
            source: "{{a 'b}}",
        },
        {
            outline: [
                'program@0-34',
                '#each<each>@3-7 [] else [] open 0-9 close 17-25@0-25',
                'error Mismatched closing block: expected {{/each}} but found {{/}}@17-25',
                'error Unexpected closing block {{/each}} — no matching open block@25-34',
            ],
            source: '{{#each}}{{else}}{{else}}{{/each}}',
        },
        {
            outline: [
                'program@0-24',
                '#a<a>@3-4 [#b<b>@9-10 [] open 6-12 close 12-18@6-18] open 0-6 close 18-24@0-24',
                'error Mismatched closing block: expected {{/b}} but found {{/a}}@12-18',
                'error Mismatched closing block: expected {{/a}} but found {{/b}}@18-24',
            ],
            source: '{{#a}}{{#b}}{{/a}}{{/b}}',
        },
        {
            outline: ['program@0-0'],
            source: '',
        },
        {
            outline: ['program@0-15', '"just plain text"@0-15'],
            source: 'just plain text',
        },
        {
            outline: ['program@0-21', "{{h<h>@2-3 'txt'@4-9 -1.5=-1.5@10-14 true@15-19}}@0-21"],
            source: "{{h 'txt' -1.5 true}}",
        },
    ])(
        // Given - $source, decoded
        // Then - the whole program — each node with its span, every recorded error — and no throw
        'parses $source',
        ({ outline: expected, source }) => {
            expect(outline(parse(source))).toStrictEqual(expected);
        },
    );
});
