import { describe, expect, test } from 'vitest';

import { hasTemplateSyntax } from '../../src/template/index.js';

describe('hasTemplateSyntax', () => {
    test('detects a mustache opener', () => {
        // Then - any `{{` counts
        expect(hasTemplateSyntax('hello {{name}}')).toBeTruthy();
        expect(hasTemplateSyntax('{{#each xs}}{{/each}}')).toBeTruthy();
        expect(hasTemplateSyntax('{{{unescaped}}}')).toBeTruthy();
    });

    test('returns false for plain text and single braces', () => {
        // Then - no `{{` => no template syntax
        expect(hasTemplateSyntax('plain body')).toBeFalsy();
        expect(hasTemplateSyntax('{ not a mustache }')).toBeFalsy();
        expect(hasTemplateSyntax('')).toBeFalsy();
        expect(hasTemplateSyntax('{"json":"object"}')).toBeFalsy();
    });
});
