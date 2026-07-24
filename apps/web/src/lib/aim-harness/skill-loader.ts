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
    agentIds: ["deep_copywriter", "content_producer", "free_copywriter"],
    runtimeTasks: ["new_copy", "rewrite_copy", "light_edit"],
    maxChars: 2500,
  },
  {
    id: "business-diagnosis",
    title: "商业定位诊断方法论",
    relativePath: "docs/methodologies/business-diagnosis-methodology-core.md",
    agentIds: ["business_diagnosis", "business_system_diagnosis", "persona"],
    runtimeTasks: ["positioning_topic", "new_copy"],
    maxChars: 2500,
  },
  {
    id: "event-storytelling",
    title: "事件叙事方法论",
    relativePath: "docs/methodologies/event-storytelling-methodology-core.md",
    agentIds: ["content_producer", "deep_copywriter"],
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

/**
 * @description 选择匹配当前 agent/task 的 Skill
 */
export function selectAimSkills(input: {
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
}): AimSkillRef[] {
  return AIM_SKILL_CATALOG.filter((skill) => {
    if (!skill.agentIds.includes(input.agentId)) return false
    if (!skill.runtimeTasks || skill.runtimeTasks.length === 0) return true
    return skill.runtimeTasks.includes(input.runtimeTask)
  })
}

/**
 * @description 加载 Skill 正文（文件缺失则跳过，不抛错）
 */
export async function loadAimSkills(input: {
  agentId: AimAgentId
  runtimeTask: AimRuntimeTask
  enabled?: boolean
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
