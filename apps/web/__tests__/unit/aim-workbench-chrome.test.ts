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

  it("renders the landing hero with composer and points to the + menu for purposes", () => {
    const html = renderToStaticMarkup(createElement(
      AimLandingHero,
      {
        intro: "专家简介示例",
      },
      createElement("div", null, "COMPOSER_MARKER"),
    ))

    expect(html).toContain("今天想得到什么结果")
    expect(html).toContain("内容目的在左下角")
    expect(html).toContain("COMPOSER_MARKER")
    expect(html).toContain("专家简介示例")
    // 落地页不再铺「一键开始」三选一
    expect(html).not.toContain("一键开始 · 选择内容目的")
    expect(html).not.toContain("我要搞流量")
    expect(html).not.toContain("我要获客")
    expect(html).not.toContain("我要讲故事")
    expect(html).not.toContain("流量漏斗")
    expect(html).not.toContain("线索获客")
    expect(html).not.toContain("通用故事")
    expect(html).not.toContain("停留+收藏+复看优先")
    expect(html).not.toContain("漏斗获客与故事口播")
    expect(html).not.toContain("完播优先")
    expect(html).not.toContain("sm:grid-cols-2")
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
