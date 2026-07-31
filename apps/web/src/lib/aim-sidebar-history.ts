import {
  DEFAULT_AIM_AGENT,
  isValidAimAgent,
  type AimAgentId,
} from "@/lib/aim-ui-config"
import type { AimGeneration } from "@/lib/api/client"

/** 每个专家展开后最多展示的最近任务数 */
export const RECENT_ITEMS_PER_AGENT = 8

/** localStorage：用户手动展开/收起的专家 id */
export const AIM_SIDEBAR_EXPANDED_KEY = "mingyuan.aim-sidebar.expanded-agents"

const AIM_SIDEBAR_EXPANDED_EVENT = "mingyuan:aim-sidebar-expanded"

export type AimHistoryListItem = Pick<
  AimGeneration,
  | "id"
  | "agentId"
  | "rawInput"
  | "topicTitle"
  | "createdAt"
  | "updatedAt"
  | "videoScript"
  | "rawCopy"
  | "wechatArticle"
  | "momentsPost"
  | "communityMessage"
>

/** 旧别名归一到当前专家 id；非法/空则返回 null（不串台到默认专家） */
export function normalizeSidebarAgentId(agentId: string | null | undefined): AimAgentId | null {
  if (agentId === "ip_video") return "content_producer"
  if (agentId === "deep_copywriter") return "work_editor"
  if (isValidAimAgent(agentId)) return agentId
  return null
}

export function formatHistoryDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ""
  return date.toISOString().slice(5, 10)
}

function compactHistoryTheme(text: string) {
  const clean = text
    .replace(/#\S+/g, "")
    .replace(/[《》"“”']/g, "")
    .replace(/\s+/g, " ")
    .trim()
  const firstClause = clean.split(/[。；;，,]/).find((part) => part.trim().length >= 4)?.trim() || clean
  if (/AI/.test(firstClause) && /提升认知|认知/.test(firstClause) && /心法|方法/.test(firstClause)) {
    return "AI提升认知三心法"
  }
  if (/Codex|AI变现工作台/.test(firstClause) && /工作台|变现/.test(firstClause)) {
    return "Codex AI变现工作台"
  }
  return firstClause.slice(0, 48)
}

export function extractHistoryTheme(input: string) {
  const lines = input.split("\n").map((line) => line.trim()).filter(Boolean)
  const lastUserLine = [...lines].reverse().find((line) => line.startsWith("用户："))
  if (lastUserLine) return compactHistoryTheme(lastUserLine.replace(/^用户：\s*/, ""))
  const labeled = lines.find((line) => /^(对标标题|选题|主题|标题)[:：]/.test(line))
  if (labeled) return compactHistoryTheme(labeled.replace(/^(对标标题|选题|主题|标题)[:：]\s*/, ""))

  const content = lines
    .filter((line) => !/^请基于|^创作原则|^改写原则|^\d+[.、]/.test(line))
    .find((line) => line.length > 8)
  return compactHistoryTheme(content || input)
}

function getHistoryFormatLabel(item: AimHistoryListItem) {
  if (item.videoScript) return "口播"
  if (item.wechatArticle) return "公众号"
  if (item.momentsPost) return "朋友圈"
  if (item.communityMessage) return "社群"
  if (item.rawCopy) return "文案"
  return ""
}

export function formatHistoryTitle(item: AimHistoryListItem) {
  const theme = compactHistoryTheme(item.topicTitle || extractHistoryTheme(item.rawInput))
  const format = getHistoryFormatLabel(item)
  return format ? `${format}｜${theme}` : theme
}

/**
 * 一次拉到的历史按专家分组；无 agentId 的旧记录不进任何专家下，避免串台。
 */
export function groupHistoryByAgent(
  history: AimHistoryListItem[],
  agentIds: readonly AimAgentId[],
  limitPerAgent = RECENT_ITEMS_PER_AGENT,
): Map<AimAgentId, AimHistoryListItem[]> {
  const ranked = [...history].sort((a, b) => {
    const aTime = new Date(a.updatedAt || a.createdAt).getTime()
    const bTime = new Date(b.updatedAt || b.createdAt).getTime()
    return bTime - aTime
  })

  const grouped = new Map<AimAgentId, AimHistoryListItem[]>()
  for (const agentId of agentIds) grouped.set(agentId, [])

  for (const item of ranked) {
    const agentId = normalizeSidebarAgentId(item.agentId)
    if (!agentId) continue
    const bucket = grouped.get(agentId)
    if (!bucket || bucket.length >= limitPerAgent) continue
    bucket.push(item)
  }

  return grouped
}

/** 未手动改过时：仅当前活跃专家默认展开 */
export function isExpertSectionExpanded(
  agentId: AimAgentId,
  activeAgentId: string | null,
  expandedMap: Record<string, boolean>,
): boolean {
  if (Object.prototype.hasOwnProperty.call(expandedMap, agentId)) {
    return Boolean(expandedMap[agentId])
  }
  return Boolean(activeAgentId) && agentId === activeAgentId
}

export function getExpandedAgentsSnapshot(): string {
  if (typeof window === "undefined") return "{}"
  try {
    return window.localStorage.getItem(AIM_SIDEBAR_EXPANDED_KEY) ?? "{}"
  } catch {
    return "{}"
  }
}

export function subscribeExpandedAgents(onStoreChange: () => void) {
  if (typeof window === "undefined") return () => {}
  const onStorage = (event: StorageEvent) => {
    if (event.key === AIM_SIDEBAR_EXPANDED_KEY || event.key === null) onStoreChange()
  }
  const onLocal = () => onStoreChange()
  window.addEventListener("storage", onStorage)
  window.addEventListener(AIM_SIDEBAR_EXPANDED_EVENT, onLocal)
  return () => {
    window.removeEventListener("storage", onStorage)
    window.removeEventListener(AIM_SIDEBAR_EXPANDED_EVENT, onLocal)
  }
}

export function parseExpandedAgentsSnapshot(raw: string): Record<string, boolean> {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const next: Record<string, boolean> = {}
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "boolean") next[key] = value
    }
    return next
  } catch {
    return {}
  }
}

export function writeExpandedAgentsToStorage(map: Record<string, boolean>) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(AIM_SIDEBAR_EXPANDED_KEY, JSON.stringify(map))
    window.dispatchEvent(new Event(AIM_SIDEBAR_EXPANDED_EVENT))
  } catch {
    // 隐私模式 / 配额满：忽略
  }
}

/** 供无 agentId 回退导航：优先记录自身，其次当前专家，最后默认专家 */
export function resolveHistoryNavAgentId(
  itemAgentId: string | null | undefined,
  fallbackAgentId: string | null | undefined,
): AimAgentId {
  return (
    normalizeSidebarAgentId(itemAgentId)
    ?? normalizeSidebarAgentId(fallbackAgentId)
    ?? DEFAULT_AIM_AGENT
  )
}
