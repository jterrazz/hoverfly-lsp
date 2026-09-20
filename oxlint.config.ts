import { testing } from '@jterrazz/test/oxlint';
import { compose, node } from '@jterrazz/typescript/oxlint';

export default compose(node, testing, {
    // reason: testdata/ is the diagnostic corpus — deliberately malformed Hoverfly
    // JSON the profile cannot know about, and a linted fixture is a rewritten claim.
    ignorePatterns: ['testdata/**'],
});
