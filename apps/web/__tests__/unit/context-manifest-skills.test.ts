import { describe, expect, it } from "vitest"
import {
  buildContextManifest,
  extractSkillsFromBudgetedBlock,
} from "@/lib/aim-harness/context-manifest"
import { sha256 } from "@/lib/aim-harness/hashing"
import { resolveDefaultTrustLevel } from "@/lib/aim-harness/context-trust"
import type { AimRunSpec } from "@/lib/aim-harness/types"

const baseSpec = {
  entrypoint: "generate",
  agentId: "content_producer",
  runtimeTask: "new_copy",
  knowledgeStrategy: { mode: "project", maxEntries: 5 },
  outputFormats: ["video_script"],
  contextPolicy: { maxChars: 8000 },
  modelPolicy: {
    temperature: 0.2,
    maxTokens: 1000,
    targetCapability: "standard",
    minimumCapability: "standard",
    maxProviderAttempts: 1,
  },
  rawInput: "写一条口播",
  executionPolicy: {
    mode: "single_shot",
    allowedToolNames: [],
    maxSteps: 1,
    timeoutMs: 1000,
    maxAutoRetries: 0,
  },
} as unknown as AimRunSpec

const skills = [
  { id: "ip-copywriting", title: "IP", content: "A".repeat(100) },
  { id: "event-storytelling", title: "事件", content: "B".repeat(100) },
]

describe("skill context manifest", () => {
  it("skill/system 默认为 system_trusted", () => {
    expect(resolveDefaultTrustLevel("skill")).toBe("system_trusted")
    expect(resolveDefaultTrustLevel("system")).toBe("system_trusted")
  })

  it("只记录 budgeted methodology 中实际存在的 skill 片段", () => {
    const full = [
      `【Skill:IP】\n${skills[0]!.content}`,
      `【Skill:事件】\n${skills[1]!.content}`,
    ].join("\n\n")
    const sources = buildContextManifest({
      spec: baseSpec,
      knowledgeEntries: [],
      includedChars: 0,
      methodologyPolicy: { source: "none", selections: [], versionRows: [] },
      methodologyBlock: full,
      businessDiagnosisBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      viralStructureBlock: "",
      selectedMethodologyBlock: "",
      skills,
    })
    const skillSources = sources.filter((source) => source.kind === "skill")
    expect(skillSources.map((source) => source.id)).toEqual([
      "skill:ip-copywriting",
      "skill:event-storytelling",
    ])
    expect(skillSources[0]?.contentHash).toBe(
      sha256(`【Skill:IP】\n${skills[0]!.content}`),
    )
  })

  it("预算截掉第二条 skill 时不得记录", () => {
    const firstOnly = `【Skill:IP】\n${skills[0]!.content}`
    const injected = extractSkillsFromBudgetedBlock(firstOnly, skills)
    expect(injected.map((row) => row.id)).toEqual(["ip-copywriting"])
    const sources = buildContextManifest({
      spec: baseSpec,
      knowledgeEntries: [],
      includedChars: 0,
      methodologyPolicy: { source: "none", selections: [], versionRows: [] },
      methodologyBlock: firstOnly,
      businessDiagnosisBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      viralStructureBlock: "",
      selectedMethodologyBlock: "",
      skills,
    })
    expect(sources.filter((source) => source.kind === "skill").map((s) => s.id))
      .toEqual(["skill:ip-copywriting"])
  })

  it("预算部分截断时 contentHash/charCount 对截断后准确文本计算", () => {
    const truncated = `【Skill:IP】\n${"A".repeat(40)}`
    const injected = extractSkillsFromBudgetedBlock(truncated, skills)
    expect(injected).toEqual([{ id: "ip-copywriting", text: truncated }])
    const sources = buildContextManifest({
      spec: baseSpec,
      knowledgeEntries: [],
      includedChars: 0,
      methodologyPolicy: { source: "none", selections: [], versionRows: [] },
      methodologyBlock: truncated,
      businessDiagnosisBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      viralStructureBlock: "",
      selectedMethodologyBlock: "",
      skills,
    })
    const skill = sources.find((source) => source.kind === "skill")
    expect(skill).toEqual(expect.objectContaining({
      id: "skill:ip-copywriting",
      charCount: truncated.length,
      contentHash: sha256(truncated),
    }))
  })

  it("预算完全移除 Skill 时不写 skill manifest", () => {
    const sources = buildContextManifest({
      spec: baseSpec,
      knowledgeEntries: [],
      includedChars: 0,
      methodologyPolicy: { source: "none", selections: [], versionRows: [] },
      methodologyBlock: "只剩方法论正文，没有 Skill",
      businessDiagnosisBlock: "",
      eventStorytellingBlock: "",
      ipWikiBlock: "",
      viralStructureBlock: "",
      selectedMethodologyBlock: "",
      skills,
    })
    expect(sources.some((source) => source.kind === "skill")).toBe(false)
  })
})
