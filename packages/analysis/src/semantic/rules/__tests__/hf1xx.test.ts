import { describe, expect, test } from 'vitest';

import { hf1xxSchemaVersionRule } from '../hf1xx.js';
import { diagnosticsOf } from './rule-run.js';

const run = (simulation: unknown): string[] => diagnosticsOf(hf1xxSchemaVersionRule, simulation);

describe('hf1xx', () => {
    test.each([
        {
            expected: [
                'HF103 information 5:21-5:25 Schema version v3 is legacy; Hoverfly auto-upgrades it on import (current: v5.3)',
            ],
            label: 'the legacy v3',
            simulation: { data: { pairs: [] }, meta: { schemaVersion: 'v3' } },
        },
        {
            expected: [],
            label: 'the current v5.3',
            simulation: { data: { pairs: [] }, meta: { schemaVersion: 'v5.3' } },
        },
        {
            expected: ['HF104 error 5:21-5:26 Unrecognized schema version "v5x"'],
            label: 'the unrecognised v5x',
            simulation: { data: { pairs: [] }, meta: { schemaVersion: 'v5x' } },
        },
        {
            expected: [],
            label: 'the bare major v5',
            simulation: { data: { pairs: [] }, meta: { schemaVersion: 'v5' } },
        },
        {
            expected: [],
            label: "a numeric version, the schema's concern",
            simulation: { data: { pairs: [] }, meta: { schemaVersion: 5 } },
        },
    ])(
        // Given - a simulation whose meta holds $label
        // Then - HF103 on a legacy version, HF104 on an unrecognised one, nothing on a current or missing one
        'hf1xxSchemaVersionRule — $label',
        ({ expected, simulation }) => {
            expect(run(simulation)).toStrictEqual(expected);
        },
    );
});
