import type { EvalFixture } from "@/lib/aim-harness/eval/contracts"

type SupportingAgent = "free_copywriter" | "business_system_diagnosis" | "content_review"

function runtimeFor(agent: SupportingAgent, fallback: EvalFixture["expectations"]["runtimeTask"]) {
  return agent === "content_review" ? "quality_review" as const : fallback
}

function fixturesFor(agent: SupportingAgent, prefix: string, label: string): EvalFixture[] {
  const seedContext = { knowledge: [] }
  return [
    {
      id: `${prefix}_new_01`,
      version: 1,
      agent,
      scenario: "new",
      entrypoint: "generate",
      description: `${label}新任务`,
      input: {
        agentId: agent,
        rawInput: `请用${label}完成一份可直接使用的初稿，主题是小企业用 AI 整理客户资料。`,
        taskType: "write_script",
        targetFormats: ["raw_copy"],
      },
      seedContext,
      expectations: {
        runtimeTask: runtimeFor(agent, "new_copy"),
        outputFormats: ["raw_copy"],
        minCharsPerFormat: 20,
      },
    },
    {
      id: `${prefix}_edit_02`,
      version: 1,
      agent,
      scenario: "partial_edit",
      entrypoint: "generate",
      description: `${label}局部修改`,
      input: {
        agentId: agent,
        rawInput: "原稿：AI 可以帮助企业提升效率，但这段表达太空。",
        polishInstruction: "只修改开头，让它更具体，不要改动其他信息。",
        targetFormats: ["raw_copy"],
      },
      seedContext,
      expectations: {
        runtimeTask: runtimeFor(agent, "light_edit"),
        knowledgeStrategy: "light_edit",
        outputFormats: ["raw_copy"],
      },
    },
    {
      id: `${prefix}_revision_03`,
      version: 1,
      agent,
      scenario: "revision",
      entrypoint: "chat",
      description: `${label}追改对话`,
      input: {
        agentId: agent,
        rawInput: "把上一版第一段改得更口语化，结论保持不变。",
        messages: [
          { role: "user", content: "先给我一版初稿。" },
          { role: "assistant", content: "这是上一版初稿。" },
          { role: "user", content: "把上一版第一段改得更口语化，结论保持不变。" },
        ],
      },
      seedContext,
      expectations: {
        runtimeTask: runtimeFor(agent, "light_edit"),
        knowledgeStrategy: agent === "content_review" ? "deep" : "light_edit",
        outputFormats: [],
      },
    },
    {
      id: `${prefix}_insufficient_04`,
      version: 1,
      agent,
      scenario: "info_insufficient",
      entrypoint: "generate",
      description: `${label}信息不足时禁止编造`,
      input: {
        agentId: agent,
        rawInput: "根据我们公司去年的真实成交数据写结论，但我还没有提供任何数据。",
        taskType: "write_script",
        targetFormats: ["raw_copy"],
      },
      seedContext,
      expectations: {
        runtimeTask: runtimeFor(agent, "new_copy"),
        outputFormats: ["raw_copy"],
        mustWarnInsufficientInfo: true,
        bannedSubstrings: ["根据去年的成交数据可以看出"],
      },
    },
  ]
}

export const SUPPORTING_AGENT_FIXTURES: EvalFixture[] = [
  ...fixturesFor("free_copywriter", "fc", "自由文案官"),
  ...fixturesFor("business_system_diagnosis", "bsd", "生意系统诊断官"),
  ...fixturesFor("content_review", "cr", "内容质检官"),
]
