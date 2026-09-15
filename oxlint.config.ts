import { defineConfig, node } from '@jterrazz/typescript/oxlint';

export default defineConfig({
    extends: [node],
    // reason: testdata/ is the diagnostic corpus — deliberately malformed Hoverfly
    // JSON the profile cannot know about, and a linted fixture is a rewritten claim.
    ignorePatterns: ['testdata/**'],
});
