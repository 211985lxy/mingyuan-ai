import { describe, expect, it, vi } from "vitest"

// 拦截数据库读取，避免无 DB 环境下连接超时。
// findUnique 返回 null → 走文件兜底加载 mingyuan/docs/ip-copywriting-methodology-core.md。
// 与 business-diagnosis-methodology.test.ts 的 mock 约定保持一致。
vi.mock("@/lib/prisma", () => ({
  prisma: {
    agentMethodology: { findUnique: vi.fn().mockResolvedValue(null) },
  },
}))

import { buildIpCopywritingMethodologyBlock } from "@/lib/ip-copywriting-methodology"

describe("ip-copywriting-methodology", () => {
  it("loads the project methodology document", async () => {
    const block = await buildIpCopywritingMethodologyBlock()

    expect(block).toContain("IP操盘方法论库")
    expect(block).toContain("流量型视频")
    expect(block).toContain("线索获客视频")
  })

  it("contains IP账号定位与内容策略策划 methodology card", async () => {
    const block = await buildIpCopywritingMethodologyBlock()

    // IP定位层
    expect(block).toContain("IP账号定位与内容策略策划阶段")
    expect(block).toContain("网红型")
    expect(block).toContain("个人IP型")
    expect(block).toContain("生态位")
    expect(block).toContain("性格与命理辅助建模")

    // 内容策略层
    expect(block).toContain("话题分布")
    expect(block).toContain("内容形式")
    expect(block).toContain("钩子模式")
    expect(block).toContain("发布频率")
    expect(block).toContain("最佳发布时段")
    expect(block).toContain("爆款公式")
  })

  it("contains the four copywriting content routes", async () => {
    const block = await buildIpCopywritingMethodologyBlock()

    expect(block).toContain("人设信任型")
    expect(block).toContain("观点立场型")
    expect(block).toContain("问题解决型")
    expect(block).toContain("案例转化型")
    expect(block).toContain("干货方法并入问题解决型")
    expect(block).toContain("成交转化并入案例转化型")
    expect(block).toContain("内容路由 = 这条内容为什么拍")
    expect(block).toContain("内容形式 = 这条内容怎么拍")
    expect(block).toContain("局部优化指令路由")
    expect(block).toContain("开头、前3秒、第一句话、钩子")
    expect(block).toContain("调用爆款开头库")
    expect(block).toContain("七大爆款开头")
    expect(block).toContain("好奇类")
    expect(block).toContain("借势类")
    expect(block).toContain("痛点类")
    expect(block).toContain("极限类")
    expect(block).toContain("恐吓类")
    expect(block).toContain("反差类")
    expect(block).toContain("利益输送")
  })

  it("contains the core copywriting upgrade cards", async () => {
    const block = await buildIpCopywritingMethodologyBlock()

    expect(block).toContain("文案写作核心方法论补充")
    expect(block).toContain("短视频爆款 19 条内容法则")
    expect(block).toContain("人设视频规划框架")
    expect(block).toContain("5A 人群运营框架")
    expect(block).toContain("私域承接与产品阶梯")
    expect(block).toContain("去 AI 味质检清单")
    expect(block).toContain("Aware 看见")
    expect(block).toContain("产品阶梯：免费引流品")
  })
})
