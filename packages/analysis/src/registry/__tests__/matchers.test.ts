import { describe, expect, test } from 'vitest';

import { TRANSFORMING_MATCHER_NAMES } from '../matchers.js';

describe('matchers', () => {
    test('four matchers extract a value for the next doMatch', () => {
        // Given - the registry of matchers
        // Then - the names it holds, in order
        expect(TRANSFORMING_MATCHER_NAMES).toStrictEqual([
            'xpath',
            'jsonpath',
            'jwt',
            'jwtjsonpath',
        ]);
    });
});
