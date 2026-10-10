import { describe, expect, test } from 'vitest';

import type { HelperArg, HelperSpec } from '../../registry/templating.data.js';
import type { Expression, PathExpression, StringLiteral } from '../ast.js';
import type { TemplateFinding } from '../finding.js';
import { checkArity, checkSpecialHelperArgs } from '../helper-arguments.js';

const PATH: PathExpression = {
    data: false,
    end: 4,
    original: 'name',
    parts: ['name'],
    start: 2,
    thisRef: false,
    type: 'PathExpression',
};

function argument(optional: boolean): HelperArg {
    return { name: 'a', optional, type: 'string' };
}

function helper(
    name: string,
    shape: { args: HelperArg[]; block?: boolean; variadic?: boolean },
): HelperSpec {
    return {
        args: shape.args,
        block: shape.block ?? false,
        builtin: false,
        docs: '',
        example: '',
        name,
        ...(shape.variadic === undefined ? {} : { variadic: shape.variadic }),
    };
}

function literal(value: string): StringLiteral {
    return { end: 20, quote: "'", start: 10, type: 'StringLiteral', value };
}

function params(count: number): Expression[] {
    return Array.from({ length: count }, () => literal('x'));
}

function arity(spec: HelperSpec, given: number, isBlock = false): TemplateFinding[] {
    const findings: TemplateFinding[] = [];
    checkArity(spec, { isBlock, params: params(given), path: PATH }, findings);
    return findings;
}

function sigs(spec: HelperSpec, given: number): (string | undefined)[] {
    return arity(spec, given).map(({ args }) => args.sig);
}

function special(name: string, args: Expression[]): TemplateFinding[] {
    const findings: TemplateFinding[] = [];
    checkSpecialHelperArgs(helper(name, { args: [] }), args, findings);
    return findings;
}

describe('helper-arguments', () => {
    test.each([
        {
            findings: [
                {
                    args: { n: '1', name: 'name', sig: '2 arguments' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            given: 1,
            spec: helper('name', { args: [argument(false), argument(false)] }),
        },
        {
            findings: [
                {
                    args: { n: '0', name: 'name', sig: '1 argument' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            given: 0,
            spec: helper('name', { args: [argument(false)] }),
        },
        {
            findings: [
                {
                    args: { n: '2', name: 'name', sig: '1 argument' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            given: 2,
            spec: helper('name', { args: [argument(false)] }),
        },
        { findings: [], given: 1, spec: helper('name', { args: [argument(false)] }) },
        { findings: [], given: 0, spec: helper('name', { args: [] }) },
        { findings: [], given: 1, spec: helper('name', { args: [argument(true)] }) },
        { findings: [], given: 0, spec: helper('name', { args: [argument(true)] }) },
        {
            findings: [
                {
                    args: { n: '3', name: 'name', sig: '1 to 2 arguments' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            given: 3,
            spec: helper('name', { args: [argument(false), argument(true)] }),
        },
        {
            findings: [
                {
                    args: { n: '0', name: 'name', sig: 'at least 2 arguments' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            given: 0,
            spec: helper('name', { args: [argument(false), argument(false)], variadic: true }),
        },
        {
            findings: [],
            given: 9,
            spec: helper('name', { args: [argument(false)], variadic: true }),
        },
        { findings: [], given: 0, spec: helper('name', { args: [], variadic: true }) },
    ])(
        // Given - a helper of the registry and the arguments a mustache gives it
        // Then - the findings recorded, none when the use is right
        '$spec.name given $given',
        ({ findings, given, spec }) => {
            expect(arity(spec, given)).toStrictEqual(findings);
        },
    );

    test.each([
        { sig: 'at least 1 argument', spec: { args: [argument(false)], variadic: true }, given: 0 },
        { sig: '1 argument', spec: { args: [argument(false)] }, given: 0 },
        { sig: '2 arguments', spec: { args: [argument(false), argument(false)] }, given: 0 },
        { sig: '0 arguments', spec: { args: [] }, given: 1 },
    ])(
        // Given - a helper of the registry and the arguments a mustache gives it
        // Then - the findings recorded, none when the use is right
        'describes $sig',
        ({ given, sig, spec }) => {
            expect(sigs(helper('name', spec), given)).toStrictEqual([sig]);
        },
    );

    test.each([
        {
            findings: [
                {
                    args: { n: '1', name: 'each', sig: 'a block helper' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            isBlock: false,
            spec: helper('each', { args: [argument(false)], block: true }),
        },
        {
            findings: [
                {
                    args: { n: '1', name: 'now', sig: 'an inline helper' },
                    end: 4,
                    kind: 'HF504',
                    start: 2,
                },
            ],
            isBlock: true,
            spec: helper('now', { args: [argument(false)] }),
        },
        {
            findings: [],
            isBlock: true,
            spec: helper('each', { args: [argument(false)], block: true }),
        },
    ])(
        // Given - a helper of the registry and the arguments a mustache gives it
        // Then - the findings recorded, none when the use is right
        '$spec.name used as a block: $isBlock',
        ({ findings, isBlock, spec }) => {
            expect(arity(spec, 1, isBlock)).toStrictEqual(findings);
        },
    );

    test.each([
        { args: [literal('Email')], findings: [], helper: 'faker' },
        {
            args: [literal('Number')],
            findings: [{ args: { t: 'Number' }, end: 20, kind: 'HF508', start: 10 }],
            helper: 'faker',
        },
        {
            args: [literal('Nope')],
            findings: [
                { args: { t: 'Nope', version: '6.28.0' }, end: 20, kind: 'HF507', start: 10 },
            ],
            helper: 'faker',
        },
        { args: [PATH], findings: [], helper: 'faker' },
        { args: [], findings: [], helper: 'faker' },
        { args: [literal('Nope')], findings: [], helper: 'other' },
        { args: [literal('')], findings: [], helper: 'now' },
        { args: [literal('0')], findings: [], helper: 'now' },
        { args: [literal('-1d')], findings: [], helper: 'now' },
        { args: [literal('+2h30m')], findings: [], helper: 'now' },
        { args: [literal('1.5s')], findings: [], helper: 'now' },
        { args: [literal('3µs')], findings: [], helper: 'now' },
        { args: [literal('4ms')], findings: [], helper: 'now' },
        { args: [literal('1y')], findings: [], helper: 'now' },
        {
            args: [literal('1.d')],
            findings: [{ args: { o: '1.d' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('1w')],
            findings: [{ args: { o: '1w' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('d')],
            findings: [{ args: { o: 'd' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('1d!')],
            findings: [{ args: { o: '1d!' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('x1d')],
            findings: [{ args: { o: 'x1d' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('1.m|')],
            findings: [{ args: { o: '1.m|' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        {
            args: [literal('1 d')],
            findings: [{ args: { o: '1 d' }, end: 20, kind: 'HF509', start: 10 }],
            helper: 'now',
        },
        { args: [PATH], findings: [], helper: 'now' },
        { args: [], findings: [], helper: 'now' },
    ])(
        // Given - a helper of the registry and the arguments a mustache gives it
        // Then - the findings recorded, none when the use is right
        '$helper $args.0.value',
        ({ args, findings, helper: name }) => {
            expect(special(name, args)).toStrictEqual(findings);
        },
    );
});
