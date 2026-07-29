/**
 * AIM Harness v2 — 上下文来源清单构建（从 context-assembly 拆分）。
 */

import type { AimRunSpec, AimContextSource } from "./types"
import type { MethodologyPolicy } from "@/lib/methodology-profile-store"
import type { LoadedAimSkill } from "./skill-loader"
import { sha256 } from "./hashing"
import { resolveDefaultTrustLevel, withDefaultTrustLevel } from "./context-trust"

/** 与 buildAimSkillBlock 一致：总块上限；manifest 必须对实际注入/截断文本哈希。 */
const SKILL_BLOCK_MAX_CHARS = 6000

/**
 * 计算实际注入 prompt 的逐条 Skill 文本（含标题包装与总长截断）。
 */
export function resolveInjectedSkillSegments(
  skills: LoadedAimSkill[],
): Array<{ id: string; text: string }> {
  const segments = skills.map((skill) => ({
    id: skill.id,
    text: `【Skill:${skill.title}】\n${skill.content}`,
  }))
  const joined: string[] = []
  let used = 0
  const injected: Array<{ id: string; text: string }> = []
  for (const segment of segments) {
    const separator = joined.length ? 2 : 0 // "\n\n"
    const remaining = SKILL_BLOCK_MAX_CHARS - used - separator
    if (remaining <= 0) break
    const text = segment.text.slice(0, remaining)
    if (!text) break
    joined.push(text)
    used += separator + text.length
    injected.push({ id: segment.id, text })
  }
  return injected
}

export function buildContextManifest(input: {
  spec: AimRunSpec
  knowledgeEntries: Array<{ id: string }>
  includedChars: number
  methodologyPolicy: MethodologyPolicy
  methodologyBlock: string
  businessDiagnosisBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
  viralStructureBlock: string
  selectedMethodologyBlock: string
  /** 实际加载并注入 prompt 的 skills（已截断后的正文） */
  skills?: LoadedAimSkill[]
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}): AimContextSource[] {
  const { spec, knowledgeEntries, includedChars } = input
  const sources: AimContextSource[] = []

  // 知识条目
  for (const entry of knowledgeEntries) {
    sources.push(withDefaultTrustLevel({
      kind: "knowledge",
      id: entry.id,
      charCount: includedChars,
    }))
  }

  // ── 方法论来源（系统 + 命名）──
  pushBlockSource(sources, "methodology", "agent_methodology:ip_copywriting", input.methodologyBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:business_diagnosis", input.businessDiagnosisBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:event_storytelling", input.eventStorytellingBlock)
  for (const row of input.methodologyPolicy.versionRows) {
    sources.push(withDefaultTrustLevel({
      kind: "methodology",
      id: `named_methodology:${row.versionId}`,
      updatedAt: row.updatedAt,
      charCount: input.selectedMethodologyBlock.length,
      contentHash: row.checksum,
    }))
  }

  pushBlockSource(sources, "ip_wiki", "ip_wiki:block", input.ipWikiBlock)
  pushBlockSource(sources, "market_viral", "viral_structure", input.viralStructureBlock)

  for (const skill of resolveInjectedSkillSegments(input.skills ?? [])) {
    sources.push(withDefaultTrustLevel({
      kind: "skill",
      id: `skill:${skill.id}`,
      charCount: skill.text.length,
      contentHash: sha256(skill.text),
      trustLevel: "system_trusted",
    }))
  }

  if (input.taskSpec) {
    const briefJson = JSON.stringify(input.taskSpec)
    sources.push(withDefaultTrustLevel({
      kind: "workflow_brief",
      id: "workflow_brief:task_spec",
      charCount: briefJson.length,
      contentHash: sha256(briefJson),
    }))
  }

  sources.push(withDefaultTrustLevel({
    kind: "request",
    id: "raw_input",
    charCount: spec.rawInput.length,
    contentHash: sha256(spec.rawInput),
  }))
  return sources
}

/** 非空 block 才记进 manifest（内容 hash 作为变更追踪依据）。 */
function pushBlockSource(
  sources: AimContextSource[],
  kind: AimContextSource["kind"],
  id: string,
  content: string,
): void {
  if (!content) return
  sources.push(withDefaultTrustLevel({
    kind,
    id,
    charCount: content.length,
    contentHash: sha256(content),
    trustLevel: resolveDefaultTrustLevel(kind),
  }))
}
