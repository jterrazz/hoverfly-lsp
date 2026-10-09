import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { buildSimulationModel } from '../../model.js';
import { walkMatchers } from '../matcher-walk.js';
import { pairOf } from './rule-run.js';

const parser = getLanguageService({});

// value: each walked matcher as `name@depth field/container`, a config marked `+config` and a doMatch key `+doMatch`.
function walked(request: object): string[] {
    const text = JSON.stringify(pairOf(request), null, 2);
    const document = TextDocument.create('file:///s.hoverfly.json', 'json', 1, text);
    const [pair] = buildSimulationModel(parser.parseJSONDocument(document)).pairs;
    return (pair?.request.fields ?? []).flatMap((field) =>
        walkMatchers(field.matchers).map(
            ({ depth, doMatchKeyNode, matcher }) =>
                `${String(matcher.matcherName)}@${depth} ${matcher.parent.fieldName}/${matcher.parent.container}${matcher.configNode === undefined ? '' : ' +config'}${doMatchKeyNode === undefined ? '' : ' +doMatch'}`,
        ),
    );
}

describe('walkMatchers', () => {
    test.each([
        {
            label: 'top-level matchers in document order',
            request: {
                path: [
                    { matcher: 'exact', value: '/a' },
                    { matcher: 'glob', value: '/*' },
                ],
            },
            walked: ['exact@0 path/request', 'glob@0 path/request'],
        },
        {
            label: 'an object doMatch chain, each link one level deeper',
            request: {
                body: [
                    {
                        matcher: 'jsonpath',
                        value: '$.a',
                        doMatch: {
                            matcher: 'exact',
                            value: 'b',
                            doMatch: { matcher: 'array', value: [], config: {} },
                        },
                    },
                ],
            },
            walked: [
                'jsonpath@0 body/request +doMatch',
                'exact@1 body/request +doMatch',
                'array@2 body/request +config',
            ],
        },
        {
            label: 'a legacy array doMatch, each item at the next level',
            request: {
                headers: {
                    X: [
                        {
                            matcher: 'jsonpath',
                            value: '$',
                            doMatch: [{ matcher: 'form', value: {} }, 'not a matcher'],
                        },
                    ],
                },
            },
            walked: ['jsonpath@0 X/headers +doMatch', 'form@1 X/headers', 'undefined@1 X/headers'],
        },
        {
            label: 'a doMatch that is neither object nor array',
            request: { path: [{ matcher: 'regex', value: 'a', doMatch: 5 }] },
            walked: ['regex@0 path/request +doMatch'],
        },
    ])(
        // Given - a request holding $label
        // Then - every matcher the walk visits, with its depth and the field it belongs to
        'walkMatchers — $label',
        ({ request, walked: expected }) => {
            expect(walked(request)).toStrictEqual(expected);
        },
    );
});
