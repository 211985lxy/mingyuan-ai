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
      projectName: "测试 IP",
      canEvolve: true,
      isEvolving: false,
      onStageChange: vi.fn(),
      onToggleProject: vi.fn(),
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
      personaProgress: null,
    }))
    const progressHtml = renderToStaticMarkup(createElement(AimProjectNotices, {
      projectsCount: 1,
      selectedProjectId: "project-1",
      personaProgress: 60,
    }))

    expect(emptyHtml).toContain("先创建一个")
    expect(progressHtml).toContain("来时路信息收集")
    expect(progressHtml).toContain("60%")
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
