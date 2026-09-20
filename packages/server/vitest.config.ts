import { defineSpecConfig, integration, unit } from '@jterrazz/test/vitest';

export default defineSpecConfig({
    // The integration spec spawns the built binary over stdio; keep generous headroom.
    test: { projects: [unit({ timeout: 20_000 }), integration({ timeout: 20_000 })] },
});
