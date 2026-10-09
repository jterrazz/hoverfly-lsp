import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';

import { hoverflySchema } from '../../packages/analysis/src/schema/hoverfly.schema.generated.js';

const source: unknown = JSON.parse(
    readFileSync(
        new URL('../../packages/analysis/src/schema/hoverfly.schema.json', import.meta.url),
        'utf8',
    ),
);

describe('bundled schema', () => {
    test('is embedded as the very document hoverfly.schema.json holds', () => {
        // Given - the editable source and the module its generator embeds it in
        // Then - one document, or the generator was not run after an edit
        expect(hoverflySchema).toStrictEqual(source);
    });

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
