import { defineConfig } from "vitest/config"
import react from "@vitejs/plugin-react"
import path from "path"

/**
 * 组件交互测试配置（jsdom 环境）。
 *
 * 与 vitest.config.ts（node 环境，renderToStaticMarkup 静态渲染）分离：
 * 这里运行真实 DOM，支持 useEffect / 事件交互 / 状态更新断言，
 * 用于拦截 props 派生 state 过期、stale closure 等状态同步类 bug。
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    include: ["__tests__/components/**/*.test.tsx"],
    testTimeout: 10000,
    hookTimeout: 10000,
    setupFiles: ["./__tests__/components/setup.ts"],
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
