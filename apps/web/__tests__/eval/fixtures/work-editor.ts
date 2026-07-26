/**
 * work_editor eval fixtures (15 cases).
 *
 * Coverage matrix (plan §1):
 *   new 5 | imitate 3 | partial_edit 3 | revision 2 | cite_knowledge 1 | info_insufficient 1
 *
 * work_editor agentId does not trigger special-case routing in
 * resolveAimRuntimeTask, so normal keyword/taskType/format rules apply.
 */
import type { EvalFixture } from "@/lib/aim-harness/eval/contracts"

export const WORK_EDITOR_FIXTURES: EvalFixture[] = [
  // ───────────────────────────── new (5) ─────────────────────────────
  {
    id: "dc_new_wechat_01",
    version: 1,
    agent: "work_editor",
    scenario: "new",
    entrypoint: "generate",
    description: "深度文案新稿：公众号长文，write_script → new_copy",
    input: {
      rawInput: "围绕『为什么年轻人开始反向消费』写一篇深度公众号文章。",
      agentId: "work_editor",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_dc_trend",
          title: "反向消费趋势洞察",
          category: "market",
          valueGrade: "A",
          content: "年轻人更看重质价比、悦己与可持续。",
        },
      ],
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
      minCharsPerFormat: 300,
    },
  },
  {
    id: "dc_new_brand_02",
    version: 1,
    agent: "work_editor",
    scenario: "new",
    entrypoint: "generate",
    description: "品牌故事长文新稿",
    input: {
      rawInput: "帮我们品牌写一篇品牌故事深度文案。",
      agentId: "work_editor",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_new_conversion_03",
    version: 1,
    agent: "work_editor",
    scenario: "new",
    entrypoint: "generate",
    description: "转化型深度长文，conversion 策略",
    input: {
      rawInput: "写一篇转化型深度文案，突出产品卖点和用户痛点。",
      agentId: "work_editor",
      taskType: "write_script",
      topicType: "转化型",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "conversion",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_new_traffic_04",
    version: 1,
    agent: "work_editor",
    scenario: "new",
    entrypoint: "generate",
    description: "流量型+热点深度文案，hot_topic 策略（热点优先于 topicType）",
    input: {
      rawInput: "结合当下热点，写一篇流量型深度文案。",
      agentId: "work_editor",
      taskType: "write_script",
      topicType: "流量型",
      hotTopic: "最近爆火的『搭子文化』",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "hot_topic",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_new_persona_05",
    version: 1,
    agent: "work_editor",
    scenario: "new",
    entrypoint: "generate",
    description: "人设型深度文案，persona 策略",
    input: {
      rawInput: "写一篇人设型深度文案，讲老板的创业经历。",
      agentId: "work_editor",
      taskType: "write_script",
      topicType: "人设型",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "persona",
      outputFormats: ["wechat_article"],
    },
  },

  // ──────────────────────────── imitate (3) ────────────────────────────
  {
    id: "dc_imitate_06",
    version: 1,
    agent: "work_editor",
    scenario: "imitate",
    entrypoint: "generate",
    description: "仿写对标爆款长文",
    input: {
      rawInput: "参考这篇爆款的结构，仿写一篇同主题深度文案。",
      agentId: "work_editor",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [],
      videoCopyBlock: "对标：观点先行→数据支撑→反转→价值升华。",
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_imitate_repurpose_07",
    version: 1,
    agent: "work_editor",
    scenario: "imitate",
    entrypoint: "generate",
    description: "改写复用：长文改编为朋友圈（rewrite_copy）",
    input: {
      rawInput: "重写一下，把这篇深度长文浓缩成一条朋友圈。",
      agentId: "work_editor",
      taskType: "repurpose",
      targetFormats: ["moments_post"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      // 改编复用属于整体重写，知识策略为 rewrite 档（中量，案例/身份替换）。
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: ["moments_post"],
    },
  },
  {
    id: "dc_imitate_rawcopy_08",
    version: 1,
    agent: "work_editor",
    scenario: "imitate",
    entrypoint: "generate",
    description: "对标改写原始文案（rewrite_copy）",
    input: {
      rawInput: "把这条对标文案重写一版，换种风格。",
      agentId: "work_editor",
      targetFormats: ["raw_copy"],
    },
    seedContext: {
      knowledge: [],
      videoCopyBlock: "对标原文：用场景化描写打动用户。",
    },
    expectations: {
      // 对标重写一版走「对标改写」中量知识策略（rewrite 档）。
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: ["raw_copy"],
    },
  },

  // ──────────────────────────── partial_edit (3) ────────────────────────────
  {
    id: "dc_edit_opening_09",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "改长文开头钩子，light_edit",
    input: {
      rawInput: "优化这篇深度文案的开头，第一句话更抓人。",
      agentId: "work_editor",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_edit_closing_10",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "改长文结尾收尾，light_edit",
    input: {
      rawInput: "帮我调整结尾，收尾更有余味。",
      agentId: "work_editor",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "dc_edit_polish_11",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "润色指令驱动 light_edit",
    input: {
      rawInput: "原文：这是一篇关于消费降级的文章。",
      agentId: "work_editor",
      polishInstruction: "顺一下语言，更自然点。",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["wechat_article"],
    },
  },

  // ──────────────────────────── revision (2) ────────────────────────────
  {
    id: "dc_revise_12",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "追改：要求大改某段（rewrite_copy）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿深度长文略）" },
        { role: "user", content: "第二部分论证太弱了，帮我重新写一遍，要有数据支撑。" },
      ],
      rawInput: "第二部分论证太弱了，帮我重新写一遍，要有数据支撑。",
      agentId: "work_editor",
    },
    seedContext: { knowledge: [] },
    expectations: {
      // “重新写一遍”命中 → rewrite_copy；重写段落按整体改写处理，
      // 知识策略为 rewrite 档（中量），不再是 light_edit 极低配额。
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: [],
    },
  },
  {
    id: "dc_revise_redirect_13",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "纠偏：换个开头说法（light_edit）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿略）" },
        { role: "user", content: "开头太学术了，换个说法，通俗点。" },
      ],
      rawInput: "开头太学术了，换个说法，通俗点。",
      agentId: "work_editor",
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: [],
    },
  },

  // ──────────────────────────── cite_knowledge (1) ────────────────────────────
  {
    id: "dc_cite_case_14",
    version: 1,
    agent: "work_editor",
    scenario: "cite_knowledge",
    entrypoint: "generate",
    description: "引用客户案例写深度文案，必须引用",
    input: {
      rawInput: "结合我们的客户案例，写一篇讲服务价值的深度文案。",
      agentId: "work_editor",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_dc_case",
          title: "标杆客户案例：连锁餐饮数字化转型",
          category: "case",
          valueGrade: "S",
          content: "某连锁餐饮通过我们的方案，3个月复购率提升40%。",
        },
      ],
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
      mustCiteKnowledgeIds: ["k_dc_case"],
    },
  },

  // ──────────────────────────── info_insufficient (1) ────────────────────────────
  {
    id: "dc_info_insufficient_15",
    version: 1,
    agent: "work_editor",
    scenario: "info_insufficient",
    entrypoint: "generate",
    description: "信息不足：写深度文案但未给任何主题/角度，应提示",
    input: {
      rawInput: "帮我写一篇深度文案。",
      agentId: "work_editor",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
      mustWarnInsufficientInfo: true,
      bannedSubstrings: ["我是一个AI", "作为一个AI", "根据我的数据库"],
    },
  },
]
