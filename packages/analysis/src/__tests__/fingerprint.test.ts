import { describe, expect, test } from 'vitest';

import { hasHoverflyFilename, isHoverflySimulation } from '../fingerprint.js';

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
    ])(
        // Given - $label, serialised as JSON
        // Then - a simulation is an object root with a data object and a v-prefixed string version (D3)
        'isHoverflySimulation — $label: $expected',
        ({ expected, json }) => {
            expect(isHoverflySimulation(JSON.stringify(json))).toBe(expected);
        },
    );

    test('isHoverflySimulation — reads broken JSON as no simulation, without throwing', () => {
        // Given - syntactically broken JSON
        const text = '{ "data": { "pairs": [ , "meta": }';

        // Then - false
        expect(isHoverflySimulation(text)).toBe(false);
    });

    test.each([
        { expected: true, uri: 'api.hoverfly.json' },
        { expected: true, uri: 'hoverfly-simulation.json' },
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
