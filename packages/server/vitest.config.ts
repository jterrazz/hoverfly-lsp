import { defineSpecConfig, unit } from '@jterrazz/test/vitest';

export default defineSpecConfig({
    // The integration test spawns the built binary over stdio; keep generous headroom.
    test: { projects: [unit({ timeout: 20_000 })] },
});
