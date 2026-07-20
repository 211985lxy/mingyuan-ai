import { prisma } from "@/lib/prisma"
import type { AimAgentId } from "@/lib/aim-ui-config"
import { AIM_AGENT_OPTIONS } from "@/lib/aim-ui-config"
import { AIM_AGENT_GUIDES, type AimAgentGuide } from "@/lib/aim-agent-guides"

/**
 * 智能体展示文案覆盖层（仅 UI，不参与执行）。
 *
 * 复用 SystemSetting 表，key 命名 `agent_guide.{agentId}.{field}`。
 * 仅覆盖展示性字段（intro/placeholder/primaryActionLabel/scenarios/quickPrompts/outputAssets）。
 *
 * 注意：执行路径用的是 aim-agent-handlers.ts 里的系统提示词，与 guide 文案无关，
 * 因此编辑这些字段只影响前台展示，不影响生成质量——符合"只整理展示文案"的范围。
 */

const SETTING_PREFIX = "agent_guide"
const SETTING_CATEGORY = "agent_guides"

/** 可编辑的展示字段（defaultInstruction 不纳入，它语义上是执行指令） */
const EDITABLE_FIELDS = [
  "intro",
  "placeholder",
  "primaryActionLabel",
] as const

function settingKey(agentId: string, field: string): string {
  return `${SETTING_PREFIX}.${agentId}.${field}`
}

/** 取单个智能体的合并文案（TS 默认 + DB 覆盖） */
/**
 * @description 获取agentguidewithoverrides
 * @param agentId - 智能体 ID
 * @returns Promise<AimAgentGuide &
 */
export async function getAgentGuideWithOverrides(
  agentId: AimAgentId
): Promise<AimAgentGuide & { _overriddenFields: string[] }> {
  const base = AIM_AGENT_GUIDES[agentId]
  const overriddenFields: string[] = []

  const rows = await prisma.systemSetting
    .findMany({
      where: { key: { startsWith: `${SETTING_PREFIX}.${agentId}.` } },
      take: 20,
    })
    .catch(() => [])

  const overrideMap = new Map<string, string>()
  for (const row of rows) {
    const field = row.key.split(".").slice(2).join(".")
    overrideMap.set(field, row.value)
  }

  const merged = { ...base } as Record<string, unknown>
  for (const field of EDITABLE_FIELDS) {
    const v = overrideMap.get(field)
    if (v !== undefined && v !== "") {
      merged[field] = v
      overriddenFields.push(field)
    }
  }
  // quickPrompts / scenarios / outputAssets 是数组，用 json 存储
  for (const arrField of ["quickPrompts", "scenarios", "outputAssets"] as const) {
    const v = overrideMap.get(arrField)
    if (v) {
      try {
        const arr = JSON.parse(v)
        if (Array.isArray(arr) && arr.every((x) => typeof x === "string")) {
          merged[arrField] = arr
          overriddenFields.push(arrField)
        }
      } catch {
        // 非法 JSON 忽略
      }
    }
  }

  return { ...(merged as unknown as AimAgentGuide), _overriddenFields: overriddenFields }
}

/** 列出全部智能体文案（合并默认 + 覆盖） */
/**
 * @description 列出agentguides
 * @returns 无返回值
 */
export async function listAgentGuides() {
  return Promise.all(
    AIM_AGENT_OPTIONS.map(async (a) => {
      const guide = await getAgentGuideWithOverrides(a.id)
      return {
        agentId: a.id,
        title: a.title,
        description: a.description,
        guide,
      }
    })
  )
}

/** 更新单个字段覆盖 */
/**
 * @description 设置agentguidefield
 * @param agentId - 智能体 ID
 * @param field - 字段
 * @param value - 值
 * @param updatedBy - updatedBy
 * @returns 无返回值
 */
export async function setAgentGuideField(
  agentId: AimAgentId,
  field: string,
  value: string,
  updatedBy: string
) {
  const key = settingKey(agentId, field)
  await prisma.systemSetting.upsert({
    where: { key },
    create: {
      key,
      value,
      type: ["intro", "placeholder", "primaryActionLabel"].includes(field) ? "string" : "json",
      category: SETTING_CATEGORY,
      description: `智能体 ${agentId} 的 ${field} 文案`,
      updatedBy,
    },
    update: { value, updatedBy },
  })
}

/** 清除单个字段覆盖（回退到 TS 默认） */
/**
 * @description 清除agentguidefield
 * @param agentId - 智能体 ID
 * @param field - 字段
 * @returns 无返回值
 */
export async function clearAgentGuideField(agentId: AimAgentId, field: string) {
  const key = settingKey(agentId, field)
  try {
    await prisma.systemSetting.delete({ where: { key } })
  } catch {
    // 不存在即视为已清除
  }
}
