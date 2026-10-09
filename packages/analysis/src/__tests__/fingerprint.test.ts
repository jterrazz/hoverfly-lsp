import { describe, expect, test } from 'vitest';
import { getLanguageService } from 'vscode-json-languageservice';
import { TextDocument } from 'vscode-languageserver-textdocument';

import { hasHoverflyFilename, isHoverflySimulationAst } from '../fingerprint.js';

const parser = getLanguageService({});

const fingerprint = (text: string): boolean =>
    isHoverflySimulationAst(
        parser.parseJSONDocument(TextDocument.create('file:///s.json', 'json', 1, text)).root,
    );

describe('fingerprint', () => {
    test.each([
        {
            json: { data: { pairs: [] }, meta: { schemaVersion: 'v5.3' } },
            expected: true,
            label: 'a v5.3 simulation',
        },
        {
            json: { data: {}, meta: { schemaVersion: 'v5' } },
            expected: true,
            label: 'a simulation with no pairs',
        },
        { json: { data: { pairs: [] } }, expected: false, label: 'no meta' },
        {
            json: { data: {}, meta: { schemaVersion: '5.3' } },
            expected: false,
            label: 'a version with no leading v',
        },
        {
            json: [{ data: {}, meta: { schemaVersion: 'v5' } }],
            expected: false,
            label: 'an array root',
        },
        { json: 'v5.3', expected: false, label: 'a string root' },
        {
            json: { data: null, meta: { schemaVersion: 'v5.3' } },
            expected: false,
            label: 'a null data',
        },
        { json: { data: {}, meta: null }, expected: false, label: 'a null meta' },
        {
            json: { data: {}, meta: { schemaVersion: 5.3 } },
            expected: false,
            label: 'a numeric version',
        },
        {
            json: { data: [], meta: { schemaVersion: 'v5.3' } },
            expected: false,
            label: 'an array data',
        },
        {
            json: { meta: { schemaVersion: 'v5.3' }, data: 5 },
            expected: false,
            label: 'a meta object before a numeric data',
        },
        {
            json: { data: {}, meta: { hoverflyVersion: 'v1.12.8', schemaVersion: 5 } },
            expected: false,
            label: 'a numeric version after a v-prefixed hoverflyVersion',
        },
        { json: { data: {}, meta: {} }, expected: false, label: 'a meta with no version' },
    ])(
        // Given - $label, serialised as JSON
        // Then - a simulation is an object root with a data object and a v-prefixed string version (D3)
        'isHoverflySimulationAst — $label: $expected',
        ({ expected, json }) => {
            expect(fingerprint(JSON.stringify(json))).toBe(expected);
        },
    );

    test.each([
        {
            expected: true,
            label: 'a simulation missing its last brace',
            text: '{"data":{},"meta":{"schemaVersion":"v5"}',
        },
        {
            expected: false,
            label: 'broken JSON with no meta',
            text: '{ "data": { "pairs": [ , "meta": }',
        },
        { expected: false, label: 'no text', text: '' },
    ])(
        // Given - $label
        // Then - the fingerprint reads the error-recovering AST, so a recognisable simulation still counts
        'isHoverflySimulationAst — $label: $expected',
        ({ expected, text }) => {
            expect(fingerprint(text)).toBe(expected);
        },
    );

    test.each([
        { expected: true, uri: 'api.hoverfly.json' },
        { expected: true, uri: 'hoverfly-simulation.json' },
        { expected: true, uri: 'file:///x/hoverfly-simulation.json' },
        { expected: true, uri: 'file:///x/api.hoverfly.json#L3' },
        { expected: true, uri: 'file:///a/b/users.hoverfly.json' },
        { expected: true, uri: 'api.hfy' },
        { expected: true, uri: 'file:///some/dir/login.hfy' },
        { expected: true, uri: 'API.HFY' },
        { expected: true, uri: 'login.hfy?version=2' },
        { expected: false, uri: 'package.json' },
        { expected: false, uri: 'notes.hfyx' },
        { expected: false, uri: 'hfy' },
        { expected: false, uri: 'config.yaml' },
    ])(
        // Given - $uri
        // Then - named for Hoverfly when it ends in .hoverfly.json or .hfy, or is hoverfly-simulation.json, in any case, a query left aside
        'hasHoverflyFilename — $uri: $expected',
        ({ expected, uri }) => {
            expect(hasHoverflyFilename(uri)).toBe(expected);
        },
    );
});
