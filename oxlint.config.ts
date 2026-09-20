import { defineConfig, node } from '@jterrazz/typescript/oxlint';

export default defineConfig({
    extends: [node],
    // reason: testdata/ is the diagnostic corpus — deliberately malformed Hoverfly
    // JSON the profile cannot know about, and a linted fixture is a rewritten claim.
    ignorePatterns: ['testdata/**'],
    overrides: [
        {
            files: ['**/*.{test,spec}.{ts,tsx}', '**/specs/**/*.{ts,tsx}'],
            rules: {
                /*
                 * The profile leaves this rule on its default pattern, `.test.ts` alone, and
                 * @jterrazz/test 16 renamed every file under specs/ to `.spec.ts` (its ADR-006):
                 * as shipped the rule fails all thirteen integration specs with a rename that
                 * would undo the fork. Widening the pattern keeps the rule ON — a test file
                 * still has to wear one of the two sanctioned suffixes — rather than recording a
                 * debt that can never reach zero. The toolchain owes the same widening.
                 */
                'vitest/consistent-test-filename': [
                    'error',
                    {
                        allTestPattern: '.*\\.(spec|test)\\.[tj]sx?$',
                        pattern: '.*\\.(spec|test)\\.[tj]sx?$',
                    },
                ],
            },
        },
    ],
});
