import { describe, expect, test } from 'vitest';

import { parseCallParts } from '../expressions.js';
import type { Scope } from '../expressions.js';
import { expression } from './outline.js';

// value: the call's head and arguments as the outline writes them, then every error it recorded.
function called(text: string, end = text.length): string[] {
    const scope: Scope = { errors: [], source: text };
    const parts = parseCallParts(scope, 0, end);
    return [
        ...(parts === undefined
            ? ['none']
            : [expression(parts.path), ...parts.params.map(expression)]),
        ...scope.errors.map((error) => `error ${error.message}@${error.start}-${error.end}`),
    ];
}

describe('parseCallParts', () => {
    test.each([
        {
            call: "substring 'hello' '0' 2",
            outline: ['substring<substring>@0-9', "'hello'@10-17", "'0'@18-21", '2=2@22-23'],
        },
        {
            call: 'csvSqlCommand "SELECT * FROM pets"',
            outline: ['csvSqlCommand<csvSqlCommand>@0-13', '"SELECT * FROM pets"@14-34'],
        },
        {
            call: "   now   '-1d'   'unix'   ",
            outline: ['now<now>@3-6', "'-1d'@9-14", "'unix'@17-23"],
        },
        {
            call: 'Request.QueryParam.foo',
            outline: ['Request.QueryParam.foo<Request.QueryParam.foo>@0-22'],
        },
        {
            call: 'Request.Header.Authorization.[0]',
            outline: ['Request.Header.Authorization.0<Request.Header.Authorization.[0]>@0-32'],
        },
        { call: '@index', outline: ['@index<@index>@0-6'] },
        { call: 'this', outline: ['this:<this>@0-4'] },
        { call: 'this.name', outline: ['this:name<this.name>@0-9'] },
        {
            call: "multiply (this.price) (this.qty) ''",
            outline: [
                'multiply<multiply>@0-8',
                '(this:price<this.price>@10-20)@9-21',
                '(this:qty<this.qty>@23-31)@22-32',
                "''@33-35",
            ],
        },
        {
            call: "outer (helper (inner 'a') 'b')",
            outline: [
                'outer<outer>@0-5',
                "(helper<helper>@7-13 (inner<inner>@15-20 'a'@21-24)@14-25 'b'@26-29)@6-30",
            ],
        },
        {
            call: "Request.Body 'jsonpath' '$.items'",
            outline: ['Request.Body<Request.Body>@0-12', "'jsonpath'@13-23", "'$.items'@24-33"],
        },
        {
            call: "h 'txt' -1.5 true",
            outline: ['h<h>@0-1', "'txt'@2-7", '-1.5=-1.5@8-12', 'true@13-17'],
        },
        {
            call: "outer (inner 'a'",
            outline: [
                'outer<outer>@0-5',
                "(inner<inner>@7-12 'a'@13-16)@6-16",
                "error Unclosed subexpression \u2014 missing ')'@6-16",
            ],
        },
        { call: "x 'abc", outline: ['x<x>@0-1', "'abc'@2-6", 'error Unclosed string literal@2-6'] },
        { call: '((((', outline: ['none'] },
        { call: "a 'b", outline: ['a<a>@0-1', "'b'@2-4", 'error Unclosed string literal@2-4'] },
        { call: '', outline: ['none'] },
        { call: '   ', outline: ['none'] },
        {
            call: 'x ()',
            outline: [
                'x<x>@0-1',
                'error Empty subexpression — expected a helper@2-4',
                'error Unexpected token in arguments: "()"@2-4',
            ],
        },
        { call: 'a )', outline: ['a<a>@0-1', 'error Unexpected token in arguments: ")"@2-3'] },
        { call: String.raw`x 'a\'b'`, outline: ['x<x>@0-1', "'a'b'@2-8"] },
        {
            call: "x 'ab}}",
            end: 5,
            outline: ['x<x>@0-1', "'ab'@2-5", 'error Unclosed string literal@2-5'],
        },
        {
            call: String.raw`x 'a\}}`,
            end: 5,
            outline: ['x<x>@0-1', String.raw`'a\'@2-5`, 'error Unclosed string literal@2-5'],
        },
        {
            call: "x 'ab'",
            end: 5,
            outline: ['x<x>@0-1', "'ab'@2-5", 'error Unclosed string literal@2-5'],
        },
        { call: 'h 12', outline: ['h<h>@0-1', '12=12@2-4'] },
        { call: 'h .5', outline: ['h<h>@0-1', '.5=0.5@2-4'] },
        { call: 'h -.5', outline: ['h<h>@0-1', '-.5=-0.5@2-5'] },
        { call: 'h 5.', outline: ['h<h>@0-1', '5.=5@2-4'] },
        { call: 'h 1a', outline: ['h<h>@0-1', '1a<1a>@2-4'] },
        { call: 'h a1', outline: ['h<h>@0-1', 'a1<a1>@2-4'] },
        { call: 'h 1.5.2', outline: ['h<h>@0-1', '1.5.2<1.5.2>@2-7'] },
        { call: 'h .a', outline: ['h<h>@0-1', 'a<.a>@2-4'] },
        { call: 'h -', outline: ['h<h>@0-1', '-<->@2-3'] },
        { call: 'h 1e5', outline: ['h<h>@0-1', '1e5<1e5>@2-5'] },
        { call: 'h 0.25', outline: ['h<h>@0-1', '0.25=0.25@2-6'] },
        { call: 'h 12.5', outline: ['h<h>@0-1', '12.5=12.5@2-6'] },
        { call: 'h .55', outline: ['h<h>@0-1', '.55=0.55@2-5'] },
        { call: 'h false', outline: ['h<h>@0-1', 'false@2-7'] },
        { call: 'a..b', outline: ['a.b<a..b>@0-4'] },
        { call: 'a.[0]x', outline: ['a.[0]x<a.[0]x>@0-6'] },
        { call: 'a.x[0]', outline: ['a.x[0]<a.x[0]>@0-6'] },
        { call: 'a.[12]', outline: ['a.12<a.[12]>@0-6'] },
        { call: 'a ) ', outline: ['a<a>@0-1', 'error Unexpected token in arguments: ")"@2-4'] },
    ])(
        // Given - the inside of a mustache, $call
        // Then - its head, each argument with its span, and every error recorded while recovering
        'parseCallParts — $call, read to $end',
        ({ call, end, outline }) => {
            expect(called(call, end)).toStrictEqual(outline);
        },
    );
});
