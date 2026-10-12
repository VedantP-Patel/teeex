import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/unit/**/*.test.ts', 'tests/fuzz/**/*.test.ts'],
    /**
     * Node, not jsdom. Everything under test here is deliberately free of DOM
     * dependencies — log parsing, SyncTeX, project mapping, source
     * transformations — so it runs against the same primitives the browser
     * provides (Blob, Response, DecompressionStream) without a DOM shim in the
     * way. Rendering fidelity is verified in a real browser under
     * tests/e2e instead, where it means something.
     */
    environment: 'node',
    globals: false,
    reporters: ['default'],
    coverage: {
      include: ['src/services/**'],
      // Coverage is a floor, not the goal: the support matrix tracks which
      // syntax constructs are actually verified end to end.
      reporter: ['text', 'json-summary'],
    },
  },
});
