import { describe, expect, test } from 'vitest';

import {
    ALL_HELPERS,
    type HelperSpec,
    HOVERFLY_HELPERS,
    NOW_FORMAT_NOTES,
    NOW_OFFSET_UNITS,
    RAYMOND_BUILTINS,
    VARIABLE_FUNCTION_NAMES,
} from '../../src/registry/templating.js';

function byName(specs: readonly HelperSpec[], name: string): HelperSpec | undefined {
    return specs.find((spec) => spec.name === name);
}

describe('hOVERFLY_HELPERS', () => {
    test('has exactly 52 helpers (the helperMethodMap count)', () => {
        // Then - frozen at 52 per report 08 §1
        expect(HOVERFLY_HELPERS).toHaveLength(52);
    });

    test('has no duplicate helper names', () => {
        // Given - the names
        const names = HOVERFLY_HELPERS.map((spec) => spec.name);
        // Then - all unique
        expect(new Set(names).size).toBe(names.length);
    });

    test('marks every Hoverfly helper as non-builtin and inline (none are block helpers)', () => {
        // Then - all 52 are inline, builtin: false
        for (const spec of HOVERFLY_HELPERS) {
            expect(spec.builtin).toBeFalsy();
            expect(spec.block).toBeFalsy();
        }
    });

    test('contains isGreaterThan but NOT the short form isGreater (C3/D8)', () => {
        // Given - the comparison-helper names
        const names = HOVERFLY_HELPERS.map((spec) => spec.name);
        // Then - only the long form exists
        expect(names).toContain('isGreaterThan');
        expect(names).not.toContain('isGreater');
        expect(names).toContain('isLessThan');
        expect(names).not.toContain('isLess');
    });

    test('spot-checks arity for 10 helpers (incl. zero-arg, multi-arg, variadic)', () => {
        // Then - arities match the report 08 §1 signature table
        expect(byName(HOVERFLY_HELPERS, 'randomString')?.args).toHaveLength(0);
        expect(byName(HOVERFLY_HELPERS, 'randomStringLength')?.args).toHaveLength(1);
        expect(byName(HOVERFLY_HELPERS, 'now')?.args).toHaveLength(2);
        expect(byName(HOVERFLY_HELPERS, 'split')?.args).toHaveLength(2);
        expect(byName(HOVERFLY_HELPERS, 'replace')?.args).toHaveLength(3);
        expect(byName(HOVERFLY_HELPERS, 'substring')?.args).toHaveLength(3);
        expect(byName(HOVERFLY_HELPERS, 'isBetween')?.args).toHaveLength(3);
        expect(byName(HOVERFLY_HELPERS, 'csv')?.args).toHaveLength(4);
        expect(byName(HOVERFLY_HELPERS, 'csvDeleteRows')?.args).toHaveLength(4);
        expect(byName(HOVERFLY_HELPERS, 'journal')?.args).toHaveLength(5);
    });

    test('marks concat as variadic', () => {
        // Then - concat takes a variable number of args
        const concat = byName(HOVERFLY_HELPERS, 'concat');
        expect(concat?.variadic).toBeTruthy();
        expect(concat?.args).toHaveLength(0);
    });

    test("now's two args are both optional", () => {
        // Given - the now spec
        const now = byName(HOVERFLY_HELPERS, 'now');
        // Then - offset and format are optional
        expect(now?.args.every((arg) => arg.optional)).toBeTruthy();
    });

    test('multiply is subexpression-friendly (3 string args, format last)', () => {
        // Given - the multiply spec used inside (multiply (this.price) (this.qty) '')
        const multiply = byName(HOVERFLY_HELPERS, 'multiply');
        // Then - three string args
        expect(multiply?.args).toHaveLength(3);
        expect(multiply?.args.map((arg) => arg.type)).toStrictEqual(['string', 'string', 'string']);
    });

    test('typed-arg helpers expose int/float/bool/array arg types', () => {
        // Then - arity-coercion arg types from report 08 §1.1 are captured
        expect(byName(HOVERFLY_HELPERS, 'randomStringLength')?.args[0]?.type).toBe('int');
        expect(byName(HOVERFLY_HELPERS, 'randomFloatRange')?.args[0]?.type).toBe('float');
        expect(byName(HOVERFLY_HELPERS, 'csvDeleteRows')?.args[3]?.type).toBe('bool');
        expect(byName(HOVERFLY_HELPERS, 'sum')?.args[0]?.type).toBe('array');
    });

    test('every helper carries docs and an example', () => {
        // Then - hover + completion content is present
        for (const spec of HOVERFLY_HELPERS) {
            expect(spec.docs.length).toBeGreaterThan(0);
            expect(spec.example.length).toBeGreaterThan(0);
        }
    });
});

