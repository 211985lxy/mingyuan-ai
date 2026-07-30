import { describe, expect, it } from "vitest"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { parseMultiFormatResponse } from "@/lib/aim-generator"
import { buildKnowledgeBlock } from "@/lib/aim-knowledge-context"
import { AIM_WORKFLOW_STAGES, getWorkflowStageForAgent } from "@/lib/aim-workflow"
import {
  AIM_HIGH_RISK_LOOP_RULE,
  BENCHMARK_REWRITE_GUARDRAIL,
  CONTENT_PRODUCER_OPERATING_LOGIC_RULE,
  CONTENT_PRODUCER_SELECTIVE_KNOWLEDGE_RULE,
  PUBLISH_PACKAGE_CHAT_RULE,
  benchmarkCopyReuseRatio,
  buildContentProducerChatPrompt,
  buildContentReviewGeneratePrompt,
  buildXhsVisualDirectorInstruction,
  extractBenchmarkOriginalCopy,
  isBenchmarkCopyTooSimilar,
} from "@/lib/aim-agent-handlers"
import {
  CONTENT_CREATION_TRACE_RULE,
  buildProducerSystemPrompt,
  buildWorkflowContext,
  ensureContentCreationTrace,
  findIncompleteGenerationFormats,
} from "@/lib/aim-generation-prompts"
import {
  AIM_OUTPUT_MAX_CHARS,
  BENCHMARK_RECREATION_PREFILL,
  buildBenchmarkLengthRule,
  buildBenchmarkRecreationSopBlock,
  buildExplicitWordCountPriorityRule,
  hasWordCountPreservationIntent,
} from "@/lib/aim-benchmark-length"
import { shouldOpenContentProducerLongform } from "@/lib/video-copy-routing"
import { FORMAT_INSTRUCTIONS } from "@/lib/aim-agent-prompts"

