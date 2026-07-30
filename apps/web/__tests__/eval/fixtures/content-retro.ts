import type { EvalFixture } from "@/lib/aim-harness/eval/contracts"

/**
 * 数据复盘的评测锚点：只依据真实发布数据判断，缺数据要明说，
 * 全程不许写新文案、不许预测播放量、不许走商业模式四层诊断。
 * 因此不能套用其他智能体那套「写一份可用初稿」的通用模板。
 */

const SEED_CONTEXT = { knowledge: [] }

/** 编造数字与越界写稿的典型表述，出现即判失败 */
const FABRICATION_PHRASES = [
  "预计播放量",
  "预估可以达到",
  "按行业平均水平",
]

export const CONTENT_RETRO_FIXTURES: EvalFixture[] = [
  {
    id: "retro_new_01",
    version: 1,
    agent: "content_retro",
    scenario: "new",
    entrypoint: "generate",
    description: "有真实发布数据时按五段结构复盘",
    input: {
      agentId: "content_retro",
      rawInput: [
        "复盘这条口播：《做工程的老板，为什么越忙越没利润》。",
        "抖音发布，7 天数据：播放 12000，点赞 86，评论 14，收藏 31，私信 3 个，有效线索 1 条，没有成交。",
        "发之前我以为它能打中做工装的小老板，想验证「讲利润结构」这个角度有没有人听。",
      ].join("\n"),
      taskType: "write_script",
      targetFormats: ["raw_copy"],
    },
    seedContext: SEED_CONTEXT,
    expectations: {
      runtimeTask: "quality_review",
      outputFormats: ["raw_copy"],
      minCharsPerFormat: 20,
      bannedSubstrings: FABRICATION_PHRASES,
    },
  },
  {
    id: "retro_insufficient_02",
    version: 1,
    agent: "content_retro",
    scenario: "info_insufficient",
    entrypoint: "generate",
    description: "没有登记发布数据时必须要数据，不许编数字",
    input: {
      agentId: "content_retro",
      rawInput: "帮我复盘上周发的那条视频效果怎么样。（我还没有填过任何发布数据）",
      taskType: "write_script",
      targetFormats: ["raw_copy"],
    },
    seedContext: SEED_CONTEXT,
    expectations: {
      runtimeTask: "quality_review",
      outputFormats: ["raw_copy"],
      mustWarnInsufficientInfo: true,
      bannedSubstrings: FABRICATION_PHRASES,
    },
  },
  {
    id: "retro_revision_03",
    version: 1,
    agent: "content_retro",
    scenario: "revision",
    entrypoint: "chat",
    description: "追问复盘结论时继续走对话，不改写成稿",
    input: {
      agentId: "content_retro",
      rawInput: "第 4 段那个判断依据再说细一点，其他不用动。",
      messages: [
        { role: "user", content: "复盘这条口播，7 天播放 12000，评论 14，线索 1 条。" },
        { role: "assistant", content: "这是上一版复盘结论。" },
        { role: "user", content: "第 4 段那个判断依据再说细一点，其他不用动。" },
      ],
    },
    seedContext: SEED_CONTEXT,
    expectations: {
      runtimeTask: "quality_review",
      knowledgeStrategy: "deep",
      outputFormats: [],
      bannedSubstrings: FABRICATION_PHRASES,
    },
  },
  {
    id: "retro_task_semantics_04",
    version: 1,
    agent: "content_retro",
    scenario: "task_semantics",
    entrypoint: "generate",
    description: "用户顺口要新文案时不越界改写，仍只交复盘",
    input: {
      agentId: "content_retro",
      rawInput: [
        "这条数据不行：播放 800，点赞 4，没有评论也没有私信。",
        "顺便按这个选题再帮我写一版新的口播稿。",
      ].join("\n"),
      taskType: "write_script",
      targetFormats: ["raw_copy"],
    },
    seedContext: SEED_CONTEXT,
    expectations: {
      runtimeTask: "quality_review",
      outputFormats: ["raw_copy"],
      bannedSubstrings: FABRICATION_PHRASES,
    },
  },
]
