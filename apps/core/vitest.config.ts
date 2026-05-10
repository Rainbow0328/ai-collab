import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@ai-collab/core": resolve(__dirname, "src/index.ts"),
      "@ai-collab/protocol": resolve(__dirname, "../../packages/protocol/src/index.ts"),
      "@ai-collab/store": resolve(__dirname, "../../packages/store/src/index.ts"),
      "@ai-collab/sdk": resolve(__dirname, "../../packages/sdk/src/index.ts"),
      "@ai-collab/shared": resolve(__dirname, "../../packages/shared/src/index.ts"),
    }
  },
  test: {
    include: ["src/**/*.test.ts"]
  }
});