describe("AIM content production positioning", () => {
  it("writes operating logic into the copy instead of exposing a strategy report", () => {
    expect(CONTENT_PRODUCER_OPERATING_LOGIC_RULE).toContain("一个目标客户")
    expect(CONTENT_PRODUCER_OPERATING_LOGIC_RULE).toContain("一个主要内容任务")
    expect(CONTENT_PRODUCER_OPERATING_LOGIC_RULE).toContain("一个可信证据")
    expect(CONTENT_PRODUCER_OPERATING_LOGIC_RULE).toContain("一个承接动作")
    expect(CONTENT_PRODUCER_OPERATING_LOGIC_RULE).toContain("不要输出运营分析")
    // chat 默认只挂短句；完整运营逻辑需显式打开 includeOperatingLogicFull
    expect(buildContentProducerChatPrompt({
      conversationBlock: "",
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
    })).toContain("内部按「目标客户 / 真实问题 / 证据 / 承接」组织")
    expect(buildContentProducerChatPrompt({
      conversationBlock: "",
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
      includeOperatingLogicFull: true,
    })).toContain(CONTENT_PRODUCER_OPERATING_LOGIC_RULE)
  })

  it("asks only targeted questions when key copywriting information is missing", () => {
    const prompt = buildContentProducerChatPrompt({
      conversationBlock: "",
      knowledgeBlock: "",
      methodologyBlock: "",
      ipWikiBlock: "",
    })

    expect(prompt).toContain("追问 1-3 个具体问题")
    expect(prompt).toContain("可假设交付并标注待确认项")
    expect(prompt).toContain("禁止客套开场白")
    expect(prompt).toContain("可追溯")
    expect(prompt).toContain("绝不虚构")
    expect(prompt).not.toContain("不在内容生产官里追问")
  })

  it("keeps one canonical spoken-script instruction without a default word range", () => {
    expect(FORMAT_INSTRUCTIONS.video_script).toContain("不设默认字数区间")
    expect(FORMAT_INSTRUCTIONS.video_script).toContain("根据内容完整性决定篇幅")
    expect(FORMAT_INSTRUCTIONS.video_script).not.toContain("200-500")
    expect(FORMAT_INSTRUCTIONS.koubo_script).toBe(FORMAT_INSTRUCTIONS.video_script)
  })

  it("rejects a spoken script that ends halfway through a sentence", () => {
    expect(findIncompleteGenerationFormats({
      parsed: {
        video_script: "AI工具开始被退订了。你以为换成工具就能增长，但不少公司这么干完之后，获客",
      },
      targetFormats: ["video_script"],
      rawInput: "帮我写一条完整口播文案",
      finishReason: "stop",
    })).toEqual(["video_script"])
  })

  it("accepts a deliberately short but complete spoken script", () => {
    expect(findIncompleteGenerationFormats({
      parsed: { video_script: "别急着换工具，先把获客路径想清楚。" },
      targetFormats: ["video_script"],
      rawInput: "写一句不超过30字的短口播",
      finishReason: "stop",
    })).toEqual([])
  })

  it("rejects every format when the model reports token truncation", () => {
    expect(findIncompleteGenerationFormats({
      parsed: {
        video_script: "这是完整句子。",
        moments_post: "朋友圈正文。",
      },
      targetFormats: ["video_script", "moments_post"],
      rawInput: "生成内容",
      finishReason: "length",
    })).toEqual(["video_script", "moments_post"])
  })

  it("learns shared style from five to ten samples without stitching or copying them", () => {
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("一次提供 5-10 篇样本文案")
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("视为同一个风格样本集")
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("不要逐篇摘要、拼接段落或平均混合原句")
    expect(BENCHMARK_REWRITE_GUARDRAIL).toContain("只交付复刻风格后的全新成稿")
  })

  it("passes the content operating brief into generation context", () => {
    const context = buildWorkflowContext({
      taskSpec: {
        goal: "让传统企业老板理解内容获客",
        mode: "assumption_delivery",
        riskLevel: "medium",
        targetCustomer: "已经有业务但不会稳定做内容的老板",
        realProblem: "内容有播放但没有咨询",
        contentTask: "推动咨询行动",
        trustAssetType: "案例",
        exclusiveEvidence: "真实客户交付过程",
        desiredAction: "预约诊断",
        dealPath: "内容教育 → 预约诊断",
        coreMessage: "内容不是曝光工具，而是客户筛选系统",
        platform: "视频号",
        outputFormat: "60秒口播",
        style: "专业、真诚、短句",
        ctaText: "评论区回复诊断",
        knownFacts: [],
        unknowns: [],
        assumptions: [],
        nextAction: "直接交付",
        classifiedBy: "rule",
        classifiedAt: "2026-07-16T00:00:00.000Z",
      },
    } as unknown as Parameters<typeof buildWorkflowContext>[0])

    expect(context).toContain("目标客户：已经有业务但不会稳定做内容的老板")
    expect(context).toContain("主要内容任务：推动咨询行动")
    expect(context).toContain("优先信任证据：案例")
    expect(context).toContain("期望动作：预约诊断")
    expect(context).toContain("核心信息：内容不是曝光工具，而是客户筛选系统")
    expect(context).toContain("发布平台：视频号")
    expect(context).toContain("输出格式：60秒口播")
    expect(context).toContain("风格：专业、真诚、短句")
    expect(context).toContain("CTA：评论区回复诊断")
  })

  it("requires a teachable and traceable creation note for full copy generation", () => {
    const prompt = buildProducerSystemPrompt("agent prompt", {
      runtimeTask: "create_from_scratch",
      knowledgeBlock: "【产品卖点】陪跑服务",
      methodologyBlock: "",
      businessDiagnosisBlock: "",
      viralStructureBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "【人设】实战派\n【天命底盘】已有八字与紫微资料",
    } as unknown as Parameters<typeof buildProducerSystemPrompt>[1])

    expect(CONTENT_CREATION_TRACE_RULE).toContain("[[AIM_METHOD_NOTE]]")
    expect(CONTENT_CREATION_TRACE_RULE).toContain("目标判定")
    expect(CONTENT_CREATION_TRACE_RULE).toContain("调用卡片")
    expect(prompt).toContain("风格定位")
    expect(prompt).toContain("教学拆解")
    expect(prompt).toContain("对标爆款视频来源")
    expect(prompt).toContain("产品卖点")
    expect(prompt).toContain("人设特点")
    expect(prompt).toContain("八字与紫微天命适配")
    expect(prompt).toContain("未提供/待补充")
    expect(prompt).toContain("不得编造来源")
  })

  it("skips the creation note for local light edits", () => {
    const prompt = buildProducerSystemPrompt("agent prompt", {
      runtimeTask: "light_edit",
      knowledgeBlock: "",
      methodologyBlock: "",
      businessDiagnosisBlock: "",
      viralStructureBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
    } as unknown as Parameters<typeof buildProducerSystemPrompt>[1])

    expect(prompt).not.toContain(CONTENT_CREATION_TRACE_RULE)
  })

  it("adds a grounded fallback note when the model omits creation trace", () => {
    const content = ensureContentCreationTrace("这是可直接使用的正文。", {
      runtimeTask: "rewrite_copy",
      rawInput: "参考这条对标爆款写一篇文案",
      topicTitle: "AI 老板为什么要做内容",
      targetFormats: ["raw_copy"],
      retrievedEntries: [
        { title: "AI 陪跑服务卖点", category: "product_usp", content: "陪老板落地 AI 工作流" },
        { title: "老板人设", category: "persona", content: "直接、实战派" },
        { title: "紫微天命档案", category: "destiny", content: "紫微命盘资料" },
      ],
      taskSpec: {
        goal: "建立专业信任",
        targetCustomer: "中小企业老板",
        contentTask: "推动咨询行动",
      },
      ipWikiBlock: "【人设】专业、直接",
    } as Parameters<typeof ensureContentCreationTrace>[1])

    expect(content).toContain("[[AIM_METHOD_NOTE]]")
    expect(content).toContain("对标爆款视频来源：选题上下文：AI 老板为什么要做内容")
    expect(content).toContain("产品卖点：AI 陪跑服务卖点")
    expect(content).toContain("人设特点：老板人设")
    expect(content).toContain("紫微依据：紫微天命档案")
    expect(content).toContain("这是可直接使用的正文。")
    expect(content).toContain("### 相关原文")
  })

  it("backfills product USP when the model marks it as missing", () => {
    const content = ensureContentCreationTrace(`[[AIM_METHOD_NOTE]]
### 风格定位
- 专业、清晰

### 教学拆解
- 先讲问题再给方法

### 来源标注
- 对标爆款视频来源：未提供/待补充
- 产品卖点：未提供/待补充
- 人设特点：未提供/待补充

### 八字与紫微天命适配
- 八字依据：未提供/待补充
- 紫微依据：未提供/待补充
- 风格映射：未做命理推断；待补充八字或紫微资料后再校准。
[[/AIM_METHOD_NOTE]]

正文开始`, {
      runtimeTask: "new_copy",
      rawInput: "写一条口播",
      targetFormats: ["raw_copy"],
      retrievedEntries: [
        { title: "核心产品卖点：365-29800阶梯与90天陪跑", category: "product_usp", content: "29800三个月陪跑" },
        { title: "相宇个人IP能力底色", category: "positioning_material", content: "务实增长顾问" },
      ],
      ipWikiBlock: "",
    } as Parameters<typeof ensureContentCreationTrace>[1])

    expect(content).toContain("产品卖点：核心产品卖点：365-29800阶梯与90天陪跑")
    expect(content).toContain("人设特点：相宇个人IP能力底色")
    expect(content).not.toMatch(/产品卖点：\s*未提供\/待补充/)
  })

  it("keeps the required standalone content agents", () => {
    const titles = AIM_AGENT_OPTIONS.map((agent) => agent.title)

    expect(titles).toContain("内容创作")
    expect(titles).toContain("交货文案")
    expect(titles).toContain("选题策划")
    expect(titles).toContain("商业诊断")
  })

  it("adds a delivery copywriter that follows user requirements first", () => {
    const freeCopywriter = AIM_AGENT_OPTIONS.find((agent) => agent.id === "free_copywriter")

    expect(freeCopywriter?.title).toBe("交货文案")
    expect(freeCopywriter?.description).toContain("听用户要求")
    expect(freeCopywriter?.defaultFormats).toEqual(["raw_copy"])
  })

  it("positions work_editor as polish and layout, not deep longform writing", () => {
    const workEditor = AIM_AGENT_OPTIONS.find((agent) => agent.id === "work_editor")
    const contentProducer = AIM_AGENT_OPTIONS.find((agent) => agent.id === "content_producer")

    expect(workEditor?.title).toBe("作品编辑")
    expect(workEditor?.displayTitle).toBeUndefined()
    expect(workEditor?.description).toMatch(/二改|排版|小红书/)
    expect(workEditor?.description).not.toMatch(/深度长文|从零/)
    expect(workEditor?.defaultFormats).toEqual(["raw_copy"])
    expect(contentProducer?.description).toMatch(/流量漏斗|线索获客|通用故事/)
  })

  it("positions content_review as the publish quality agent", () => {
    const reviewAgent = AIM_AGENT_OPTIONS.find((agent) => agent.id === "content_review")

    expect(reviewAgent?.title).toBe("发布质检")
    expect(reviewAgent?.description).toContain("标题")
    expect(reviewAgent?.description).toContain("风险表达")
    expect(reviewAgent?.defaultFormats).toEqual(["raw_copy"])
    // 入口已并入作品编辑，UI 不再单独展示
    expect(reviewAgent?.hidden).toBe(true)
  })

  it("routes the publish workflow stage to work_editor after review consolidation", () => {
    const publishStage = AIM_WORKFLOW_STAGES.find((stage) => stage.id === "publish")

    expect(publishStage?.defaultAgentId).toBe("work_editor")
    expect(getWorkflowStageForAgent("work_editor")).toBe("publish")
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

  it("switches long benchmark transcripts to content producer longform earlier", () => {
    expect(shouldOpenContentProducerLongform({
      videoDuration: null,
      transcript: "测".repeat(1579),
    })).toBe(true)
    expect(shouldOpenContentProducerLongform({
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
      conversationBlock: "最近成稿",
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
