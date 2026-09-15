import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';

import { hoverflySchema } from '../../src/schema/hoverfly.schema.generated.js';
import {
    HOVERFLY_COMMIT,
    HOVERFLY_SCHEMA_URL,
    SCHEMA_FETCHED_AT,
} from '../../src/schema/provenance.js';

const schemaJsonPath = fileURLToPath(
    new URL('../../src/schema/hoverfly.schema.json', import.meta.url),
);

describe('bundled hoverfly schema', () => {
    test('the source JSON is well-formed JSON', () => {
        // Given - the editable schema source on disk
        const text = readFileSync(schemaJsonPath, 'utf8');
        // Then - it parses as JSON without throwing
        expect(() => JSON.parse(text)).not.toThrow();
    });

    test('the generated module matches the source JSON byte-for-byte (regenerate if this fails)', () => {
        // Given - the editable source and the embedded copy
        const fromDisk = JSON.parse(readFileSync(schemaJsonPath, 'utf8')) as unknown;
        // Then - the embedded schema is the same document
        expect(hoverflySchema).toStrictEqual(fromDisk);
    });

    test('declares the draft-07 $schema and the LSP $id', () => {
        // Given - the bundled schema
        // Then - it self-declares draft and identity
        expect(hoverflySchema.$schema).toBe('http://json-schema.org/draft-07/schema#');
        expect(hoverflySchema.$id).toBe(
            'https://hoverfly-lsp.dev/schemas/hoverfly-simulation.json',
        );
    });

    test('keeps the root additionalProperties:false constraint from the official schema', () => {
        // Given - the bundled schema root
        // Then - extra top-level keys are rejected (faithful to official)
        expect(hoverflySchema.additionalProperties).toBeFalsy();
        expect(hoverflySchema.required).toStrictEqual(['data', 'meta']);
    });

    test('keeps matcher as a free string and carries NO matcher-name examples (D5)', () => {
        // Given - the field-matcher definition
        const matcher = hoverflySchema.definitions?.['field-matchers']?.properties?.matcher;
        // Then - it stays a permissive string with no enum (never stricter)
        expect(matcher?.type).toBe('string');
        expect(matcher?.enum).toBeUndefined();
        /*
         * And - it carries NO matcher-name `examples`. vscode-json-languageservice surfaces schema
         * `examples` as completions on every matcher position; that both (a) leaks the body-only
         * `form` onto non-body matchers (path/query/header/…) and (b) duplicates every contribution
         * matcher item under an inconsistent quoted label. The Hoverfly contribution owns matcher-name
         * completions (it alone gates `form` to request.body), so the schema must not also emit them.
         */
        expect(matcher?.examples).toBeUndefined();
    });

    test('adds the request.method property (valid per D5, absent from the official schema)', () => {
        // Given - the request definition
        const method = hoverflySchema.definitions?.request?.properties?.method;
        // Then - method is a field-matcher array
        expect(method?.type).toBe('array');
    });

    test('types field-matchers as object (official schema does), so an array-shaped doMatch is HF102', () => {
        // Given - the field-matchers definition (doMatch self-$refs it)
        const fieldMatchers = hoverflySchema.definitions?.['field-matchers'];
        /*
         * Then - it carries `type: "object"`, mirroring Hoverfly's embedded schema (research/02).
         * This is faithful, not stricter: an array-shaped doMatch is rejected by Hoverfly at import
         * (HTTP 400, "Expected: object, given: array"), and our restored constraint reproduces it as
         * an HF102 schema error.
         */
        expect(fieldMatchers?.type).toBe('object');
    });

    test('stays a faithful superset: no type on logNormalDelay (official leaves it untyped)', () => {
        // Given - a definition the official schema leaves untyped
        const logNormalDelay = hoverflySchema.definitions?.response?.properties?.logNormalDelay;
        // Then - we do not add a `type` it lacks (never stricter than official)
        expect(logNormalDelay?.type).toBeUndefined();
    });

    test('provides high-value defaultSnippets', () => {
        // Given - the pair and field-matcher definitions
        const pair = hoverflySchema.definitions?.['request-response-pair'];
        const fieldMatchers = hoverflySchema.definitions?.['field-matchers'];
        // Then - both carry a default snippet
        expect(pair?.defaultSnippets?.length).toBeGreaterThan(0);
        expect(fieldMatchers?.defaultSnippets?.length).toBeGreaterThan(0);
    });

    test('every property under every definition has a description (the docs investment)', () => {
        // Given - all definitions in the bundled schema
        const definitions = hoverflySchema.definitions ?? {};
        const missing: string[] = [];
        for (const [defName, def] of Object.entries(definitions)) {
            const props = (def as { properties?: Record<string, { description?: string }> })
                .properties;
            if (!props) {
                continue;
            }
            for (const [propName, prop] of Object.entries(props)) {
                if (typeof prop.description !== 'string' || prop.description.length === 0) {
                    missing.push(`${defName}.${propName}`);
                }
            }
        }
        // Then - none are missing a description (these power schema-driven hover + completion)
        expect(missing).toStrictEqual([]);
    });
});

describe('schema provenance', () => {
    test('pins the upstream Hoverfly commit, URL and fetch date', () => {
        // Given - the provenance constants
        // Then - they are populated for the CI drift job
        expect(HOVERFLY_COMMIT).toMatch(/^[0-9a-f]{40}$/u);
        expect(HOVERFLY_SCHEMA_URL).toContain('SpectoLabs/hoverfly');
        expect(SCHEMA_FETCHED_AT).toBe('2026-06-11');
    });
});
