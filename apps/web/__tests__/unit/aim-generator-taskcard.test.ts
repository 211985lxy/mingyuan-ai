/**
 * @fileoverview 内容任务卡（contentTaskCard）prompt 注入链路单测。
 *
 * 只测 aim-agent-handlers 中抽出的纯函数 buildTaskCardPromptBlock，
 * 避免走 buildAimGeneration → LLM 调用路径。覆盖：
 *  a) 注入分支：开关开 + core_claim 非空 → 含「本轮任务卡」和「核心观点」字样
 *  b) 回退分支：开关关 或 core_claim 空 → 字符级等价 baseline（零注入）
 */

import { buildTaskCardPromptBlock } from "@/lib/aim-agent-handlers"

describe("buildTaskCardPromptBlock（内容任务卡 prompt 块）", () => {
  describe("a) 注入分支：灰度开 + core_claim 非空", () => {
    it("应返回完整任务卡块，包含标题与核心观点字段", () => {
      const block = buildTaskCardPromptBlock(true, {
        audience: "B 端中小企业创始人",
        pain: "获客成本高、转化链路长、团队没内容方法论",
        core_claim: "AI 原生公司 = AI 能力 × 行业 know-how，90 天即可落地",
        case_refs: ["客户 A 3 月询盘翻倍", "客户 B 落地首周成交 2 单"],
        product_link: "明动 AIM 智能体企业版",
        platform_angles: {
          抖音: "讲真实客户案例，15 秒钩子",
          视频号: "讲创始人心法，信任前置",
        },
      })

      expect(block).toContain("=== 本轮任务卡 ===")
      expect(block).toContain("核心观点: AI 原生公司 = AI 能力 × 行业 know-how，90 天即可落地")
      expect(block).toContain("写给谁: B 端中小企业创始人")
      expect(block).toContain("用户痛点: 获客成本高、转化链路长、团队没内容方法论")
      expect(block).toContain("素材案例: 客户 A 3 月询盘翻倍，客户 B 落地首周成交 2 单")
      expect(block).toContain("承接产品: 明动 AIM 智能体企业版")
      expect(block).toContain("平台角度: 抖音: 讲真实客户案例，15 秒钩子 / 视频号: 讲创始人心法，信任前置")
    })

    it("未填写字段应回退为「(未填写)」「(未提供)」，不影响块存在性", () => {
      const block = buildTaskCardPromptBlock(true, {
        core_claim: "核心观点测试",
      })
      expect(block).toContain("=== 本轮任务卡 ===")
      expect(block).toContain("核心观点: 核心观点测试")
      expect(block).toContain("写给谁: (未填写)")
      expect(block).toContain("用户痛点: (未填写)")
      expect(block).toContain("素材案例: (未提供)")
      expect(block).toContain("承接产品: (未填写)")
      expect(block).toContain("平台角度: (未填写)")
    })
  })

  describe("b) 回退分支：开关关 / core_claim 空 / 结构非法 → 零注入", () => {
    it("灰度 enable=false，即使有完整任务卡也返回空串", () => {
      const block = buildTaskCardPromptBlock(false, {
        core_claim: "有核心观点",
        audience: "有人群",
      })
      expect(block).toBe("")
      expect(block).not.toContain("本轮任务卡")
    })

    it("灰度开但 core_claim 为空字符串 → 视为未启用，零注入", () => {
      const block = buildTaskCardPromptBlock(true, {
        core_claim: "",
        audience: "有人群",
      })
      expect(block).toBe("")
      expect(block).not.toContain("本轮任务卡")
    })

    it("灰度开但任务卡为 null/undefined → 零注入", () => {
      expect(buildTaskCardPromptBlock(true, null)).toBe("")
      expect(buildTaskCardPromptBlock(true, undefined)).toBe("")
      expect(buildTaskCardPromptBlock(true, null)).not.toContain("本轮任务卡")
      expect(buildTaskCardPromptBlock(true, undefined)).not.toContain("本轮任务卡")
    })

    it("灰度开但 core_claim 为全空白字符串 → 零注入", () => {
      const block = buildTaskCardPromptBlock(true, {
        core_claim: "   \n\t  ",
      })
      expect(block).toBe("")
      expect(block).not.toContain("本轮任务卡")
    })
  })

  /**
   * Task12 Quality rubric A/B 对照样本：
   * 在 prompt 级记录「无任务卡」与「有任务卡」的差异，作为 rubric 三维度
   * （核心观点一致性 / 案例引用可追踪性 / 平台角度分化）的回归基线。
   * 不调用真实 LLM；通过对比 prompt block 的存在与否，证明链路按预期分化。
   */
  describe("Task12 A/B 对照样本（prompt 级 rubric 基线）", () => {
    const rubricCard = {
      audience: "中小 SaaS 创始人",
      pain: "投放 CAC 越来越高，转化却越来越差",
      core_claim: "用内容飞轮替代一次性投放，3 个月可把 CAC 降一半",
      case_refs: ["某 SaaS 0 预算月获 200 线索", "本地装修号月销 80 单全靠小红书"],
      product_link: "https://example.com/aim",
      platform_angles: {
        小红书: "从「我踩过的投放坑」切入，带真实账单截图",
        抖音: "前后对比口播：烧 5w 0 转化 vs 做内容后 0 预算月获 200 线索",
        视频号: "深度拆解 5 步流程，附可复用 SOP 表格",
      },
    }

    it("A 组（无任务卡）：prompt block 为空，三维度信号全部缺失", () => {
      const block = buildTaskCardPromptBlock(true, undefined)
      expect(block).toBe("")
      expect(block).not.toContain("核心观点")
      expect(block).not.toContain("素材案例")
      expect(block).not.toContain("平台角度")
    })

    it("B 组（有任务卡）：prompt block 非空，三维度信号全部命中", () => {
      const block = buildTaskCardPromptBlock(true, rubricCard)
      // 维度 1：核心观点一致性
      expect(block).toContain("核心观点: 用内容飞轮替代一次性投放，3 个月可把 CAC 降一半")
      // 维度 2：案例引用可追踪性
      expect(block).toContain("素材案例: 某 SaaS 0 预算月获 200 线索，本地装修号月销 80 单全靠小红书")
      // 维度 3：平台角度分化（3 个平台分别有不同切入）
      expect(block).toContain("小红书: 从「我踩过的投放坑」切入，带真实账单截图")
      expect(block).toContain("抖音: 前后对比口播：烧 5w 0 转化 vs 做内容后 0 预算月获 200 线索")
      expect(block).toContain("视频号: 深度拆解 5 步流程，附可复用 SOP 表格")
    })

    it("A/B 差异断言：B 组 block 长度显著大于 A 组（避免退化成等价）", () => {
      const aBlock = buildTaskCardPromptBlock(true, undefined)
      const bBlock = buildTaskCardPromptBlock(true, rubricCard)
      expect(bBlock.length).toBeGreaterThan(aBlock.length + 200)
    })
  })
})
