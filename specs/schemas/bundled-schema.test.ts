import { describe, expect, test } from 'vitest';

import { hoverflySchema } from '../../packages/analysis/src/schema/bundled-schema.js';

describe('bundled schema', () => {
    test('describes every property of every definition', () => {
        // Given - the properties the schema-driven hover and completion read their text from
        const undescribed = Object.entries(hoverflySchema.definitions ?? {}).flatMap(
            ([definition, schema]) =>
                Object.entries(typeof schema === 'object' ? (schema.properties ?? {}) : {})
                    .filter(
                        ([, property]) =>
                            typeof property !== 'object' || (property.description ?? '') === '',
                    )
                    .map(([name]) => `${definition}.${name}`),
        );

        // Then - none goes without its description
        expect(undescribed).toStrictEqual([]);
    });
});
