import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["__tests__/unit/**/*.test.ts", "__tests__/eval/**/*.test.ts"],
    exclude: ["__tests__/e2e/**"],
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ["./__tests__/unit/setup-env.ts"],
    sequence: { concurrent: false },
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@/generated/prisma/client": path.resolve(
        __dirname,
        "src/generated/prisma/client.ts"
      ),
      "@": path.resolve(__dirname, "src"),
    },
  },
})
