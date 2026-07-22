/**
 * AIM Harness v2 — 上下文来源清单构建（从 context-assembly 拆分）。
 */

import type { AimRunSpec, AimContextSource } from "./types"
import type { MethodologyPolicy } from "@/lib/methodology-profile-store"
import { sha256 } from "./hashing"

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
  taskSpec?: import("@/lib/task-spec").TaskSpec | null
}): AimContextSource[] {
  const { spec, knowledgeEntries, includedChars } = input
  const sources: AimContextSource[] = []

  // 知识条目
  for (const entry of knowledgeEntries) {
    sources.push({
      kind: "knowledge",
      id: entry.id,
      charCount: includedChars,
    })
  }

  // ── 方法论来源（系统 + 命名）──
  // 系统方法论：用实际装配 block 的内容 hash 作为 contentHash（version 等价物），
  // 这样后台编辑方法论内容后 contextHash 真正变化。
  pushBlockSource(sources, "methodology", "agent_methodology:ip_copywriting", input.methodologyBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:business_diagnosis", input.businessDiagnosisBlock)
  pushBlockSource(sources, "methodology", "agent_methodology:event_storytelling", input.eventStorytellingBlock)
  // 命名方法论：用 versionRow 的 versionId + checksum，精确到发布的版本
  for (const row of input.methodologyPolicy.versionRows) {
    sources.push({
      kind: "methodology",
      id: `named_methodology:${row.versionId}`,
      updatedAt: row.updatedAt,
      charCount: input.selectedMethodologyBlock.length,
      contentHash: row.checksum,
    })
  }

  // ── IP Wiki / 爆款结构 ──
  pushBlockSource(sources, "ip_wiki", "ip_wiki:block", input.ipWikiBlock)
  pushBlockSource(sources, "market_viral", "viral_structure", input.viralStructureBlock)

  // ── 计划模式任务单来源（workflow_brief）──
  // 当 taskSpec 存在时记录其内容哈希，使 contextHash 反映任务单变更
  if (input.taskSpec) {
    const briefJson = JSON.stringify(input.taskSpec)
    sources.push({
      kind: "workflow_brief",
      id: "workflow_brief:task_spec",
      charCount: briefJson.length,
      contentHash: sha256(briefJson),
    })
  }

  // request 来源（rawInput）始终记录，作为 contextHash 的稳定基线
  sources.push({
    kind: "request",
    id: "raw_input",
    charCount: spec.rawInput.length,
    contentHash: sha256(spec.rawInput),
  })
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
  sources.push({ kind, id, charCount: content.length, contentHash: sha256(content) })
}
