import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { arrayItems, asObject, propValue } from '../ast-access.js';

const parser = getLanguageService({});

function rootOf(text: string) {
    return parser.parseJSONDocument(TextDocument.create('file:///a.json', 'json', 1, text)).root;
}

describe('ast-access', () => {
    test.each([
        { object: true, text: '{"a":1}' },
        { object: false, text: '[1]' },
        { object: false, text: '"a"' },
        { object: false, text: '' },
    ])(
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        '$text',
        ({ object, text }) => {
            expect(asObject(rootOf(text))?.type === 'object').toBe(object);
        },
    );

    test('is nothing for no node', () => {
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        expect(asObject(undefined)).toBeUndefined();
    });

    test.each([
        { text: '{"a":1,"b":"x"}', key: 'b', type: 'string' },
        { text: '{"a":1,"b":"x"}', key: 'a', type: 'number' },
        { text: '{"a":1,"b":"x"}', key: 'c', type: undefined },
        { text: '{"a":}', key: 'a', type: undefined },
    ])(
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        '$key of $text',
        ({ key, text, type }) => {
            const value = propValue(asObject(rootOf(text)), key);
            expect(value?.type).toBe(type);
        },
    );

    test('is nothing for no object', () => {
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        expect(propValue(undefined, 'a')).toBeUndefined();
    });

    test.each([
        { items: ['number', 'string'], text: '{"a":[1,"x"]}' },
        { items: [], text: '{"a":[]}' },
        { items: [], text: '{"a":"x"}' },
        { items: [], text: '{"a":{"b":[1]}}' },
        { items: [], text: '{"b":[1]}' },
    ])(
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        'a of $text',
        ({ items, text }) => {
            const found = arrayItems(asObject(rootOf(text)), 'a');
            expect(found.map(({ type }) => type)).toStrictEqual(items);
        },
    );

    test('is none for no object', () => {
        // Given - a parsed node and, for a key, the object it is read from
        // Then - what the accessor hands back, or nothing when the shape differs
        expect(arrayItems(undefined, 'a')).toStrictEqual([]);
    });
});
