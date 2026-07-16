import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/e2e/**/*.test.ts"],
    testTimeout: 30000,
    hookTimeout: 30000,
    globalSetup: ["./__tests__/e2e/global-lifecycle.ts"],
    setupFiles: ["./__tests__/e2e/global-setup.ts"],
    sequence: { concurrent: false },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@/generated/prisma/client": path.resolve(
        __dirname,
        "src/generated/prisma/client.ts",
      ),
      "@": path.resolve(__dirname, "src"),
    },
  },
})
