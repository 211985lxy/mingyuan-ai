/**
 * Skill / 岗位手册按需加载（缺口升级阶段 D）。
 * 真源：仓库 docs/methodologies 下已发布 Markdown；按 agent/runtimeTask 映射注入。
 */

import { readFile } from "node:fs/promises"
import path from "node:path"

import type { AimAgentId } from "@/lib/aim-harness/contracts"
import type { AimRuntimeTask } from "@/lib/aim-knowledge-strategy"

export interface AimSkillRef {
  id: string
  title: string
  /** 相对仓库根的路径 */
  relativePath: string
  agentIds: AimAgentId[]
  runtimeTasks?: AimRuntimeTask[]
  maxChars: number
}

/** 已发布 Skill 目录（相对 monorepo / mingyuan 根由调用方解析）。 */
export const AIM_SKILL_CATALOG: readonly AimSkillRef[] = [
  {
    id: "ip-copywriting",
    title: "IP 文案方法论",
    relativePath: "docs/methodologies/ip-copywriting-methodology-core.md",
    agentIds: ["work_editor", "content_producer", "free_copywriter"],
    runtimeTasks: ["new_copy", "rewrite_copy", "light_edit"],
    maxChars: 2500,
  },
  {
    id: "business-diagnosis",
    title: "商业定位诊断方法论",
    relativePath: "docs/methodologies/business-diagnosis-methodology-core.md",
    agentIds: ["business_diagnosis", "business_system_diagnosis"],
    runtimeTasks: ["positioning_topic", "new_copy"],
    maxChars: 2500,
  },
  {
    id: "event-storytelling",
    title: "事件叙事方法论",
    relativePath: "docs/methodologies/event-storytelling-methodology-core.md",
    agentIds: ["content_producer", "work_editor"],
    runtimeTasks: ["new_copy", "rewrite_copy"],
    maxChars: 1800,
  },
]

export interface LoadedAimSkill {
  id: string
  title: string
  content: string
}

function repoRootCandidates(): string[] {
  // apps/web → mingyuan 根；worktree 同构
  return [
    path.resolve(process.cwd(), "../.."),
    path.resolve(process.cwd(), ".."),
    process.cwd(),
  ]
}

/** 方法论信号 → AimSkillRef.id 映射：内容创作类方法论 skill 按用户显式选择注入 */
const METHODOLOGY_SIGNAL_TO_SKILL_ID: Record<string, string> = {
  ip_copywriting: "ip-copywriting",
  event_storytelling: "event-storytelling",
}

/** 受信号门控的 skill id：默认不自动加载，只有用户点了对应技能才注入 */
const SIGNAL_GATED_SKILL_IDS = new Set(Object.values(METHODOLOGY_SIGNAL_TO_SKILL_ID))

/**
 * @description 选择匹配当前 agent/task 的 Skill
 */
export function selectAimSkills(input: {
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  /** 方法论类技能信号：命中则加载对应方法论 skill；缺省时信号门控类 skill 不自动加载 */
  methodologySignals?: Set<string>
  ignoreRuntimeTask?: boolean
}): AimSkillRef[] {
  const gatedEnabled = new Set<string>(
    Array.from(input.methodologySignals ?? [])
      .map((signal) => METHODOLOGY_SIGNAL_TO_SKILL_ID[signal])
      .filter((value): value is string => Boolean(value)),
  )
  return AIM_SKILL_CATALOG.filter((skill) => {
    if (!skill.agentIds.includes(input.agentId)) return false
    if (!skill.runtimeTasks || skill.runtimeTasks.length === 0) return true
    if (!input.ignoreRuntimeTask && !skill.runtimeTasks.includes(input.runtimeTask)) return false
    // 受信号门控的方法论 skill：只有用户显式点了对应技能才加载，默认不自动挂
    if (SIGNAL_GATED_SKILL_IDS.has(skill.id)) return gatedEnabled.has(skill.id)
    return true
  })
}

/**
 * @description 加载 Skill 正文（文件缺失则跳过，不抛错）
 */
export async function loadAimSkills(input: {
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  enabled?: boolean
  /** 方法论类技能信号：命中则加载对应方法论 skill */
  methodologySignals?: Set<string>
  ignoreRuntimeTask?: boolean
}): Promise<LoadedAimSkill[]> {
  if (input.enabled === false) return []
  const selected = selectAimSkills(input)
  const loaded: LoadedAimSkill[] = []
  for (const skill of selected) {
    let content = ""
    for (const root of repoRootCandidates()) {
      try {
        const full = path.join(root, skill.relativePath)
        content = await readFile(full, "utf8")
        break
      } catch {
        // try next root
      }
    }
    if (!content.trim()) continue
    loaded.push({
      id: skill.id,
      title: skill.title,
      content: content.trim().slice(0, skill.maxChars),
    })
  }
  return loaded
}

/**
 * @description 拼成可注入 prompt 的 Skill 块
 */
export function buildAimSkillBlock(skills: LoadedAimSkill[]): string {
  if (!skills.length) return ""
  return skills
    .map((skill) => `【Skill:${skill.title}】\n${skill.content}`)
    .join("\n\n")
    .slice(0, 6000)
}
