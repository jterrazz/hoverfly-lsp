import { test } from '@jterrazz/test/config';
import { defineConfig } from '@jterrazz/typescript/config';

export default defineConfig({
    platform: 'node',
    presets: [test()],
    typescript: {
        roots: {
            repository:
                'the repository suite: the files no member owns alone, the schemas and the editor launchers, read as files',
        },
    },
});
