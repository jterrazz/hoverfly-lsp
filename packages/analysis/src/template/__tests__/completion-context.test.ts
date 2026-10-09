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
