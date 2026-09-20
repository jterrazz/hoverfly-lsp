import { defineSpecConfig, unit } from '@jterrazz/test/vitest';

export default defineSpecConfig({
    test: {
        // The corpus goldens and the fourslash-driven suites read `testdata/` two levels up and
        // spawn no process, but they are slower than a pure unit — the server integration test's
        // 20s headroom is this package's own too, kept for the same reason (see server config).
        projects: [unit()],
        testTimeout: 20_000,
    },
});
