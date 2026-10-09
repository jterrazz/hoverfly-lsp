import { describe, expect, test } from 'vitest';

import { classifyCompletionContext } from '../completion-context.js';

type Context = ReturnType<typeof classifyCompletionContext>;

function at(kind: Context['kind'], rest: Partial<Context> = {}): Context {
    return { blockStack: [], inEachScope: false, kind, word: '', ...rest };
}

const path = (root: string): NonNullable<Context['path']> => ({ parts: [], root });

describe('classifyCompletionContext', () => {
    test.each([
        { context: at('helperOrPathStart'), marked: '{{|' },
        { context: at('helperOrPathStart', { word: 'fa' }), marked: '{{fa|' },
        { context: at('helperOrPathStart'), marked: '{{#|' },
        { context: at('helperOrPathStart'), marked: '{{multiply (|' },
        { context: at('pathContinuation', { path: path('Request') }), marked: '{{Request.|' },
        { context: at('pathContinuation', { path: path('State') }), marked: '{{State.|' },
        { context: at('pathContinuation', { path: path('Vars') }), marked: '{{Vars.|' },
        { context: at('pathContinuation', { path: path('Literals') }), marked: '{{Literals.|' },
        { context: at('pathContinuation', { path: path('this') }), marked: '{{this.|' },
        { context: at('pathContinuation', { path: path('@') }), marked: '{{@|' },
        {
            context: at('pathContinuation', { path: path('Request'), word: 'Met' }),
            marked: '{{Request.Met|',
        },
        { context: at('fakerArg'), marked: "{{faker '|" },
        { context: at('nowArg', { nowSlot: 'offset' }), marked: "{{now '|" },
        { context: at('nowArg', { nowSlot: 'format' }), marked: "{{now '-1d' '|" },
        { context: at('helperArg', { word: 'Req' }), marked: '{{multiply Req|' },
        {
            context: at('blockClose', { blockStack: ['each'], inEachScope: true }),
            marked: '{{#each x}}{{/|',
        },
        {
            context: at('blockClose', { blockStack: ['each'], inEachScope: true, word: 'ea' }),
            marked: '{{#each x}}{{/ea|',
        },
        {
            context: at('pathContinuation', {
                blockStack: ['each'],
                inEachScope: true,
                path: path('@'),
            }),
            marked: '{{#each xs}}{{@|',
        },
        {
            context: at('helperOrPathStart', { blockStack: ['each', 'with'], inEachScope: true }),
            marked: '{{#each xs}}{{#with this}}{{|',
        },
        { context: at('none'), marked: 'hello |world' },
        { context: at('none'), marked: '{{x}} |' },
        {
            context: { blockStack: [], inEachScope: false, kind: 'blockClose', word: 'ea' },
            marked: '{{ /ea|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: 'x/ea',
            },
            marked: '{{x/ea|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperArg', word: '/x' },
            marked: '{{a /x|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperArg', word: 'b' },
            marked: '{{/ea b|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: 'Request.',
            },
            marked: '{{#Request.|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'pathContinuation',
                path: { parts: [], root: 'Request' },
                word: 'a#',
            },
            marked: '{{Request.a#|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: 'Request.',
            },
            marked: '{{ #Request.|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'fakerArg', word: 'a#' },
            marked: '{{faker a#|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperOrPathStart', word: 'x#y' },
            marked: '{{x#y|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperOrPathStart', word: '' },
            marked: '{{ |',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'offset',
                word: '',
            },
            marked: '{{now |',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'format',
                word: '',
            },
            marked: '{{now a |',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'offset',
                word: 'a',
            },
            marked: '{{now a|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'format',
                word: 'b',
            },
            marked: '{{now a b|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'pathContinuation',
                path: { parts: [], root: 'Request' },
                word: 'a@',
            },
            marked: '{{Request.a@|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'pathContinuation',
                path: { parts: ['QueryParam'], root: 'Request' },
                word: 'na',
            },
            marked: '{{Request.QueryParam.na|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'offset',
                word: '',
            },
            marked: "{{#now '|",
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'nowArg',
                nowSlot: 'format',
                word: '',
            },
            marked: "{{now #x '|",
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperArg', word: '' },
            marked: "{{x#now '|",
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperOrPathStart', word: 'x@' },
            marked: '{{x@|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: 'Request',
            },
            marked: '{{Request|',
        },
        {
            context: {
                blockStack: [],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: 'foo.bar',
            },
            marked: '{{foo.bar|',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'helperOrPathStart', word: '' },
            marked: '{{#each x}}a{{/each}} {{|',
        },
        {
            context: {
                blockStack: ['if', 'each'],
                inEachScope: true,
                kind: 'helperOrPathStart',
                word: '',
            },
            marked: '{{#if x}}a{{else}}{{#each y}}{{|',
        },
        {
            context: { blockStack: ['each'], inEachScope: true, kind: 'none', word: '' },
            marked: '{{#each x}}|a{{/each}}',
        },
        {
            context: { blockStack: ['each'], inEachScope: true, kind: 'none', word: '' },
            marked: '{{#each x}}a|{{/each}}',
        },
        {
            context: { blockStack: [], inEachScope: false, kind: 'none', word: '' },
            marked: '{{#each x}}a{{/each}}b|',
        },
        {
            context: {
                blockStack: ['first'],
                inEachScope: true,
                kind: 'helperOrPathStart',
                word: '',
            },
            marked: '{{#first x}}{{|',
        },
        {
            context: {
                blockStack: ['with'],
                inEachScope: false,
                kind: 'helperOrPathStart',
                word: '',
            },
            marked: '{{#with x}}{{|',
        },
        { context: at('helperOrPathStart', { word: 'Requestx' }), marked: '{{Requestx|' },
        { context: at('none'), marked: 'a|b{{#each x}}c{{/each}}' },
        { context: at('none'), marked: '|{{x' },
        { context: at('none'), marked: '{|{x' },
        { context: at('none'), marked: 'a{|{x' },
        { context: at('helperOrPathStart', { word: 'fa' }), marked: '{{fa|{{x}}' },
    ])(
        // Given - a template being typed, `|` marking the cursor
        // Then - the whole context the cursor sits in: its kind, the word typed, the path, the enclosing blocks
        'classifies $marked',
        ({ context, marked }) => {
            expect(
                classifyCompletionContext(marked.replace('|', ''), marked.indexOf('|')),
            ).toStrictEqual(context);
        },
    );
});
