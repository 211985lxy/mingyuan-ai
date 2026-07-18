import { describe, expect, it } from "vitest"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { parseMultiFormatResponse } from "@/lib/aim-generator"
import { buildKnowledgeBlock } from "@/lib/aim-knowledge-context"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  GENERATE_MODE_LOOP_RULE_EXEMPTION,
  PUBLISH_PACKAGE_CHAT_RULE,
  benchmarkCopyReuseRatio,
  buildContentProducerChatPrompt,
  buildContentReviewGeneratePrompt,
  buildXhsVisualDirectorInstruction,
  extractBenchmarkOriginalCopy,
  isBenchmarkCopyTooSimilar,
} from "@/lib/aim-agent-handlers"
import {
  AIM_OUTPUT_MAX_CHARS,
  BENCHMARK_RECREATION_PREFILL,
  buildBenchmarkLengthRule,
  buildBenchmarkRecreationSopBlock,
  buildExplicitWordCountPriorityRule,
  hasWordCountPreservationIntent,
} from "@/lib/aim-benchmark-length"
import { shouldOpenDeepCopywriter } from "@/lib/video-copy-routing"

describe("AIM content production positioning", () => {
  it("keeps the required standalone content agents", () => {
    const titles = AIM_AGENT_OPTIONS.map((agent) => agent.title)

    expect(titles).toContain("内容文案创作")
    expect(titles).toContain("交货文案创作")
    expect(titles).toContain("灵感选题策划")
    expect(titles).toContain("商业模式诊断")
  })

  it("adds a delivery copywriter that follows user requirements first", () => {
    const freeCopywriter = AIM_AGENT_OPTIONS.find((agent) => agent.id === "free_copywriter")

    expect(freeCopywriter?.title).toBe("交货文案创作")
    expect(freeCopywriter?.description).toContain("听用户要求")
    expect(freeCopywriter?.defaultFormats).toEqual(["raw_copy"])
  })

  it("positions the deep copywriter as framework-first", () => {
    const deepCopywriter = AIM_AGENT_OPTIONS.find((agent) => agent.id === "deep_copywriter")

    expect(deepCopywriter?.title).toBe("深度长文创作")
    expect(deepCopywriter?.defaultFormats).toEqual(["raw_copy"])
  })

  it("positions content_review as the publish quality agent", () => {
    const reviewAgent = AIM_AGENT_OPTIONS.find((agent) => agent.id === "content_review")

    expect(reviewAgent?.title).toBe("发布前质检")
    expect(reviewAgent?.description).toContain("标题")
    expect(reviewAgent?.description).toContain("风险表达")
    expect(reviewAgent?.defaultFormats).toEqual(["raw_copy"])
  })

  it("keeps content_review focused on publish checks", () => {
    const prompt = buildContentReviewGeneratePrompt("企业知识库")

    expect(prompt).toContain("发布前自查")
    expect(prompt).toContain("最小修改建议")
    expect(prompt).toContain("流量潜力评分")
    expect(prompt).toContain("不要整篇重写")
    expect(prompt).toContain("如果用户没有提供完整文案")
  })

  it("defines the shared high-risk loop guardrail as a light prompt-only rule", () => {
    expect(AIM_HIGH_RISK_LOOP_RULE).toContain("高风险任务验证规则")
    expect(AIM_HIGH_RISK_LOOP_RULE).toContain("验证结果")
    expect(AIM_HIGH_RISK_LOOP_RULE).toContain("未提供/待补充")
    expect(AIM_HIGH_RISK_LOOP_RULE).toContain("简单问答、局部润色、单句改写、纯发散创意")
  })

  it("keeps content_review minimal while adding the loop rule for formal deliverables", () => {
    const prompt = buildContentReviewGeneratePrompt("企业知识库")

    expect(prompt).toContain("正式交付内容结尾追加一个简短“验证结果”区块")
    expect(prompt).toContain("不要整篇重写")
    expect(prompt).toContain("最小修改建议")
    // 生成模式豁免：验证结果区块只在聊天质检场景生效，正式生成物不追加
    expect(prompt).toContain(GENERATE_MODE_LOOP_RULE_EXEMPTION)
  })

  it("labels Feishu-importable content knowledge categories in prompts", () => {
    const block = buildKnowledgeBlock([
      { category: "hot_topic", title: "行业热点", content: "飞书多维表格 AI 能力升级。" },
      { category: "positioning_material", title: "客户定位", content: "目标客户是传统企业老板。" },
      { category: "private_domain_material", title: "私域素材", content: "朋友圈需要承接咨询。" },
    ])

    expect(block).toContain("【热点素材】")
    expect(block).toContain("【定位素材】")
    expect(block).toContain("【私域素材】")
  })

  it("keeps benchmark rewrites close to the original copy length", () => {
    const rule = buildBenchmarkLengthRule("一 二 三 四 五") || ""

    expect(rule).toContain("目标约 5 字")
    expect(rule).toContain("控制在 5-5 字")
    expect(rule).toContain("如果用户没有另写明确字数要求")
    expect(buildBenchmarkLengthRule("")).toBeNull()
  })

  it("switches long benchmark rewrites to deep copywriter earlier", () => {
    expect(shouldOpenDeepCopywriter({
      videoDuration: null,
      transcript: "测".repeat(1579),
    })).toBe(true)
    expect(shouldOpenDeepCopywriter({
      videoDuration: null,
      transcript: "测".repeat(900),
    })).toBe(false)
  })

  it("lets explicit user word count override benchmark length", () => {
    const rule = buildBenchmarkLengthRule("一 二 三 四 五", "请写一篇不少于2000字的长文") || ""

    expect(rule).toContain("必须优先服从用户字数")
    expect(rule).toContain(`不得超过 ${AIM_OUTPUT_MAX_CHARS} 字`)
    expect(rule).not.toContain("控制在 5-5 字")
    expect(buildExplicitWordCountPriorityRule("请输出两千字")).toContain("必须优先服从用户字数")
  })

  it("recognizes keep-length intent even without explicit numbers", () => {
    expect(hasWordCountPreservationIntent("别越改越短，保持原稿长度")).toBe(true)
    expect(buildExplicitWordCountPriorityRule("不要压缩，按原稿体量来")).toContain("不要越改越短")
  })

  it("caps benchmark rewrite guidance at the global max length", () => {
    const rule = buildBenchmarkLengthRule("测".repeat(6000)) || ""

    expect(rule).toContain(`目标约 ${AIM_OUTPUT_MAX_CHARS} 字`)
    expect(rule).toContain(`不得超过 ${AIM_OUTPUT_MAX_CHARS} 字`)
  })

  it("requires visible rewrite for benchmark copy", () => {
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("至少 30%")
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("不要连续沿用原文 12 个字以上")
  })

  it("defines the benchmark recreation SOP", () => {
    const sop = buildBenchmarkRecreationSopBlock()

    expect(sop).toContain("爆款选题再创作 SOP")
    expect(sop).toContain("已有拆解里的爆款结构逻辑")
    expect(sop).toContain("核心选题、开头机制、观点冲突、情绪触发")
    expect(sop).toContain("内部建立观点池")
    expect(sop).toContain("结构重构、观点重构、表达重构")
  })

  it("prefills benchmark recreation with the dissected viral structure first", () => {
    expect(BENCHMARK_RECREATION_PREFILL.short).toContain("先按拆解好的爆款结构逻辑走")
    expect(BENCHMARK_RECREATION_PREFILL.long).toContain("先按拆解好的爆款结构逻辑走")
  })

  it("returns publish packages directly in chat with brand-related topics", () => {
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("直接在当前聊天回复里给到")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("对标标题")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("对标话题/标签风格")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("与对标基本一致")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("不要照抄")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("账号名称、品牌名称、IP 名或项目名相关的话题")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("## 发布文案")
    expect(PUBLISH_PACKAGE_CHAT_RULE).toContain("## 发布话题")
  })

  it("keeps content producer knowledge use selective instead of mandatory", () => {
    expect(CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE).toContain("默认不要每次都重度结合企业知识库")
    expect(CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE).toContain("少量调用知识库素材")
    expect(CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE).toContain("1-2 句人设")
    expect(CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE).toContain("不要为了“结合知识库”把稿子写重")
  })

  it("keeps follow-up edits anchored to the latest relevant draft", () => {
    const prompt = buildContentProducerChatPrompt({
      knowledgeBlock: "企业知识",
      methodologyBlock: "方法论",
      ipWikiBlock: "",
    })

    expect(prompt).toContain("默认指当前对话里最近相关的成稿或候选")
    expect(prompt).toContain("当前轮用户修改要求 > 用户刚确认或刚点名的那版成稿")
    expect(prompt).toContain("只改用户点名的部分")
    expect(prompt).toContain("不要擅自整篇重写或切回最早素材")
    expect(prompt).toContain("自然融入")
    expect(prompt).toContain("别越改越短")
  })

  it("detects benchmark copy that barely changed", () => {
    const rawInput = [
      "改成我的口播。",
      "对标原文：",
      "我深度使用code有两个多月了，现在有一个特别强烈的感受，普通人的命运真的又到了重新洗牌的时候。",
      "结构化拆解：",
      "先抛结论。",
    ].join("\n")

    expect(extractBenchmarkOriginalCopy(rawInput)).toContain("普通人的命运")
    expect(benchmarkCopyReuseRatio(
      extractBenchmarkOriginalCopy(rawInput),
      "我深度使用code有两个多月了，现在有一个特别强烈的感受，普通人的命运真的又到了重新洗牌的时候。"
    )).toBeGreaterThan(0.9)
    expect(isBenchmarkCopyTooSimilar(rawInput, "我深度使用code有两个多月了，现在有一个特别强烈的感受，普通人的命运真的又到了重新洗牌的时候。")).toBe(true)
    expect(isBenchmarkCopyTooSimilar(rawInput, "我这两个月一直在用AI做业务系统，最大的感受是，普通人真正要补的不是工具，而是判断和流程。")).toBe(false)
  })
})

