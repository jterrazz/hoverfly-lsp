import { describe, expect, test } from 'vitest';

import { FAKER_NAMES, FAKER_PARAMETERIZED_PANICS, GOFAKEIT_VERSION } from './faker.js';

describe('fAKER_NAMES', () => {
    test('has exactly 210 names (gofakeit v6.28.0 zero-arg methods)', () => {
        // Then - the frozen count from report 08 §3.3
        expect(FAKER_NAMES).toHaveLength(210);
    });

    test('has no duplicate names', () => {
        // Given - the names
        // Then - all unique
        expect(new Set(FAKER_NAMES).size).toBe(FAKER_NAMES.length);
    });

    test('contains Email and UUID exactly as spelled in the report', () => {
        // Then - case-sensitive spot-checks
        expect(FAKER_NAMES).toContain('Email');
        expect(FAKER_NAMES).toContain('UUID');
        expect(FAKER_NAMES).toContain('Name');
        expect(FAKER_NAMES).toContain('IPv4Address');
        expect(FAKER_NAMES).toContain('SSN');
    });

    test('does NOT contain parameterized methods like Number', () => {
        // Then - Number/Sentence/Password/Regex are excluded (they panic when zero-arg called)
        expect(FAKER_NAMES).not.toContain('Number');
        expect(FAKER_NAMES).not.toContain('Sentence');
        expect(FAKER_NAMES).not.toContain('Password');
        expect(FAKER_NAMES).not.toContain('Regex');
    });

    test('names are case-sensitive exact spellings (no lowercase variants)', () => {
        // Then - the lowercase form is absent
        expect(FAKER_NAMES).not.toContain('email');
        expect(FAKER_NAMES).not.toContain('uuid');
    });
});

describe('fAKER_PARAMETERIZED_PANICS', () => {
    test('lists the known panic-on-zero-arg methods from the report', () => {
        // Then - Number, Sentence, Password, Regex are flagged
        expect(FAKER_PARAMETERIZED_PANICS).toContain('Number');
        expect(FAKER_PARAMETERIZED_PANICS).toContain('Sentence');
        expect(FAKER_PARAMETERIZED_PANICS).toContain('Password');
        expect(FAKER_PARAMETERIZED_PANICS).toContain('Regex');
    });

    test('does not overlap with the valid zero-arg FAKER_NAMES', () => {
        // Then - no name is both valid and a panic
        const valid = new Set(FAKER_NAMES);
        for (const name of FAKER_PARAMETERIZED_PANICS) {
            expect(valid.has(name)).toBeFalsy();
        }
    });
});

describe('gOFAKEIT_VERSION', () => {
    test('is the pinned 6.28.0', () => {
        // Then - matches the go.mod pin (report 08 §3.1)
        expect(GOFAKEIT_VERSION).toBe('6.28.0');
    });
});
