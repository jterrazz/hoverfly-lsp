import { describe, expect, test } from 'vitest';

import { hasHoverflyFilename, isHoverflySimulation } from './fingerprint.js';

describe('isHoverflySimulation', () => {
    test('accepts a minimal valid v5.3 simulation', () => {
        // Given - a root object with data + meta.schemaVersion "v5.3"
        const text = JSON.stringify({
            data: { pairs: [] },
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - it is recognised as a Hoverfly simulation
        expect(isHoverflySimulation(text)).toBeTruthy();
    });

    test('accepts a simulation without data.pairs (pairs is optional per D3)', () => {
        // Given - data is an empty object, no pairs
        const text = JSON.stringify({
            data: {},
            meta: { schemaVersion: 'v5' },
        });
        // Then - still recognised
        expect(isHoverflySimulation(text)).toBeTruthy();
    });

    test('rejects when meta is missing', () => {
        // Given - data present, no meta
        const text = JSON.stringify({ data: { pairs: [] } });
        // Then - not a simulation
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects schemaVersion without a leading "v" (e.g. "5.3")', () => {
        // Given - numeric-style version string
        const text = JSON.stringify({
            data: {},
            meta: { schemaVersion: '5.3' },
        });
        // Then - rejected (D3 requires startsWith "v")
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('accepts schemaVersion "v5.3"', () => {
        // Given - the current default schema version
        const text = JSON.stringify({
            data: {},
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - accepted
        expect(isHoverflySimulation(text)).toBeTruthy();
    });

    test('rejects a non-object root (array)', () => {
        // Given - a JSON array at the root
        const text = JSON.stringify([{ data: {}, meta: { schemaVersion: 'v5' } }]);
        // Then - rejected
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects a non-object root (string)', () => {
        // Given - a bare JSON string
        const text = JSON.stringify('v5.3');
        // Then - rejected
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects invalid JSON without throwing', () => {
        // Given - syntactically broken JSON
        const text = '{ "data": { "pairs": [ , "meta": }';
        // Then - returns false, never throws
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects when data is present but null', () => {
        // Given - data is null
        const text = JSON.stringify({
            data: null,
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - rejected (null is not an object)
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects when meta is present but null', () => {
        // Given - meta is null
        const text = JSON.stringify({
            data: {},
            meta: null,
        });
        // Then - rejected
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects when schemaVersion is not a string', () => {
        // Given - schemaVersion is a number
        const text = JSON.stringify({
            data: {},
            meta: { schemaVersion: 5.3 },
        });
        // Then - rejected
        expect(isHoverflySimulation(text)).toBeFalsy();
    });

    test('rejects when data is an array (not a plain object)', () => {
        // Given - data is an array
        const text = JSON.stringify({
            data: [],
            meta: { schemaVersion: 'v5.3' },
        });
        // Then - rejected
        expect(isHoverflySimulation(text)).toBeFalsy();
    });
});

describe('hasHoverflyFilename', () => {
    test('matches the canonical filename conventions', () => {
        expect(hasHoverflyFilename('api.hoverfly.json')).toBeTruthy();
        expect(hasHoverflyFilename('hoverfly-simulation.json')).toBeTruthy();
        expect(hasHoverflyFilename('file:///a/b/users.hoverfly.json')).toBeTruthy();
    });

    test('matches the .hfy extension', () => {
        expect(hasHoverflyFilename('api.hfy')).toBeTruthy();
        expect(hasHoverflyFilename('file:///some/dir/login.hfy')).toBeTruthy();
        // Case-insensitive
        expect(hasHoverflyFilename('API.HFY')).toBeTruthy();
        // URI query stripped
        expect(hasHoverflyFilename('login.hfy?version=2')).toBeTruthy();
    });

    test('does not match plain or unrelated files', () => {
        expect(hasHoverflyFilename('package.json')).toBeFalsy();
        expect(hasHoverflyFilename('notes.hfyx')).toBeFalsy();
        expect(hasHoverflyFilename('hfy')).toBeFalsy();
        expect(hasHoverflyFilename('config.yaml')).toBeFalsy();
    });
});