describe('rAYMOND_BUILTINS', () => {
    test('has exactly 8 built-ins, all marked builtin: true', () => {
        // Then - the 8 raymond built-ins
        expect(RAYMOND_BUILTINS).toHaveLength(8);
        for (const spec of RAYMOND_BUILTINS) {
            expect(spec.builtin).toBeTruthy();
        }
    });

    test('contains exactly if/unless/with/each/first/log/lookup/equal', () => {
        // Then - the documented set (incl. SpectoLabs-fork first/equal)
        expect(RAYMOND_BUILTINS.map((spec) => spec.name).toSorted()).toStrictEqual(
            ['each', 'equal', 'first', 'if', 'log', 'lookup', 'unless', 'with'].toSorted(),
        );
    });

    test('if/unless/with/each/first/equal are block helpers; log/lookup are inline', () => {
        // Then - block flags per report 08 §4
        expect(byName(RAYMOND_BUILTINS, 'if')?.block).toBeTruthy();
        expect(byName(RAYMOND_BUILTINS, 'each')?.block).toBeTruthy();
        expect(byName(RAYMOND_BUILTINS, 'first')?.block).toBeTruthy();
        expect(byName(RAYMOND_BUILTINS, 'equal')?.block).toBeTruthy();
        expect(byName(RAYMOND_BUILTINS, 'log')?.block).toBeFalsy();
        expect(byName(RAYMOND_BUILTINS, 'lookup')?.block).toBeFalsy();
    });

    test('equal takes 2 args; if takes 1', () => {
        // Then - arity per report 08 §4
        expect(byName(RAYMOND_BUILTINS, 'equal')?.args).toHaveLength(2);
        expect(byName(RAYMOND_BUILTINS, 'if')?.args).toHaveLength(1);
    });
});

describe('aLL_HELPERS', () => {
    test('is the 52 Hoverfly helpers plus the 8 built-ins, with no duplicate names', () => {
        // Then - 60 total, all unique
        expect(ALL_HELPERS).toHaveLength(60);
        const names = ALL_HELPERS.map((spec) => spec.name);
        expect(new Set(names).size).toBe(60);
    });
});

describe('vARIABLE_FUNCTION_NAMES', () => {
    test('is exactly the 52 Hoverfly helpers (built-ins not allowed in variables[].function)', () => {
        // Then - 52 names, none of them built-ins
        expect(VARIABLE_FUNCTION_NAMES).toHaveLength(52);
        expect(VARIABLE_FUNCTION_NAMES).not.toContain('if');
        expect(VARIABLE_FUNCTION_NAMES).not.toContain('each');
        expect(VARIABLE_FUNCTION_NAMES).toContain('now');
        expect(VARIABLE_FUNCTION_NAMES).toContain('requestBody');
    });
});

describe('nOW_OFFSET_UNITS', () => {
    test('lists the 10 documented units incl. both micro spellings, and NOT w', () => {
        // Then - units from parse_duration.go unitMap (report 08 §2)
        expect([...NOW_OFFSET_UNITS]).toStrictEqual([
            'ns',
            'us',
            'µs',
            'μs',
            'ms',
            's',
            'm',
            'h',
            'd',
            'y',
        ]);
        expect(NOW_OFFSET_UNITS).not.toContain('w');
    });

    test('includes both Unicode micro symbols (U+00B5 and U+03BC) as distinct entries', () => {
        // Then - the two spellings differ at the codepoint level
        // U+00B5 (micro sign) = 181; U+03BC (Greek small letter mu) = 956.
        expect('µs'.codePointAt(0)).toBe(181);
        expect('μs'.codePointAt(0)).toBe(956);
        expect(NOW_OFFSET_UNITS).toContain('µs');
        expect(NOW_OFFSET_UNITS).toContain('μs');
    });

    test('documents the epoch-is-milliseconds footgun', () => {
        // Then - the format note flags epoch as milliseconds
        expect(NOW_FORMAT_NOTES.formats.toLowerCase()).toContain('millisecond');
    });
});
