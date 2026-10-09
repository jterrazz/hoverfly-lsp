import { describe, expect, test } from 'vitest';

import { isBalanced } from '../balance.js';

describe('isBalanced', () => {
    test.each([
        { balanced: true, text: '{range .items[*]}{.x}{end}' },
        { balanced: true, text: '$["("]' },
        { balanced: true, text: "$['(']" },
        { balanced: false, text: "$.a'b" },
        { balanced: false, text: '$.a)' },
        { balanced: true, text: '$.a(b){c}' },
        { balanced: false, text: '$.a{b' },
        { balanced: true, text: '$.a[0]' },
        { balanced: false, text: '$.a[0' },
        { balanced: false, text: '$.a(]' },
    ])(
        // Given - $text
        // Then - balanced when every bracket closes in order and every quote closes, a quoted bracket being text
        'isBalanced — $text: $balanced',
        ({ balanced, text }) => {
            expect(isBalanced(text)).toBe(balanced);
        },
    );
});
