/**
 * business_diagnosis eval fixtures (15 cases).
 *
 * Because agentId === "business_diagnosis" forces resolveAimRuntimeTask to
 * return "positioning_topic" (checked before any keyword logic), EVERY case
 * here expects runtimeTask === "positioning_topic". The fixtures vary the
 * *signals* (topicType, hotTopic, polishInstruction) so the knowledge strategy
 * and output contracts differ — that is where the real coverage lives.
 *
 * Coverage matrix (plan §1):
 *   new 5 | imitate 2 | partial_edit 3 | revision 2 | cite_knowledge 2 | info_insufficient 1
 */
import type { EvalFixture } from "../contracts"

export const BUSINESS_DIAGNOSIS_FIXTURES: EvalFixture[] = [
  // ───────────────────────────── new (5) ─────────────────────────────
  {
    id: "bd_new_position_01",
    version: 1,
    agent: "business_diagnosis",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿定位策划：账号方向，positioning_topic + deep",
    input: {
      rawInput: "帮我做一个账号定位方案，方向是母婴好物推荐。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_bd_ipwiki",
          title: "IP 定位初稿",
          category: "positioning",
          valueGrade: "S",
          content: "人设：两个孩子的妈妈 + 前母婴品牌买手。",
        },
      ],
      ipWikiBlock: "定位：可信赖的母婴好物买手。",
    },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_new_persona_02",
    version: 1,
    agent: "business_diagnosis",
    scenario: "new",
    entrypoint: "generate",
    description: "人设梳理，persona 策略",
    input: {
      rawInput: "帮我梳理人设卖点，写一个IP策划方案。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      topicType: "人设型",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [], ipWikiBlock: "定位：手工艺人转型主理人。" },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "persona",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_new_conversion_03",
    version: 1,
    agent: "business_diagnosis",
    scenario: "new",
    entrypoint: "generate",
    description: "转化型内容方向，conversion 策略",
    input: {
      rawInput: "帮我规划转化型的内容方向。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      topicType: "转化型",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [], ipWikiBlock: "定位：私域护肤顾问。" },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "conversion",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_new_traffic_hot_04",
    version: 1,
    agent: "business_diagnosis",
    scenario: "new",
    entrypoint: "generate",
    description: "流量型+热点选题，hot_topic 策略（热点优先于 topicType）",
    input: {
      rawInput: "结合当下热点，帮我做流量型选题规划。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      topicType: "流量型",
      hotTopic: "最近爆火的『City Walk』",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "hot_topic",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_new_topic_select_05",
    version: 1,
    agent: "business_diagnosis",
    scenario: "new",
    entrypoint: "generate",
    description: "选题规划（『选题』关键词 + business_diagnosis 双重确认）",
    input: {
      rawInput: "帮我想一批选题，围绕职场成长。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },

  // ──────────────────────────── imitate (2) ────────────────────────────
  {
    id: "bd_imitate_benchmark_06",
    version: 1,
    agent: "business_diagnosis",
    scenario: "imitate",
    entrypoint: "generate",
    description: "参照对标账号做定位策划",
    input: {
      rawInput: "参照这个对标账号的定位，帮我做一个类似的IP策划。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [],
      ipWikiBlock: "对标账号定位：极简生活博主。",
    },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_imitate_repurpose_07",
    version: 1,
    agent: "business_diagnosis",
    scenario: "imitate",
    entrypoint: "generate",
    description: "把定位方案改编为朋友圈（business_diagnosis 仍 → positioning_topic）",
    input: {
      rawInput: "重写一下，把这个定位方案浓缩成一条朋友圈。",
      agentId: "business_diagnosis",
      taskType: "repurpose",
      targetFormats: ["moments_post"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      // agentId=business_diagnosis 在关键词之前命中 → positioning_topic
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["moments_post"],
    },
  },

  // ──────────────────────────── partial_edit (3) ────────────────────────────
  // 注意：即便指令是『改开头』，business_diagnosis agentId 仍强制 positioning_topic。
  // 这正是 grader 要钉死的契约——agentId 路由优先于关键词。
  {
    id: "bd_edit_hook_08",
    version: 1,
    agent: "business_diagnosis",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "即便要求改钩子，business_diagnosis 仍 → positioning_topic",
    input: {
      rawInput: "优化这个定位方案的开头钩子。",
      agentId: "business_diagnosis",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_edit_polish_09",
    version: 1,
    agent: "business_diagnosis",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "润色指令，但 agentId 优先 → positioning_topic + deep",
    input: {
      rawInput: "原始方案：账号方向是亲子旅行。",
      agentId: "business_diagnosis",
      polishInstruction: "顺一下语言。",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      // polishInstruction 会让 knowledgeStrategy → light_edit 吗？
      // resolveKnowledgeStrategy: light_edit 仅当 runtimeTask 是 light_edit/rewrite_copy
      // 或 polishInstruction/taskType=polish_copy。此处 polishInstruction 存在 → light_edit。
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "light_edit",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "bd_edit_ending_10",
    version: 1,
    agent: "business_diagnosis",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "改结尾收尾，agentId 优先 → positioning_topic",
    input: {
      rawInput: "帮我调整这个策划方案的结尾，收尾更有号召力。",
      agentId: "business_diagnosis",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
    },
  },

  // ──────────────────────────── revision (2) ────────────────────────────
  {
    id: "bd_revise_11",
    version: 1,
    agent: "business_diagnosis",
    scenario: "revision",
    entrypoint: "chat",
    description: "追改：要求重新梳理人设（positioning_topic）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿定位方案略）" },
        { role: "user", content: "人设部分还不够清晰，帮我重新梳理一下人设卖点。" },
      ],
      rawInput: "人设部分还不够清晰，帮我重新梳理一下人设卖点。",
      agentId: "business_diagnosis",
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: [],
    },
  },
  {
    id: "bd_revise_redirect_12",
    version: 1,
    agent: "business_diagnosis",
    scenario: "revision",
    entrypoint: "chat",
    description: "纠偏：换个选题方向（『选题』关键词 + agentId 双重命中）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿略）" },
        { role: "user", content: "这个选题方向不对，换一批选题。" },
      ],
      rawInput: "这个选题方向不对，换一批选题。",
      agentId: "business_diagnosis",
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: [],
    },
  },

  // ──────────────────────────── cite_knowledge (2) ────────────────────────────
  {
    id: "bd_cite_persona_13",
    version: 1,
    agent: "business_diagnosis",
    scenario: "cite_knowledge",
    entrypoint: "generate",
    description: "引用老板经历/来时路做定位，必须引用",
    input: {
      rawInput: "结合老板的来时路和人设资料，帮我做IP定位策划。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      topicType: "人设型",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_bd_origin",
          title: "老板来时路：从大厂到独立创业",
          category: "persona",
          valueGrade: "S",
          content: "老板曾在头部大厂负责增长，后辞职做个人品牌。",
        },
      ],
      ipWikiBlock: "定位：大厂增长方法论布道者。",
    },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "persona",
      outputFormats: ["wechat_article"],
      mustCiteKnowledgeIds: ["k_bd_origin"],
    },
  },
  {
    id: "bd_cite_product_14",
    version: 1,
    agent: "business_diagnosis",
    scenario: "cite_knowledge",
    entrypoint: "generate",
    description: "引用产品/卖点做转化型内容方向，必须引用",
    input: {
      rawInput: "结合我们的产品资料，帮我规划转化型内容方向。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      topicType: "转化型",
      targetFormats: ["wechat_article"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_bd_product",
          title: "核心产品卖点与定价",
          category: "product",
          valueGrade: "S",
          content: "主打高客单私教课，差异化是1v1陪伴式辅导。",
        },
      ],
    },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "conversion",
      outputFormats: ["wechat_article"],
      mustCiteKnowledgeIds: ["k_bd_product"],
    },
  },

  // ──────────────────────────── info_insufficient (1) ────────────────────────────
  {
    id: "bd_info_insufficient_15",
    version: 1,
    agent: "business_diagnosis",
    scenario: "info_insufficient",
    entrypoint: "generate",
    description: "信息不足：要做定位但没给任何方向/资料，应提示而非编造",
    input: {
      rawInput: "帮我做一个IP定位策划。",
      agentId: "business_diagnosis",
      taskType: "write_script",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "positioning_topic",
      knowledgeStrategy: "deep",
      outputFormats: ["wechat_article"],
      mustWarnInsufficientInfo: true,
      bannedSubstrings: ["我是一个AI", "作为一个AI", "根据我的数据库"],
    },
  },
]
