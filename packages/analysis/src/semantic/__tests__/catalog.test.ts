import { describe, expect, test } from 'vitest';

import { formatMessage } from '../catalog.js';

describe('catalog', () => {
    test.each([
        {
            args: { name: 'exct' },
            expected: 'Unknown matcher "exct"',
            template: 'Unknown matcher "{name}"',
        },
        { args: {}, expected: 'hi {missing}', template: 'hi {missing}' },
        { args: { n: 700 }, expected: 'Status 700 is bad', template: 'Status {n} is bad' },
    ])(
        // Given - a message template and the arguments a rule hands it
        // Then - each slot filled with its argument as text, a slot with no argument left as written
        'formatMessage — $template',
        ({ args, expected, template }) => {
            expect(formatMessage(template, args)).toBe(expected);
        },
    );
});
