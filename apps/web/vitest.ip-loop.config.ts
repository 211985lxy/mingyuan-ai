import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  test: {
    environment: "node",
    include: ["__tests__/e2e/aim-ip-loop-*.test.ts"],
    sequence: { concurrent: false },
    fileParallelism: false,
  },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
})
