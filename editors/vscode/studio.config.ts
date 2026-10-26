import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    kind: 'library',
    platform: 'node',
    presets: [test()],
    typescript: {
        knip: {
            ignoreDependencies: {
                '@jterrazz/hoverfly-lsp':
                    'esbuild.config.mjs resolves the workspace server by name and copies its bin and bundle into the .vsix',
            },
        },
        roots: { syntaxes: 'the TextMate grammar the extension contributes for Hoverfly files' },
    },
});
