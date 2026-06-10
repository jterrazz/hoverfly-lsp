import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/test/**/*.test.ts", "editors/vscode/test/**/*.test.ts"],
    // The server integration test spawns the built bin; keep generous headroom.
    testTimeout: 20_000,
  },
});
