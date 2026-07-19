import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/e2e/script-quality.test.ts"],
    testTimeout: 120000,
    hookTimeout: 120000,
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
