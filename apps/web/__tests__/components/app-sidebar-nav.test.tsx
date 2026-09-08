/**
 * AppSidebar 导航收敛测试：主组条目、工具箱默认折叠与展开、新建任务「进行中」徽标。
 */
import { describe, expect, it, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { AppSidebar } from "@/components/layout/app-sidebar"
import { SidebarProvider } from "@/components/ui/sidebar"
import { BrandingProvider } from "@/components/providers/branding-provider"
import { ThemeProvider } from "@/components/providers/theme-provider"
import { useAimWorkspaceStore } from "@/lib/aim-workspace-store"
import type { AimGeneration } from "@/lib/api/client"

vi.mock("next/navigation", () => ({
  usePathname: () => "/aim",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

function fakeGeneration(overrides: Partial<AimGeneration>): AimGeneration {
  return {
    id: "g1",
    rawInput: "输入",
    videoScript: null,
    wechatArticle: null,
    momentsPost: null,
    communityMessage: null,
    shootingBrief: null,
    rawCopy: null,
    formatsRequested: [],
    knowledgeUsed: [],
    createdAt: "2026-09-07T00:00:00Z",
    ...overrides,
  } as AimGeneration
}

function renderSidebar() {
  return render(
    <SidebarProvider>
      <ThemeProvider>
        <BrandingProvider branding={{ name: "明远 AIM" } as never}>
          <AppSidebar />
        </BrandingProvider>
      </ThemeProvider>
    </SidebarProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  useAimWorkspaceStore.setState({
    history: [
      fakeGeneration({ id: "g-editing", workflowStatus: "editing" }),
      fakeGeneration({ id: "g-published", workflowStatus: "published" }),
      fakeGeneration({ id: "g-archived", workflowStatus: "archived" }),
    ],
    fetchHistory: vi.fn().mockResolvedValue(undefined),
  })
})

describe("AppSidebar 导航收敛", () => {
  it("主组展示创作台/市场洞察/数据看板/我的项目", () => {
    renderSidebar()

    expect(screen.getByText("创作台")).toBeTruthy()
    expect(screen.getByText("市场洞察")).toBeTruthy()
    expect(screen.getByText("数据看板")).toBeTruthy()
    expect(screen.getByText("我的项目")).toBeTruthy()
  })

  it("工具箱默认折叠：条目不可见，点击后展开且 aria-expanded=true", async () => {
    const user = userEvent.setup()
    renderSidebar()

    expect(screen.queryByText("爆款拆解")).toBeNull()
    expect(screen.queryByText("极简模式")).toBeNull()

    const toggle = screen.getByRole("button", { name: /工具箱/ })
    expect(toggle.getAttribute("aria-expanded")).toBe("false")

    await user.click(toggle)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(screen.getByText("爆款拆解")).toBeTruthy()
    expect(screen.getByText("极简模式")).toBeTruthy()
    expect(screen.getByText("语音工坊")).toBeTruthy()
    expect(screen.getByText("我的知识库")).toBeTruthy()
  })

  it("新建任务徽标按非终态任务计数（published/archived 不计）", () => {
    renderSidebar()

    const badge = screen.getByTitle("1 个任务进行中")
    expect(badge.textContent).toBe("1")
  })

  it("组织协同区块暂时隐藏（SHOW_ORG_NAV_SECTION=false）", () => {
    // 契约：有意恢复（置 true）时本用例会失败——届时请同步改本用例与开关。
    renderSidebar()
    expect(screen.queryByText("组织协同")).toBeNull()
  })

  it("无进行中任务时不渲染徽标", () => {
    useAimWorkspaceStore.setState({
      history: [fakeGeneration({ id: "g-done", workflowStatus: "published" })],
    })
    renderSidebar()

    expect(screen.queryByTitle(/个任务进行中/)).toBeNull()
  })
})
