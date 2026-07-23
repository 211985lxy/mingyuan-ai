import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it, vi } from "vitest"

import { AimPlanQuestionCard } from "@/components/aim/aim-plan-question-card"
import { AimPlanStatusCard } from "@/components/aim/aim-plan-status-card"

describe("计划模式状态界面", () => {
  it("知识不足时只展示 D 自定义入口", () => {
    const html = renderToStaticMarkup(createElement(AimPlanQuestionCard, {
      question: {
        id: "q-core",
        dimension: "core_message",
        prompt: "这条内容最核心要传达的信息是什么？",
        options: [],
        hasCustomOption: true,
        targetField: "coreMessage",
      },
      questionNumber: 1,
      totalQuestions: 3,
      loading: false,
      canGoBack: false,
      onSelectOption: vi.fn(),
      onSelectCustom: vi.fn(),
      onGoBack: vi.fn(),
    }))

    expect(html).toContain("档案暂无可靠选项，我来补充")
    expect(html).toContain(">D<")
    expect(html).not.toContain(">A<")
  })

  it("首轮读取时展示可退出的加载状态", () => {
    const html = renderToStaticMarkup(createElement(AimPlanStatusCard, {
      loading: true,
      onRetry: vi.fn(),
      onAbandon: vi.fn(),
    }))

    expect(html).toContain("正在结合本次需求读取项目档案")
    expect(html).toContain("退出计划")
  })

  it("读取失败时展示错误、重试和退出入口", () => {
    const html = renderToStaticMarkup(createElement(AimPlanStatusCard, {
      loading: false,
      error: "知识服务暂时不可用",
      onRetry: vi.fn(),
      onAbandon: vi.fn(),
    }))

    expect(html).toContain("知识服务暂时不可用")
    expect(html).toContain("重试")
    expect(html).toContain("退出计划")
  })
})
