import { describe, expect, test } from 'vitest';

import {
    isPostServeActionPosition,
    isRequiresStateKeyPosition,
    isSchemaVersionPosition,
    isTransitionsStateKeyPosition,
    matchMatcherNamePosition,
} from './paths.js';

describe('matchMatcherNamePosition', () => {
    test('recognises a top-level request matcher field (hover form, matcher key present)', () => {
        // Given - the hover location path of a matcher name value on request.path
        const path = ['data', 'pairs', 0, 'request', 'path', 0, 'matcher'];
        // Then - it is a matcher position on a non-body field
        expect(matchMatcherNamePosition(path, { requireMatcherKey: true })).toStrictEqual({
            field: 'path',
            isBody: false,
        });
    });

    test('marks request.body as the only body matcher field', () => {
        const path = ['data', 'pairs', 1, 'request', 'body', 0, 'matcher'];
        expect(matchMatcherNamePosition(path, { requireMatcherKey: true })?.isBody).toBeTruthy();
    });

    test('recognises a header matcher field (nested map)', () => {
        const path = ['data', 'pairs', 0, 'request', 'headers', 'Accept', 0, 'matcher'];
        expect(matchMatcherNamePosition(path, { requireMatcherKey: true })).toStrictEqual({
            field: 'Accept',
            isBody: false,
        });
    });

    test('recognises the value-completion form (matcher key optional)', () => {
        // Given - the value-completion location: the matcher OBJECT path (no trailing key)
        const path = ['data', 'pairs', 0, 'request', 'path', 0, 'matcher'];
        // Then - works when requireMatcherKey is false too
        expect(matchMatcherNamePosition(path, { requireMatcherKey: false })?.field).toBe('path');
    });

    test('rejects a non-matcher path', () => {
        const path = ['data', 'pairs', 0, 'response', 'body'];
        expect(matchMatcherNamePosition(path, { requireMatcherKey: false })).toBeUndefined();
    });
});

describe('position recognisers', () => {
    test('recognises meta.schemaVersion (hover and value-completion)', () => {
        expect(isSchemaVersionPosition(['meta', 'schemaVersion'])).toBeTruthy();
        expect(isSchemaVersionPosition(['meta'], { propertyKey: 'schemaVersion' })).toBeTruthy();
        expect(isSchemaVersionPosition(['data'], { propertyKey: 'schemaVersion' })).toBeFalsy();
    });

    test('recognises requiresState / transitionsState key positions', () => {
        expect(
            isRequiresStateKeyPosition(['data', 'pairs', 0, 'request', 'requiresState']),
        ).toBeTruthy();
        expect(
            isTransitionsStateKeyPosition(['data', 'pairs', 0, 'response', 'transitionsState']),
        ).toBeTruthy();
        // RequiresState lives on request; transitionsState on response — they don't cross over.
        expect(
            isRequiresStateKeyPosition(['data', 'pairs', 0, 'response', 'transitionsState']),
        ).toBeFalsy();
    });

    test('recognises response.postServeAction (hover and value-completion)', () => {
        expect(
            isPostServeActionPosition(['data', 'pairs', 0, 'response', 'postServeAction']),
        ).toBeTruthy();
        expect(
            isPostServeActionPosition(['data', 'pairs', 0, 'response'], {
                propertyKey: 'postServeAction',
            }),
        ).toBeTruthy();
    });
});
