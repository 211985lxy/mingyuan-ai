import { describe, expect, it } from "vitest"

import {
  buildCompletePatch,
  buildFailPatch,
  buildReviewPatch,
  buildRetryPatch,
  buildStartPatch,
  canTransition,
  parseFeishuWorkItem,
  transitionWorkItem,
  WORK_ITEM_STATES,
  type WorkItemStatus,
} from "@/lib/aim-feishu-work-item"

// 飞书经营事项领域模块：不依赖 UI、数据库或真实飞书调用。
// 本文件只覆盖状态机、字段解析和可写 patch 构造，与 WP-2 验收一一对应。

function fields(obj: Record<string, unknown>): Record<string, unknown> {
  return obj
}

describe("parseFeishuWorkItem", () => {
  it("解析最小合法记录的字段", () => {
    const parsed = parseFeishuWorkItem(
      fields({
        状态: "待处理",
        工作流: "销售诊断",
        AIM项目ID: "proj_001",
        输入内容: "客户提到预算紧张，希望先看方案",
      }),
    )

    expect(parsed.status).toBe("待处理")
    expect(parsed.workflow).toBe("销售诊断")
    expect(parsed.aimProjectId).toBe("proj_001")
    expect(parsed.inputContent).toBe("客户提到预算紧张，希望先看方案")
    expect(parsed.aimResultId).toBe("")
    expect(parsed.resultSummary).toBe("")
    expect(parsed.resultLink).toBe("")
    expect(parsed.errorMessage).toBe("")
  })

  it("把多行文本数组字段拍平为字符串（对齐 lark-base-tool 的文本字段形态）", () => {
    // 飞书多行文本常以 [{ text }] 数组返回，这里只取其字符串拼接，不伪造结构。
    const parsed = parseFeishuWorkItem(
      fields({
        状态: "处理中",
        输入内容: [
          { type: "text", text: "会议纪要" },
          { type: "text", text: "客户希望降低首期预算" },
        ],
      }),
    )

    expect(parsed.status).toBe("处理中")
    expect(parsed.inputContent).toContain("会议纪要")
    expect(parsed.inputContent).toContain("客户希望降低首期预算")
  })

  it("解析结果链接（超链接字段）", () => {
    const parsed = parseFeishuWorkItem(
      fields({
        状态: "待人工审核",
        结果链接: { link: "https://aim.example.com/run/123", text: "查看诊断" },
      }),
    )

    expect(parsed.status).toBe("待人工审核")
    expect(parsed.resultLink).toBe("https://aim.example.com/run/123")
  })

  it("缺失字段时使用空字符串而非伪造可执行状态", () => {
    const parsed = parseFeishuWorkItem(fields({}))

    expect(parsed.status).toBe("")
    expect(parsed.workflow).toBe("")
    expect(parsed.aimProjectId).toBe("")
    expect(parsed.inputContent).toBe("")
    expect(parsed.aimResultId).toBe("")
    expect(parsed.resultSummary).toBe("")
    expect(parsed.resultLink).toBe("")
    expect(parsed.errorMessage).toBe("")
  })

  it("状态字段为未知值时返回空值并暴露原始值，不伪造可执行状态", () => {
    const parsed = parseFeishuWorkItem(fields({ 状态: "已归档" }))

    expect(parsed.status).toBe("")
    expect(parsed.rawStatus).toBe("已归档")
  })

  it("工作流字段为未知值时清空并暴露原始值", () => {
    const parsed = parseFeishuWorkItem(fields({ 工作流: "未知工作流" }))

    expect(parsed.workflow).toBe("")
    expect(parsed.rawWorkflow).toBe("未知工作流")
  })

  it("状态字段为错误类型（数字）时不被静默伪造为合法状态", () => {
    const parsed = parseFeishuWorkItem(fields({ 状态: 123 }))

    expect(parsed.status).toBe("")
    expect(parsed.rawStatus).toBe("123")
  })
})

describe("canTransition", () => {
  it("允许待处理开始处理", () => {
    expect(canTransition("待处理", "处理中")).toBe(true)
  })

  it("允许处理中提交审核", () => {
    expect(canTransition("处理中", "待人工审核")).toBe(true)
  })

  it("允许处理中失败", () => {
    expect(canTransition("处理中", "失败")).toBe(true)
  })

  it("允许待人工审核完成", () => {
    expect(canTransition("待人工审核", "已完成")).toBe(true)
  })

  it("允许待人工审核退回处理中（退回修改）", () => {
    expect(canTransition("待人工审核", "处理中")).toBe(true)
  })

  it("允许失败重试回待处理", () => {
    expect(canTransition("失败", "待处理")).toBe(true)
  })

  it("拒绝已完成继续跳转（终态）", () => {
    expect(canTransition("已完成", "待处理")).toBe(false)
    expect(canTransition("已完成", "处理中")).toBe(false)
    expect(canTransition("已完成", "失败")).toBe(false)
  })

  it("拒绝跨过处理中的非法跳转", () => {
    expect(canTransition("待处理", "已完成")).toBe(false)
    expect(canTransition("待处理", "待人工审核")).toBe(false)
    expect(canTransition("待处理", "失败")).toBe(false)
  })

  it("拒绝从失败直接到已完成", () => {
    expect(canTransition("失败", "已完成")).toBe(false)
  })
})

