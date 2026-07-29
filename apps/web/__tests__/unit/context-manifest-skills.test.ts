import { describe, expect, it } from "vitest"
import {
  buildContextManifest,
  resolveInjectedSkillSegments,
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

describe("skill context manifest", () => {
  it("skill/system 默认为 system_trusted", () => {
    expect(resolveDefaultTrustLevel("skill")).toBe("system_trusted")
    expect(resolveDefaultTrustLevel("system")).toBe("system_trusted")
  })

  it("为实际注入的 skill 写入 skill:<id>，contentHash 对截断文本计算", () => {
    const skills = [
      { id: "ip-copywriting", title: "IP", content: "A".repeat(100) },
      { id: "event-storytelling", title: "事件", content: "B".repeat(100) },
    ]
    const injected = resolveInjectedSkillSegments(skills)
    const sources = buildContextManifest({
      spec: baseSpec,
      knowledgeEntries: [],
      includedChars: 0,
      methodologyPolicy: { source: "none", selections: [], versionRows: [] },
      methodologyBlock: "",
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
    expect(skillSources[0]).toEqual(expect.objectContaining({
      charCount: injected[0]!.text.length,
      contentHash: sha256(injected[0]!.text),
      trustLevel: "system_trusted",
    }))
  })
})
