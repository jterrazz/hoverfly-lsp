import { describe, expect, test } from 'vitest';

import { analyze } from '../../template/analyzer.js';
import { ALL_HELPERS } from '../templating.data.js';

describe('templating.data', () => {
    test.each(ALL_HELPERS.map((spec) => ({ example: spec.example, name: spec.name })))(
        'the $name example calls $name and analyzes clean',
        ({ example, name }) => {
            // Given - the example a hover or a completion shows for the helper
            // Then - it invokes that helper and the analyzer finds nothing wrong in it
            expect(example).toMatch(new RegExp(String.raw`[{(#]${name}[\s})]`, 'u'));
            expect(analyze(example)).toStrictEqual([]);
        },
    );
});