describe("xiaohongshu_post visual director", () => {
  const instruction = buildXhsVisualDirectorInstruction()

  it("locks the canvas to strict 3:4 vertical portrait", () => {
    expect(instruction).toContain("1080x1440px")
    expect(instruction).toContain("strict 3:4")
  })

  it("includes the fixed output sections", () => {
    expect(instruction).toContain("统一视觉母版")
    expect(instruction).toContain("8 页图文结构")
    expect(instruction).toContain("逐页视觉提示词")
    expect(instruction).toContain("发布前自检")
  })

  it("maps content types to AIM visual styles", () => {
    expect(instruction).toContain("深色科技杂志风")
    expect(instruction).toContain("高级商业提案风")
    expect(instruction).toContain("个人品牌宣言风")
    expect(instruction).toContain("Notion 高级卡片风")
  })

  it("requires per-page negative prompts for visual consistency", () => {
    expect(instruction).toContain("no square image")
    expect(instruction).toContain("no inconsistent margins")
  })

  it("still parses ===FORMAT:xiaohongshu_post=== from raw output", () => {
    const raw =
      "===FORMAT:xiaohongshu_post===\n# 风格判断报告\n深色科技杂志风\n# 统一视觉母版\n1080x1440px"
    const result = parseMultiFormatResponse(raw, ["xiaohongshu_post"])
    expect(result.xiaohongshu_post ?? "").toContain("深色科技杂志风")
    expect(result.xiaohongshu_post ?? "").toContain("1080x1440px")
  })
})
