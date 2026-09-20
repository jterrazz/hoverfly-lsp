import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { JSONSchema } from 'vscode-json-languageservice';

import { hoverflySchema } from '../../../src/schema/hoverfly.schema.generated.js';
import {
    HOVERFLY_COMMIT,
    HOVERFLY_SCHEMA_URL,
    SCHEMA_FETCHED_AT,
} from '../../../src/schema/provenance.js';
import { integration } from '../integration.specification.js';

const schemaJsonPath = fileURLToPath(
    new URL('../../../src/schema/hoverfly.schema.json', import.meta.url),
);

/**
 * A JSON Schema property map holds a schema OR a bare boolean (`JSONSchemaRef`, which the
 * package's root entry does not export), so a reading narrows before it reads. A
 * boolean-shaped entry answers `undefined` — what "the schema declares nothing here" means.
 */
function asSchema(ref: boolean | JSONSchema | undefined): JSONSchema | undefined {
    return typeof ref === 'object' ? ref : undefined;
}

/** The editable schema source, read from disk — the oracle the embedded copy answers to. */
function schemaFromDisk(): unknown {
    return JSON.parse(readFileSync(schemaJsonPath, 'utf8'));
}

describe('bundled hoverfly schema', () => {
    test('the source JSON is well-formed JSON', async () => {
        // Given - the editable schema source on disk
        const result = await integration.call(schemaFromDisk);
        // Then - reading it threw nothing: it parses as JSON
        await expect(result.error).toBeEmpty();
    });

    test('the generated module matches the source JSON byte-for-byte (regenerate if this fails)', async () => {
        // Given - the editable source and the embedded copy
        const result = await integration.call(() => ({
            embedded: hoverflySchema as unknown,
            onDisk: schemaFromDisk(),
        }));
        // Then - the embedded schema is the same document
        expect(result.value.value.embedded).toStrictEqual(result.value.value.onDisk);
    });

    test('declares the draft-07 $schema and the LSP $id', async () => {
        // Given - the bundled schema
        const result = await integration.call(() => ({
            id: hoverflySchema.$id,
            schema: hoverflySchema.$schema,
        }));
        // Then - it self-declares draft and identity
        expect(result.value.value.schema).toBe('http://json-schema.org/draft-07/schema#');
        expect(result.value.value.id).toBe(
            'https://hoverfly-lsp.dev/schemas/hoverfly-simulation.json',
        );
    });

    test('keeps the root additionalProperties:false constraint from the official schema', async () => {
        // Given - the bundled schema root
        const result = await integration.call(() => ({
            additionalProperties: hoverflySchema.additionalProperties,
            required: hoverflySchema.required,
        }));
        // Then - extra top-level keys are rejected (faithful to official)
        expect(result.value.value.additionalProperties).toBe(false);
        expect(result.value.value.required).toStrictEqual(['data', 'meta']);
    });

    test('keeps matcher as a free string and carries NO matcher-name examples (D5)', async () => {
        // Given - the field-matcher definition
        const result = await integration.call(() => {
            const matcher = asSchema(
                hoverflySchema.definitions?.['field-matchers']?.properties?.matcher,
            );
            return {
                hasEnum: matcher?.enum !== undefined,
                hasExamples: matcher?.examples !== undefined,
                type: matcher?.type,
            };
        });

        // Then - it stays a permissive string with no enum (never stricter)
        expect(result.value.value.type).toBe('string');
        expect(result.value.value.hasEnum).toBe(false);
        /*
         * And - it carries NO matcher-name `examples`. vscode-json-languageservice surfaces schema
         * `examples` as completions on every matcher position; that both (a) leaks the body-only
         * `form` onto non-body matchers (path/query/header/…) and (b) duplicates every contribution
         * matcher item under an inconsistent quoted label. The Hoverfly contribution owns matcher-name
         * completions (it alone gates `form` to request.body), so the schema must not also emit them.
         */
        expect(result.value.value.hasExamples).toBe(false);
    });

    test('adds the request.method property (valid per D5, absent from the official schema)', async () => {
        // Given - the request definition
        const result = await integration.call(() => ({
            type: asSchema(hoverflySchema.definitions?.request?.properties?.method)?.type,
        }));
        // Then - method is a field-matcher array
        expect(result.value.value.type).toBe('array');
    });

    test('types field-matchers as object (official schema does), so an array-shaped doMatch is HF102', async () => {
        // Given - the field-matchers definition (doMatch self-$refs it)
        const result = await integration.call(() => ({
            type: hoverflySchema.definitions?.['field-matchers']?.type,
        }));
        /*
         * Then - it carries `type: "object"`, mirroring Hoverfly's embedded schema (research/02).
         * This is faithful, not stricter: an array-shaped doMatch is rejected by Hoverfly at import
         * (HTTP 400, "Expected: object, given: array"), and our restored constraint reproduces it as
         * an HF102 schema error.
         */
        expect(result.value.value.type).toBe('object');
    });

    test('stays a faithful superset: no type on logNormalDelay (official leaves it untyped)', async () => {
        // Given - a definition the official schema leaves untyped
        const result = await integration.call(() => ({
            typed:
                hoverflySchema.definitions?.response?.properties?.logNormalDelay?.type !==
                undefined,
        }));
        // Then - we do not add a `type` it lacks (never stricter than official)
        expect(result.value.value.typed).toBe(false);
    });

    test('provides high-value defaultSnippets', async () => {
        // Given - the pair and field-matcher definitions
        const result = await integration.call(() => ({
            fieldMatchers:
                hoverflySchema.definitions?.['field-matchers']?.defaultSnippets?.length ?? 0,
            pair:
                hoverflySchema.definitions?.['request-response-pair']?.defaultSnippets?.length ?? 0,
        }));
        // Then - both carry a default snippet
        expect(result.value.value.pair).toBeGreaterThan(0);
        expect(result.value.value.fieldMatchers).toBeGreaterThan(0);
    });

    test('every property under every definition has a description (the docs investment)', async () => {
        // Given - all definitions in the bundled schema
        const result = await integration.call(() => {
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
            return missing;
        });
        // Then - none are missing a description (these power schema-driven hover + completion)
        expect(result.value.value).toStrictEqual([]);
    });
});

describe('schema provenance', () => {
    test('pins the upstream Hoverfly commit, URL and fetch date', async () => {
        // Given - the provenance constants
        const result = await integration.call(() => ({
            commit: HOVERFLY_COMMIT,
            fetchedAt: SCHEMA_FETCHED_AT,
            url: HOVERFLY_SCHEMA_URL,
        }));
        // Then - they are populated for the CI drift job
        expect(result.value.value.commit).toMatch(/^[0-9a-f]{40}$/u);
        expect(result.value.value.url).toContain('SpectoLabs/hoverfly');
        expect(result.value.value.fetchedAt).toBe('2026-06-11');
    });
});
