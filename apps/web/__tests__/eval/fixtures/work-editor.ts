/**
 * work_editor eval fixtures (15 cases).
 *
 * 作品编辑：文字二改/润色、公众号排版、小红书图文改写、局部改稿与追改。
 * 深度长文新写已并入 content_producer。
 *
 * Coverage: polish 5 | layout 4 | xhs 2 | partial_edit 2 | revision 2
 */
import type { EvalFixture } from "@/lib/aim-harness/eval/contracts"

export const WORK_EDITOR_FIXTURES: EvalFixture[] = [
  {
    id: "we_polish_01",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "文字二改/润色：去 AI 味，保真",
    input: {
      rawInput: "【成稿】我们始终坚信，只有把客户价值做到极致，才能赢得市场的尊重。",
      agentId: "work_editor",
      polishInstruction: "请对上面成稿做文字二改/润色，去 AI 味，保留立场和事实。",
      targetFormats: ["raw_copy"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_polish_02",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "润色：纠正病句，不扩写成长文",
    input: {
      rawInput: "润色这段话，别改意思：今天我们开会讨论了关于如何提升转化的一些问题，然后大家觉得需要再优化一下。",
      agentId: "work_editor",
      messages: [
        { role: "user", content: "润色这段话，别改意思：今天我们开会讨论了关于如何提升转化的一些问题，然后大家觉得需要再优化一下。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_polish_03",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "润色：用户明确要求保篇幅",
    input: {
      rawInput: "别越改越短，保持原稿体量，只去 AI 味：\n\n" + "这是一段需要润色的成稿。".repeat(40),
      agentId: "work_editor",
      polishInstruction: "别越改越短，保持原稿体量，只去 AI 味。",
      targetFormats: ["raw_copy"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_polish_04",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "润色指令驱动 light_edit",
    input: {
      rawInput: "原始成稿：今天聊聊内容复利。",
      agentId: "work_editor",
      polishInstruction: "润色得更口语化一点。",
      targetFormats: ["raw_copy"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_polish_05",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "润色：去套话",
    input: {
      rawInput: "把这段润色一下，去掉套话：综上所述，企业应当构建系统性的内容资产。",
      agentId: "work_editor",
      messages: [
        { role: "user", content: "把这段润色一下，去掉套话：综上所述，企业应当构建系统性的内容资产。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_wechat_layout_06",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "公众号排版：补小标题与配图位",
    input: {
      rawInput: "把下面成稿整理成公众号排版，补小标题，标注配图位置：\n\n开头钩子……中间论述……结尾引导……",
      agentId: "work_editor",
      polishInstruction: "整理成公众号排版，补小标题，标注配图位置。",
      targetFormats: ["wechat_article"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      // 「公众号」会触发交付物信号 → new_copy；有 polishInstruction → 知识仍走 light_edit
      runtimeTask: "new_copy",
      knowledgeStrategy: "light_edit",
      outputFormats: ["wechat_article"],
    },
  },
  {
    id: "we_wechat_layout_07",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "公众号排版：优化段落长度",
    input: {
      rawInput: "这段太长了，按公众号可读性重排，不要改观点：\n\n" + "观点段落。".repeat(80),
      agentId: "work_editor",
      messages: [
        {
          role: "user",
          content: "这段太长了，按公众号可读性重排，不要改观点：\n\n" + "观点段落。".repeat(80),
        },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_wechat_layout_08",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "公众号排版追改：小标题再口语一点",
    input: {
      rawInput: "上面那版公众号排版的小标题再口语一点，正文别动。",
      agentId: "work_editor",
      messages: [
        { role: "assistant", content: "## 第一章\n正文……\n【配图：办公室对话】" },
        { role: "user", content: "上面那版公众号排版的小标题再口语一点，正文别动。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "new_copy",
      knowledgeStrategy: "deep",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_wechat_layout_09",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "公众号排版追改：补结尾引导",
    input: {
      rawInput: "给上面排版稿补一个结尾引导关注，不要整篇重写。",
      agentId: "work_editor",
      messages: [
        { role: "assistant", content: "## 开篇\n正文……" },
        { role: "user", content: "给上面排版稿补一个结尾引导关注，不要整篇重写。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_xhs_10",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "generate",
    description: "小红书图文改写：标题封面正文逐页脚本",
    input: {
      rawInput: "把下面成稿改成小红书图文笔记，给标题、封面、正文、话题和 8 页脚本：\n\n我们做私域陪跑的三个真实坑。",
      agentId: "work_editor",
      polishInstruction: "改成小红书图文笔记，给标题、封面、正文、话题和 8 页脚本。",
      targetFormats: ["raw_copy"],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_xhs_11",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "小红书图文：每页只讲一个信息点",
    input: {
      rawInput: "按小红书图文结构改写这段，每页一个点：\n\n如何在一周内理清内容主线。",
      agentId: "work_editor",
      messages: [
        {
          role: "user",
          content: "按小红书图文结构改写这段，每页一个点：\n\n如何在一周内理清内容主线。",
        },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_edit_opening_12",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "局部改：只改开头",
    input: {
      rawInput: "只改开头第一句，正文主体保留：\n\n开头：今天跟大家聊个话题。\n正文：……",
      agentId: "work_editor",
      messages: [
        {
          role: "user",
          content: "只改开头第一句，正文主体保留：\n\n开头：今天跟大家聊个话题。\n正文：……",
        },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_edit_closing_13",
    version: 1,
    agent: "work_editor",
    scenario: "partial_edit",
    entrypoint: "chat",
    description: "局部改：只改结尾",
    input: {
      rawInput: "只把结尾改得更有行动号召，前面别动。",
      agentId: "work_editor",
      messages: [
        { role: "assistant", content: "成稿正文……最后一句：谢谢观看。" },
        { role: "user", content: "只把结尾改得更有行动号召，前面别动。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_revise_14",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "追改：上一版润色太短，恢复体量",
    input: {
      rawInput: "上一版润色太短了，按原稿体量再改一版，别压缩。",
      agentId: "work_editor",
      messages: [
        { role: "user", content: "润色这篇长成稿" },
        { role: "assistant", content: "短版润色结果。" },
        { role: "user", content: "上一版润色太短了，按原稿体量再改一版，别压缩。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "light_edit",
      knowledgeStrategy: "light_edit",
      outputFormats: ["raw_copy"],
    },
  },
  {
    id: "we_revise_15",
    version: 1,
    agent: "work_editor",
    scenario: "revision",
    entrypoint: "chat",
    description: "追改：小红书标题再冲一点",
    input: {
      rawInput: "标题再冲一点，正文和分页别动。",
      agentId: "work_editor",
      messages: [
        { role: "assistant", content: "标题1……\n封面……\n第1页……" },
        { role: "user", content: "标题再冲一点，正文和分页别动。" },
      ],
    },
    seedContext: { knowledge: [] },
    expectations: {
      runtimeTask: "rewrite_copy",
      knowledgeStrategy: "rewrite",
      outputFormats: ["raw_copy"],
    },
  },
]
