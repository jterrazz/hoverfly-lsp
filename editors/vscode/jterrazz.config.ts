import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    kind: 'library',
    platform: 'node',
    presets: [test()],
    typescript: {
        roots: { syntaxes: 'the TextMate grammar the extension contributes for Hoverfly files' },
    },
});
