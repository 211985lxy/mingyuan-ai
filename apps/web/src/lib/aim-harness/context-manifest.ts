/**
 * AIM Harness v2 — 上下文来源清单构建（从 context-assembly 拆分）。
 */

import type { AimRunSpec, AimContextSource } from "./types"
import type { MethodologyPolicy } from "@/lib/methodology-profile-store"
import type { LoadedAimSkill } from "./skill-loader"
import { sha256 } from "./hashing"
import { resolveDefaultTrustLevel, withDefaultTrustLevel } from "./context-trust"

/**
 * 从最终 budgeted methodology block 提取实际存在的 Skill 片段。
 * 预算裁剪后未注入的 skill 不记录；部分截断则对截断后准确文本哈希。
 */
export function extractSkillsFromBudgetedBlock(
  budgetedMethodologyBlock: string,
  skills: LoadedAimSkill[],
): Array<{ id: string; text: string }> {
  if (!budgetedMethodologyBlock || !skills.length) return []
  const injected: Array<{ id: string; text: string }> = []
  for (const skill of skills) {
    const header = `【Skill:${skill.title}】`
    const start = budgetedMethodologyBlock.indexOf(header)
    if (start < 0) continue
    const afterHeader = start + header.length
    const next = budgetedMethodologyBlock.indexOf("【Skill:", afterHeader)
    let end = next >= 0 ? next : budgetedMethodologyBlock.length
    if (next >= 0 && budgetedMethodologyBlock.slice(Math.max(0, next - 2), next) === "\n\n") {
      end = next - 2
    }
    const text = budgetedMethodologyBlock.slice(start, end)
    if (!text.startsWith(header)) continue
    injected.push({ id: skill.id, text })
  }
  return injected
}

/** @deprecated 仅兼容旧测试；正式路径请用 extractSkillsFromBudgetedBlock */
export function resolveInjectedSkillSegments(
  skills: LoadedAimSkill[],
): Array<{ id: string; text: string }> {
  const block = skills
    .map((skill) => `【Skill:${skill.title}】\n${skill.content}`)
    .join("\n\n")
    .slice(0, 6000)
  return extractSkillsFromBudgetedBlock(block, skills)
}

export function buildContextManifest(input: {
  spec: AimRunSpec
  knowledgeEntries: Array<{ id: string }>
  includedChars: number
  methodologyPolicy: MethodologyPolicy
  /** 最终注入 prompt 的 methodology 块（已预算裁剪，可能含 Skill） */
  methodologyBlock: string
  businessDiagnosisBlock: string
  eventStorytellingBlock: string
  ipWikiBlock: string
  viralStructureBlock: string
  selectedMethodologyBlock: string
  /** 写作风格档案（与 chat 清单 id=style_profile 对齐） */
  styleProfileBlock?: string
  /** 加载过的 skills；仅当预算后 methodologyBlock 仍含其片段才记入 manifest */
  skills?: LoadedAimSkill[]
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}): AimContextSource[] {
  const { spec, knowledgeEntries, includedChars } = input
  const sources: AimContextSource[] = []

  for (const entry of knowledgeEntries) {
    sources.push(withDefaultTrustLevel({
      kind: "knowledge",
      id: entry.id,
      charCount: includedChars,
    }))
  }

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
  // 与 chat context-assembly 一致：kind=methodology, id=style_profile
  pushBlockSource(sources, "methodology", "style_profile", input.styleProfileBlock ?? "")

  for (const skill of extractSkillsFromBudgetedBlock(
    input.methodologyBlock,
    input.skills ?? [],
  )) {
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
