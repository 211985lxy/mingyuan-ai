/**
 * 侧栏账户菜单 · 八境主题切换测试：
 * 明暗各自记忆一境（data-brand-theme）、持久化到 localStorage、
 * THEME_BOOT_SCRIPT 首屏脚本与 Provider 判定逻辑一致。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { fireEvent, render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { SidebarAccountMenu } from "@/components/layout/sidebar-account-menu"
import {
  ThemeProvider,
  THEME_BOOT_SCRIPT,
} from "@/components/providers/theme-provider"
import { useAuthStore } from "@/lib/store"

// jsdom 无 PointerEvent，Radix DropdownMenu 依赖它做指针判定
if (typeof window !== "undefined" && !window.PointerEvent) {
  class MockPointerEvent extends MouseEvent {
    pointerId: number
    pointerType: string
    constructor(type: string, params: PointerEventInit = {}) {
      super(type, params)
      this.pointerId = params.pointerId ?? 1
      this.pointerType = params.pointerType ?? "mouse"
    }
  }
  // @ts-expect-error 测试环境补齐
  window.PointerEvent = MockPointerEvent
}

vi.mock("next/navigation", () => ({
  usePathname: () => "/aim",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function renderMenu() {
  return render(
    <ThemeProvider>
      <SidebarAccountMenu active={false} onNavigate={() => {}} />
    </ThemeProvider>,
  )
}

function runBootScript() {
  // eslint-disable-next-line no-new-func
  new Function(THEME_BOOT_SCRIPT)()
}

beforeEach(() => {
  window.localStorage.clear()
  document.documentElement.removeAttribute("data-brand-theme")
  document.documentElement.classList.remove("dark")
  useAuthStore.setState({ user: { email: "xiaowei@mingyuan.ai" } as never })
})

describe("SidebarAccountMenu 八境主题切换", () => {
  it("亮色下打开主题境子菜单，列出四境并应用月白青花", async () => {
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByText("xiaowei@mingyuan.ai"))
    const paletteTrigger = await screen.findByText("主题境")
    await user.hover(paletteTrigger)

    expect(await screen.findByText("默认 · 暖玉玄黄")).toBeInTheDocument()
    expect(screen.getByText("月白青花")).toBeInTheDocument()
    expect(screen.getByText("素宣点朱")).toBeInTheDocument()
    expect(screen.getByText("松花竹青")).toBeInTheDocument()
    // 亮色子菜单不出现暗色境
    expect(screen.queryByText("玄水涵朱")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("月白青花"))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-brand-theme", "qinghua")
    })
    expect(localStorage.getItem("mingyuan-brand-theme-light")).toBe("qinghua")
    expect(localStorage.getItem("mingyuan-brand-theme-dark")).toBeNull()
  })

  it("暗色下列出暗色四境，应用玄水涵朱并写暗色 key", async () => {
    localStorage.setItem("mingyuan-color-mode", "dark")
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByText("xiaowei@mingyuan.ai"))
    await user.hover(await screen.findByText("主题境"))

    expect(await screen.findByText("默认 · 玄曜赤金")).toBeInTheDocument()
    expect(screen.getByText("松烟入墨")).toBeInTheDocument()
    expect(screen.queryByText("素宣点朱")).not.toBeInTheDocument()

    fireEvent.click(screen.getByText("玄水涵朱"))
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-brand-theme", "xuanshui")
    })
    expect(localStorage.getItem("mingyuan-brand-theme-dark")).toBe("xuanshui")
    expect(document.documentElement.classList.contains("dark")).toBe(true)
  })

  it("切回默认境清除 data 属性，回落 globals.css 默认主题", async () => {
    localStorage.setItem("mingyuan-brand-theme-light", "qinghua")
    const user = userEvent.setup()
    renderMenu()

    await user.click(screen.getByText("xiaowei@mingyuan.ai"))
    await user.hover(await screen.findByText("主题境"))
    fireEvent.click(await screen.findByText("默认 · 暖玉玄黄"))

    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute("data-brand-theme")
    })
    expect(localStorage.getItem("mingyuan-brand-theme-light")).toBe("")
  })
})

describe("THEME_BOOT_SCRIPT 首屏脚本", () => {
  it("暗色偏好 + 暗境记忆：加 dark 类并设对应 data 属性", () => {
    localStorage.setItem("mingyuan-color-mode", "dark")
    localStorage.setItem("mingyuan-brand-theme-dark", "cangdai")

    runBootScript()

    expect(document.documentElement.classList.contains("dark")).toBe(true)
    expect(document.documentElement).toHaveAttribute("data-brand-theme", "cangdai")
  })

  it("明暗各自记忆，按解析后的模式取对应境", () => {
    localStorage.setItem("mingyuan-color-mode", "light")
    localStorage.setItem("mingyuan-brand-theme-light", "suxuan")
    localStorage.setItem("mingyuan-brand-theme-dark", "xuanshui")

    runBootScript()

    expect(document.documentElement.classList.contains("dark")).toBe(false)
    expect(document.documentElement).toHaveAttribute("data-brand-theme", "suxuan")
  })

  it("无记忆或白名单外的值：不设 data 属性，回落默认境", () => {
    localStorage.setItem("mingyuan-brand-theme-light", "not-a-theme")
    runBootScript()
    expect(document.documentElement).not.toHaveAttribute("data-brand-theme")

    localStorage.removeItem("mingyuan-brand-theme-light")
    runBootScript()
    expect(document.documentElement).not.toHaveAttribute("data-brand-theme")
  })
})
