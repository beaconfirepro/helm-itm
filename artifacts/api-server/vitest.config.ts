import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    setupFiles: ["./test/setup.ts"],
    include: ["test/**/*.test.ts"],
    // Each test file runs in its own isolated module graph, so every file
    // gets (and tears down) its own pg pool — see test/setup.ts.
    isolate: true,
  },
});
