/**
 * content_producer eval fixtures (20 cases).
 *
 * Each `expectedRuntimeTask` was derived by hand-tracing
 * resolveAimRuntimeTask (aim-knowledge-strategy.ts) so the deterministic
 * grader asserts the *real* planner output, not a wish.
 *
 * Coverage matrix (plan §1):
 *   new 6 | imitate 4 | partial_edit 4 | revision 2 | cite_knowledge 2 | info_insufficient 2
 */
import type { EvalFixture } from "../contracts"

export const CONTENT_PRODUCER_FIXTURES: EvalFixture[] = [
  // ───────────────────────────── new (6) ─────────────────────────────
  {
    id: "cp_new_video_01",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "从零写一条口播脚本，命中 write_script → new_copy",
    input: {
      rawInput: "帮我围绕『新手爸妈如何选第一台婴儿车』写一条短视频脚本，目标是抖音。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["video_script", "moments_post"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_cp_1",
          title: "婴儿车选购核心卖点",
          category: "product",
          valueGrade: "S",
          content: "避震、一键收车、座舱宽度是父母最在意的三点。",
        },
      ],
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["video_script", "moments_post"],
      minCharsPerFormat: 80,
    },
  },
  {
    id: "cp_new_xhs_02",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿小红书笔记，显式格式驱动 new_copy",
    input: {
      rawInput: "围绕防晒霜成分写一篇小红书种草笔记。",
      agentId: "content_producer",
      targetFormats: ["xiaohongshu_post"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["xiaohongshu_post"],
    },
  },
  {
    id: "cp_new_koubo_03",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿口播稿，『出一条』关键词驱动 new_copy",
    input: {
      rawInput: "帮我出一条讲『副业起步避坑』的口播稿。",
      agentId: "content_producer",
      targetFormats: ["koubo_script"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["koubo_script"],
    },
  },
  {
    id: "cp_new_shooting_04",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿拍摄脚本",
    input: {
      rawInput: "生成一个探店短视频拍摄脚本，场景是咖啡馆。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["shooting_brief"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["shooting_brief"],
    },
  },
  {
    id: "cp_new_multi_05",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿多格式，验证格式一一对应",
    input: {
      rawInput: "创作一条关于『职场新人沟通』的内容，要视频脚本+朋友圈+社群话术。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["video_script", "moments_post", "community_message"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["video_script", "moments_post", "community_message"],
    },
  },
  {
    id: "cp_new_rawcopy_06",
    version: 1,
    agent: "content_producer",
    scenario: "new",
    entrypoint: "generate",
    description: "新稿原始文案（无 taskType，靠『写一版』关键词）",
    input: {
      rawInput: "帮我写一版母婴社群的开场白。",
      agentId: "content_producer",
      targetFormats: ["raw_copy"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["raw_copy"],
    },
  },

  // ──────────────────────────── imitate (4) ────────────────────────────
  {
    id: "cp_imitate_07",
    version: 1,
    agent: "content_producer",
    scenario: "imitate",
    entrypoint: "generate",
    description: "仿写对标爆款，hot_topic 策略",
    input: {
      rawInput: "参考这条对标爆款的结构，帮我仿写一条同主题脚本。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["video_script"],
    },
    seedContext: {
      knowledge: [],
      videoCopyBlock: "对标爆款：3秒抛冲突→身份认同→解决方案→CTA。",
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["video_script"],
    },
  },
  {
    id: "cp_imitate_08",
    version: 1,
    agent: "content_producer",
    scenario: "imitate",
    entrypoint: "generate",
    description: "对标文案重写一版（『重写』关键词 → rewrite_copy / light_edit）",
    input: {
      rawInput: "对标这条文案重写一版口播稿。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["koubo_script"],
    },
    seedContext: {
      knowledge: [],
      videoCopyBlock: "对标：用反问开头制造好奇心。",
    },
    expectations: {
      // 「重写」关键词命中 → rewrite_copy（而非 write_script 的 new_copy，
      // 因为 rewrite 检查在 new_copy 之前）。重写/改写走轻量知识策略。
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "light_edit",
      outputFormats: ["koubo_script"],
    },
  },
  {
    id: "cp_imitate_xhs_09",
    version: 1,
    agent: "content_producer",
    scenario: "imitate",
    entrypoint: "generate",
    description: "仿写小红书笔记",
    input: {
      rawInput: "按这个爆款标题套路，帮我写一篇小红书笔记。",
      agentId: "content_producer",
      targetFormats: ["xiaohongshu_post"],
    },
    seedContext: {
      knowledge: [],
      videoCopyBlock: "爆款标题套路：数字+痛点+悬念。",
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["xiaohongshu_post"],
    },
  },
  {
    id: "cp_imitate_repurpose_10",
    version: 1,
    agent: "content_producer",
    scenario: "imitate",
    entrypoint: "generate",
    description: "改写复用：把视频脚本改成朋友圈（repurpose）",
    input: {
      rawInput: "重写一下，把这条视频脚本改编成朋友圈文案。",
      agentId: "content_producer",
      taskType: "repurpose",
      targetFormats: ["moments_post"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      // “重写”关键词命中 → rewrite_copy（repurpose taskType 不单独识别）
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "light_edit",
      outputFormats: ["moments_post"],
    },
  },

  // ──────────────────────────── partial_edit (4) ────────────────────────────
  {
    id: "cp_edit_hook_11",
    version: 1,
    agent: "content_producer",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "局部改开头钩子，light_edit",
    input: {
      rawInput: "优化一下这条脚本的开头钩子，前3秒更抓人。",
      agentId: "content_producer",
      targetFormats: ["video_script"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["video_script"],
    },
  },
  {
    id: "cp_edit_ending_12",
    version: 1,
    agent: "content_producer",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "局部改结尾，light_edit",
    input: {
      rawInput: "帮我调整这条视频的结尾，收尾更自然。",
      agentId: "content_producer",
      targetFormats: ["video_script"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["video_script"],
    },
  },
  {
    id: "cp_edit_title_13",
    version: 1,
    agent: "content_producer",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "改标题，light_edit",
    input: {
      rawInput: "把这条小红书笔记的标题换个说法。",
      agentId: "content_producer",
      targetFormats: ["xiaohongshu_post"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["xiaohongshu_post"],
    },
  },
  {
    id: "cp_edit_polish_14",
    version: 1,
    agent: "content_producer",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "润色指令驱动 light_edit",
    input: {
      rawInput: "原始脚本：今天聊聊时间管理。",
      agentId: "content_producer",
      polishInstruction: "润色得更口语化一点。",
      targetFormats: ["video_script"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["video_script"],
    },
  },

  // ──────────────────────────── revision (2) ────────────────────────────
  {
    id: "cp_revise_15",
    version: 1,
    agent: "content_producer",
    scenario: "revision",
    entrypoint: "chat",
    description: "追改：在已有稿基础上要求重写一段（rewrite_copy）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿口播脚本略）" },
        { role: "user", content: "中间那段太平了，帮我重写一下，要更有冲突感。" },
      ],
      rawInput: "中间那段太平了，帮我重写一下，要更有冲突感。",
      agentId: "content_producer",
    },
    seedContext: { knowledge: [] },
    expectations: {
      // “重写”命中 → rewrite_copy
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "light_edit",
      outputFormats: [],
    },
  },
  {
    id: "cp_revise_redirect_16",
    version: 1,
    agent: "content_producer",
    scenario: "revision",
    entrypoint: "chat",
    description: "纠偏：换个开头说法（light_edit）",
    input: {
      messages: [
        { role: "assistant", content: "（上一稿略）" },
        { role: "user", content: "开头太硬了，换个说法，温柔点。" },
      ],
      rawInput: "开头太硬了，换个说法，温柔点。",
      agentId: "content_producer",
    },
    seedContext: { knowledge: [] },
    expectations: {
      // “换个说法” + 无外部上下文 → light_edit
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: [],
    },
  },

  // ──────────────────────────── cite_knowledge (2) ────────────────────────────
  {
    id: "cp_cite_product_17",
    version: 1,
    agent: "content_producer",
    scenario: "cite_knowledge",
    entrypoint: "generate",
    description: "引用产品知识库写脚本，必须引用指定知识条目",
    input: {
      rawInput: "结合产品资料，帮我写一条介绍我们扫地机器人卖点的小红书笔记。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["xiaohongshu_post"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_cp_product",
          title: "扫地机器人核心卖点",
          category: "product",
          valueGrade: "S",
          content: "激光导航、自动集尘、拖布自清洁是三大差异化卖点。",
        },
      ],
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["xiaohongshu_post"],
      mustCiteKnowledgeIds: ["k_cp_product"],
    },
  },
  {
    id: "cp_cite_persona_18",
    version: 1,
    agent: "content_producer",
    scenario: "cite_knowledge",
    entrypoint: "generate",
    description: "引用老板人设素材（persona 策略），必须引用",
    input: {
      rawInput: "结合老板的来时路和人设，写一条讲创业故事的视频脚本。",
      agentId: "content_producer",
      taskType: "write_script",
      topicType: "人设型",
      targetFormats: ["video_script"],
    },
    seedContext: {
      knowledge: [
        {
          id: "k_cp_persona",
          title: "老板来时路：三次失败与一次转折",
          category: "persona",
          valueGrade: "S",
          content: "老板从代工厂起步，经历库存危机后转型自有品牌。",
        },
      ],
    },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "persona",
      outputFormats: ["video_script"],
      mustCiteKnowledgeIds: ["k_cp_persona"],
    },
  },

  // ──────────────────────────── info_insufficient (2) ────────────────────────────
  {
    id: "cp_info_insufficient_19",
    version: 1,
    agent: "content_producer",
    scenario: "info_insufficient",
    entrypoint: "generate",
    description: "信息不足：要写脚本但没给主题/产品，应提示而非编造",
    input: {
      rawInput: "帮我写一条视频脚本。",
      agentId: "content_producer",
      taskType: "write_script",
      targetFormats: ["video_script"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["video_script"],
      mustWarnInsufficientInfo: true,
      bannedSubstrings: ["我是一个AI", "作为一个AI", "根据我的数据库"],
    },
  },
  {
    id: "cp_info_insufficient_20",
    version: 1,
    agent: "content_producer",
    scenario: "info_insufficient",
    entrypoint: "chat",
    description: "信息不足的对话：只说『写个文案』无任何主题",
    input: {
      messages: [{ role: "user", content: "写个文案" }],
      rawInput: "写个文案",
      agentId: "content_producer",
    },
    seedContext: { knowledge: [] },
    expectations: {
      // “写个”关键词 → new_copy
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: [],
      mustWarnInsufficientInfo: true,
    },
  },
]
