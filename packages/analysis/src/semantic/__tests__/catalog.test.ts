import { describe, expect, test } from 'vitest';

import { formatMessage } from '../catalog.js';

describe('formatMessage', () => {
    test('substitutes named placeholders', () => {
        // Given - a template and matching args
        // Then - the slot is filled
        expect(formatMessage('Unknown matcher "{name}"', { name: 'exct' })).toBe(
            'Unknown matcher "exct"',
        );
    });

    test('leaves an unknown placeholder literal (never throws)', () => {
        // Given - a template referencing a missing arg
        // Then - the slot stays as written
        expect(formatMessage('hi {missing}', {})).toBe('hi {missing}');
    });

    test('stringifies non-string args', () => {
        // Given - a numeric arg
        // Then - it is coerced to its string form
        expect(formatMessage('Status {n} is bad', { n: 700 })).toBe('Status 700 is bad');
    });
});
