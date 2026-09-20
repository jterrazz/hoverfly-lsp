import { defineSpecConfig, unit } from '@jterrazz/test/vitest';

export default defineSpecConfig({
    test: {
        // The integration test spawns the built binary over stdio; keep generous headroom.
        projects: [unit()],
        testTimeout: 20_000,
    },
});
