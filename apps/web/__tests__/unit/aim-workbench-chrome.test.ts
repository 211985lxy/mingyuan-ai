import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FileText } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AimEvolutionSuggestions, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"

describe("AIM workbench chrome", () => {
  it("renders stages and the active project mode", () => {
    const html = renderToStaticMarkup(createElement(AimWorkbenchHeader, {
      workflowStage: "content",
      agentTitle: "内容生产官",
      AgentIcon: FileText,
      projectEnabled: true,
      projects: [{
        id: "project-1", name: "测试 IP", companyName: null, industry: null,
        targetCustomer: null, offer: null, deliveryGoal: null, status: "active",
        notes: null, createdAt: "2026-07-17T00:00:00.000Z", updatedAt: "2026-07-17T00:00:00.000Z",
      }],
      selectedProjectId: "project-1",
      canEvolve: true,
      isEvolving: false,
      onStageChange: vi.fn(),
      onProjectScopeChange: vi.fn(),
      onEvolve: vi.fn(),
      onReset: vi.fn(),
    }))

    expect(html).toContain("定方向")
    expect(html).toContain("做内容")
    expect(html).toContain("测试 IP")
    expect(html).toContain("新任务")
  })

  it("renders project and persona notices", () => {
    const emptyHtml = renderToStaticMarkup(createElement(AimProjectNotices, {
      projectsCount: 0,
      selectedProjectId: "",
      projectEnabled: true,
      personaProgress: null,
    }))
    const progressHtml = renderToStaticMarkup(createElement(AimProjectNotices, {
      projectsCount: 1,
      selectedProjectId: "project-1",
      projectEnabled: true,
      personaProgress: 60,
    }))

    expect(emptyHtml).toContain("先创建一个")
    expect(progressHtml).toContain("来时路信息收集")
    expect(progressHtml).toContain("60%")
  })

  it("describes quick mode without claiming project knowledge is loaded", () => {
    const html = renderToStaticMarkup(createElement(AimProjectNotices, {
      projectsCount: 2,
      selectedProjectId: "",
      projectEnabled: false,
      personaProgress: null,
    }))

    expect(html).toContain("快速出稿不会读取客户全案资料")
    expect(html).not.toContain("正在加载")
  })

  it("renders evolution suggestions", () => {
    const html = renderToStaticMarkup(createElement(AimEvolutionSuggestions, {
      suggestions: [{ title: "语气偏好", content: "多用短句", category: "user_insight", tags: ["asset_role:preference"] }],
      onDismiss: vi.fn(),
      onSave: vi.fn(),
    }))

    expect(html).toContain("语气偏好")
    expect(html).toContain("写入知识库")
  })
})
