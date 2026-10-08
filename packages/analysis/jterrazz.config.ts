import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    kind: 'library',
    platform: 'node',
    presets: [test()],
    typescript: {
        knip: {
            entry: {
                'scripts/generate-schema.mjs':
                    'run by hand after an edit of hoverfly.schema.json, to regenerate its TypeScript module',
            },
        },
        roots: { scripts: 'the generator that embeds hoverfly.schema.json as a TypeScript module' },
    },
});
