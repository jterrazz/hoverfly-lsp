import { describe, expect, test } from 'vitest';

import { REGISTRY_MATCHER_NAMES, TRANSFORMING_MATCHER_NAMES } from '../matchers.js';

describe('matchers', () => {
    test('the registry names the default and thirteen matchers, never the body-only form', () => {
        // Given - the registry of matchers
        // Then - the names it holds, in order
        expect(REGISTRY_MATCHER_NAMES).toStrictEqual([
            '',
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
        ]);
    });

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
