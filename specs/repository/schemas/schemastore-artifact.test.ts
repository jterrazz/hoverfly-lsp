import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function read(path: string): unknown {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8'));
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// invariant: the two documented deltas — SchemaStore's $id, and the matcher names the LSP contribution
// offers in their place, which a schema-only consumer has no other way to see.
function withDeltas(schema: unknown): unknown {
    const definitions = isRecord(schema) ? schema.definitions : undefined;
    const fieldMatchers = isRecord(definitions) ? definitions['field-matchers'] : undefined;
    const properties = isRecord(fieldMatchers) ? fieldMatchers.properties : undefined;
    const matcher = isRecord(properties) ? properties.matcher : undefined;
    if (
        !isRecord(schema) ||
        !isRecord(definitions) ||
        !isRecord(fieldMatchers) ||
        !isRecord(properties) ||
        !isRecord(matcher)
    ) {
        return schema;
    }
    return {
        ...schema,
        $id: 'https://json.schemastore.org/hoverfly-simulation.json',
        definitions: {
            ...definitions,
            'field-matchers': {
                ...fieldMatchers,
                properties: {
                    ...properties,
                    matcher: {
                        ...matcher,
                        examples: [
                            'exact',
                            'negate',
                            'glob',
                            'regex',
                            'xml',
                            'xmltemplated',
                            'xpath',
                            'json',
                            'jsonpartial',
                            'jsonpath',
                            'jwt',
                            'jwtjsonpath',
                            'array',
                            'form',
                        ],
                    },
                },
            },
        },
    };
}

describe('schemastore-artifact', () => {
    test('is the bundled schema with its two documented deltas and nothing else', () => {
        // Given - the bundled schema the language service validates against
        const bundled = read('../../../packages/analysis/src/schema/hoverfly.schema.json');

        // Then - the published artefact is that schema with the deltas, exactly
        expect(read('../../../schemas/hoverfly-simulation.json')).toStrictEqual(
            withDeltas(bundled),
        );
    });
});
