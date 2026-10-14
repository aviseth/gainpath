import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Runs the demo-data generator (not part of the unit test suite).
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("../../src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["scripts/demo/*.gen.ts"],
    setupFiles: ["fake-indexeddb/auto"],
    testTimeout: 120_000,
  },
});
