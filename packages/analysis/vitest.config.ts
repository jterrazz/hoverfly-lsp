import { defineSpecConfig, unit } from '@jterrazz/test/vitest';

export default defineSpecConfig({
    // The corpus goldens and the fourslash-driven suites read `testdata/` two levels up and
    // spawn no process, but they run over the whole reference corpus, so the preset's 30s
    // default is trimmed rather than raised.
    test: { projects: [unit({ timeout: 20_000 })] },
});
