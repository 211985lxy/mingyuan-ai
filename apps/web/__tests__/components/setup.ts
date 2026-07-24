/**
 * 组件交互测试全局 setup（jsdom 环境）。
 *
 * - 注册 @testing-library/jest-dom 断言
 * - 补齐 jsdom 缺失的浏览器 API（matchMedia / IntersectionObserver / ResizeObserver / scrollTo）
 * - mock sonner toast，避免真实渲染 Toaster，同时可断言提示调用
 */
import "@testing-library/jest-dom/vitest"
import { vi, afterEach } from "vitest"
import { cleanup } from "@testing-library/react"

// 每个测试后自动卸载组件，避免相互污染
afterEach(() => {
  cleanup()
})

// ---- jsdom 缺失的浏览器 API ----
if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }

  if (!("IntersectionObserver" in window)) {
    class MockIntersectionObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return []
      }
    }
    Object.defineProperty(window, "IntersectionObserver", {
      writable: true,
      value: MockIntersectionObserver,
    })
  }

  if (!("ResizeObserver" in window)) {
    class MockResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    Object.defineProperty(window, "ResizeObserver", {
      writable: true,
      value: MockResizeObserver,
    })
  }

  if (!window.scrollTo) {
    Object.defineProperty(window, "scrollTo", {
      writable: true,
      value: () => {},
    })
  }
  if (!Element.prototype.scrollIntoView) {
    Element.prototype.scrollIntoView = () => {}
  }
}

// ---- mock sonner toast ----
// 组件内直接 import { toast } from "sonner"，这里整体 mock 掉，
// 既避免 jsdom 下渲染 Toaster 的副作用，也便于断言提示是否被触发。
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
    warning: vi.fn(),
    loading: vi.fn(),
    promise: vi.fn(),
    dismiss: vi.fn(),
  }),
  Toaster: () => null,
}))
