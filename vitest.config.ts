import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: [".witboost/mcp-server/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [".witboost/mcp-server/src/**/*.ts"],
      exclude: [".witboost/mcp-server/src/server/index.ts", ".witboost/mcp-server/src/setup/index.ts"],
    },
  },
  resolve: {
    alias: {
      "@": "./.witboost/mcp-server/src",
    },
  },
});
