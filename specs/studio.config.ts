import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    platform: 'node',
    presets: [test()],
    typescript: {
        roots: {
            repository:
                'the repository suite: the schema files no member owns alone, read as files',
        },
    },
});