describe("transitionWorkItem", () => {
  it("返回合法转换后的新状态", () => {
    const result = transitionWorkItem({ status: "待处理" }, "处理中")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe("处理中")
      expect(result.idempotent).toBe(false)
    }
  })

  it("相同状态转换视为幂等，不报错", () => {
    const result = transitionWorkItem({ status: "处理中" }, "处理中")

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.status).toBe("处理中")
      expect(result.idempotent).toBe(true)
    }
  })

  it("非法跳转返回失败结果，并保留可行动错误信息", () => {
    const result = transitionWorkItem({ status: "待处理" }, "已完成")

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain("待处理")
      expect(result.error).toContain("已完成")
    }
  })

  it("终态已完成无法再次跳转", () => {
    const result = transitionWorkItem({ status: "已完成" }, "失败")

    expect(result.ok).toBe(false)
  })
})

describe("buildStartPatch", () => {
  it("只产出可写的开始处理字段，设置处理中并刷新最后处理时间", () => {
    const patch = buildStartPatch()

    expect(patch["状态"]).toBe("处理中")
    // 最后处理时间应为可写的日期时间字段，而非公式或系统字段。
    expect(typeof patch["最后处理时间"]).toBe("number")
    expect(patch).not.toHaveProperty("AIM结果ID")
    expect(patch).not.toHaveProperty("结果摘要")
  })
})

describe("buildReviewPatch", () => {
  it("产出待人工审核状态和结果摘要/结果链接/结果ID", () => {
    const patch = buildReviewPatch({
      aimResultId: "gen_999",
      resultSummary: "已完成客户诊断，预算与阶段已澄清。",
      resultLink: "https://aim.example.com/run/999",
    })

    expect(patch["状态"]).toBe("待人工审核")
    expect(patch["AIM结果ID"]).toBe("gen_999")
    expect(patch["结果摘要"]).toBe("已完成客户诊断，预算与阶段已澄清。")
    expect(patch["结果链接"]).toBe("https://aim.example.com/run/999")
    expect(typeof patch["最后处理时间"]).toBe("number")
  })

  it("拒绝缺少结果ID的审核提交", () => {
    expect(() =>
      buildReviewPatch({ aimResultId: "", resultSummary: "缺结果", resultLink: "" }),
    ).toThrow()
  })
})

describe("buildCompletePatch", () => {
  it("设置已完成并清空旧错误信息", () => {
    const patch = buildCompletePatch({
      aimResultId: "gen_001",
      resultSummary: "诊断完成并交付。",
    })

    expect(patch["状态"]).toBe("已完成")
    expect(patch["AIM结果ID"]).toBe("gen_001")
    expect(patch["结果摘要"]).toBe("诊断完成并交付。")
    // 完成时必须清空失败残留的错误信息。
    expect(patch["错误信息"]).toBe("")
    expect(typeof patch["最后处理时间"]).toBe("number")
  })

  it("拒绝没有结果ID的完成", () => {
    expect(() => buildCompletePatch({ aimResultId: "", resultSummary: "" })).toThrow()
  })
})

describe("buildFailPatch", () => {
  it("设置失败并写入可行动错误信息", () => {
    const patch = buildFailPatch({ errorMessage: "飞书记录 proj_001 读取超时" })

    expect(patch["状态"]).toBe("失败")
    expect(patch["错误信息"]).toBe("飞书记录 proj_001 读取超时")
    expect(typeof patch["最后处理时间"]).toBe("number")
  })

  it("失败时不伪造结果ID", () => {
    const patch = buildFailPatch({ errorMessage: "执行失败" })

    // 失败语义下不应凭空写入一个结果ID。
    expect(patch).not.toHaveProperty("AIM结果ID")
    expect(patch).not.toHaveProperty("结果摘要")
  })

  it("拒绝没有错误信息的失败", () => {
    expect(() => buildFailPatch({ errorMessage: "" })).toThrow()
  })
})

describe("buildRetryPatch", () => {
  it("从失败退回待处理并清空旧错误", () => {
    const patch = buildRetryPatch()

    expect(patch["状态"]).toBe("待处理")
    expect(patch["错误信息"]).toBe("")
    expect(typeof patch["最后处理时间"]).toBe("number")
    // 重试 patch 不猜测或改写结果字段。
    expect(patch).not.toHaveProperty("AIM结果ID")
  })
})

describe("WORK_ITEM_STATES", () => {
  it("暴露五种业务状态", () => {
    expect(WORK_ITEM_STATES).toEqual<WorkItemStatus[]>([
      "待处理",
      "处理中",
      "待人工审核",
      "已完成",
      "失败",
    ])
  })
})
