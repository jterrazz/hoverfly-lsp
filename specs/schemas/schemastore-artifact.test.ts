import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

function read(
    path: string,
): Record<string, Record<string, Record<string, Record<string, Record<string, unknown>>>>> {
    return JSON.parse(readFileSync(new URL(path, import.meta.url), 'utf8')) as ReturnType<
        typeof read
    >;
}

describe('schemastore artifact', () => {
    test('is the bundled schema with its two documented deltas and nothing else', () => {
        // Given - the bundled schema, given the SchemaStore $id and the matcher names the LSP contribution offers in its place
        const expected = read('../../packages/analysis/src/schema/hoverfly.schema.json');
        expected.$id = 'https://json.schemastore.org/hoverfly-simulation.json' as never;
        const matcher = expected.definitions?.['field-matchers']?.properties?.matcher;
        if (matcher !== undefined) {
            matcher.examples = [
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
            ];
        }

        // Then - the published artefact is exactly that
        expect(read('../../schemas/hoverfly-simulation.json')).toStrictEqual(expected);
    });
});
