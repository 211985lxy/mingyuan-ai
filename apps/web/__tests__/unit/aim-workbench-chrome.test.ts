import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { FileText } from "lucide-react"
import { describe, expect, it, vi } from "vitest"

import { AimEvolutionSuggestions, AimLandingHero, AimProjectNotices, AimWorkbenchHeader } from "@/components/aim/aim-workbench-chrome"

const baseHeaderProps = {
  workflowStage: "content" as const,
  agentTitle: "内容生产官",
  AgentIcon: FileText,
  onReset: vi.fn(),
}

describe("AIM workbench chrome", () => {
  it("renders stages when progress is shown and has no project switcher", () => {
    const html = renderToStaticMarkup(createElement(AimWorkbenchHeader, {
      ...baseHeaderProps,
      showStageProgress: true,
    }))

    expect(html).toContain("定方向")
    expect(html).toContain("做内容")
    expect(html).toContain("发作品")
    expect(html).toContain("新任务")
    expect(html).not.toContain("快速出稿")
    expect(html).not.toContain("选择客户全案或快速出稿模式")
  })

  it("hides the four-stage stepper in the landing (empty) state", () => {
    const html = renderToStaticMarkup(createElement(AimWorkbenchHeader, {
      ...baseHeaderProps,
      showStageProgress: false,
    }))

    expect(html).not.toContain("定方向")
    expect(html).not.toContain("发作品")
    expect(html).toContain("内容生产官")
    expect(html).not.toContain("快速出稿")
  })

  it("renders the landing hub with five experts only — no workflow rail or composer", () => {
    const html = renderToStaticMarkup(createElement(AimLandingHero))

    expect(html).toContain("选一位专家，开始创作")
    expect(html).toContain("明远 AIM · 创作台")
    expect(html).toContain("商业诊断")
    expect(html).toContain("选题策划")
    expect(html).toContain("内容创作")
    expect(html).toContain("作品编辑")
    expect(html).toContain("数据复盘")
    expect(html).toContain("/aim?agent=content_producer")
    expect(html).toContain("/aim?agent=business_system_diagnosis")
    expect(html).toContain("/aim?agent=business_diagnosis")
    expect(html).toContain("/aim?agent=work_editor")
    expect(html).toContain("/aim?agent=content_retro")
    // 四步工作流、输入区、底部提示整块已去掉
    expect(html).not.toContain("定方向")
    expect(html).not.toContain("做内容")
    expect(html).not.toContain("发作品")
    expect(html).not.toContain("看结果")
    expect(html).not.toContain("选专家，按流程开工")
    expect(html).not.toContain("创作台 · 工作流总览")
    expect(html).not.toContain("或直接说需求")
    expect(html).not.toContain("内容目的在左下角")
    expect(html).not.toContain("我的项目")
    expect(html).not.toContain("stage=direction")
    // 隐藏专家不出现；落地页不再塞输入框
    expect(html).not.toContain("交货文案")
    expect(html).not.toContain("/aim?agent=content_review")
    expect(html).not.toContain("/aim?agent=free_copywriter")
    expect(html).not.toContain("今天想得到什么结果")
    expect(html).not.toContain("一键开始 · 选择内容目的")
  })

  it("renders project notices without persona progress", () => {
    const html = renderToStaticMarkup(
      AimProjectNotices({
        projectsCount: 0,
        selectedProjectId: "",
        projectEnabled: true,
        projectAccessError: null,
      }),
    )
    expect(html).toContain("还没有项目")
    expect(html).not.toContain("来时路信息收集")
  })

  it("does not advertise quick mode when project scope is disabled", () => {
    const html = renderToStaticMarkup(createElement(AimProjectNotices, {
      projectsCount: 2,
      selectedProjectId: "",
      projectEnabled: false,
    }))

    expect(html).not.toContain("快速出稿不会读取客户全案资料")
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
