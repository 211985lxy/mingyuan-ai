import { clampEditorPanelWidth } from "@/lib/aim-editor"
import { isValidAimAgent, type AimAgentId } from "@/lib/aim-ui-config"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"
import type { ContentFormat } from "@/lib/api/client"
import { normalizeWorkbenchCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"

const AIM_DRAFT_STORAGE_KEY_PREFIX = "aim-workbench-draft-v3"
const LEGACY_AIM_DRAFT_STORAGE_KEY_PREFIX = "aim-workbench-draft-v2"
const AIM_DRAFT_SCOPE_POINTER_PREFIX = "aim-workbench-draft-scope-v1"

export type AimDraftProjectScope = string

export interface AimDraft {
  selectedAgentId: AimAgentId
  agentModule?: CopyStudioModule
  selectedProjectId: string
  input: string
  messages: AimWorkbenchMessage[]
  videoCopyExtractionId?: string
  sourceOriginalText?: string
  sourceAnalysisText?: string
  sourceTopicTitle?: string
  sourceTopicRationale?: string
  editorText?: string
  editorFormat?: ContentFormat
  editorSourceMessageId?: string
  editorPanelWidth?: number
  editorPanelOpen?: boolean
  /** ADR-002：本次选中的命名方法论 profile id（MVP 最多 1 个）。 */
  selectedMethodologyProfileIds?: string[]
}

/**
 * @description 获取 AIM 草稿的项目作用域
 * @param projectEnabled - 是否启用项目
 * @param projectId - 项目 ID
 * @returns 项目作用域字符串
 */
export function aimDraftProjectScope(projectEnabled: boolean, projectId: string) {
  return projectEnabled && projectId ? projectId : "quick"
}

/**
 * 当前会话是否有进行中的任务内容（输入、消息、对标/拆解素材）。
 * 用于切客户项目时判断要不要把内容带走，避免空草稿把刚带入的文案冲掉。
 */
export function aimDraftHasActiveTaskContent(
  draft: Pick<
    AimDraft,
    | "input"
    | "messages"
    | "videoCopyExtractionId"
    | "sourceOriginalText"
    | "sourceAnalysisText"
    | "sourceTopicTitle"
    | "editorText"
  > | null | undefined,
): boolean {
  if (!draft) return false
  return Boolean(
    draft.input?.trim()
    || draft.messages?.length
    || draft.videoCopyExtractionId
    || draft.sourceOriginalText?.trim()
    || draft.sourceAnalysisText?.trim()
    || draft.sourceTopicTitle?.trim()
    || draft.editorText?.trim(),
  )
}

/**
 * 切项目时：当前有活任务、目标项目草稿为空 → 带走当前内容，不要 restore 空草稿。
 * 目标项目已有草稿 → 仍按原行为切换到目标草稿。
 */
export function shouldCarryAimDraftAcrossProjectScope(input: {
  current: Parameters<typeof aimDraftHasActiveTaskContent>[0]
  next: Parameters<typeof aimDraftHasActiveTaskContent>[0]
}): boolean {
  return aimDraftHasActiveTaskContent(input.current) && !aimDraftHasActiveTaskContent(input.next)
}

/**
 * @description 生成 AIM 草稿存储键
 * @param agentId - 智能体 ID
 * @param projectScope - 项目作用域
 * @returns 存储键字符串
 */
export function aimDraftStorageKey(agentId: AimAgentId, projectScope = "quick") {
  return `${AIM_DRAFT_STORAGE_KEY_PREFIX}:${agentId}:${projectScope}`
}

function aimDraftScopePointerKey(agentId: AimAgentId) {
  return `${AIM_DRAFT_SCOPE_POINTER_PREFIX}:${agentId}`
}

function parseDraft(raw: string | null): AimDraft | null {
  if (!raw) return null
  const draft = JSON.parse(raw) as Partial<AimDraft>
  if (!isValidAimAgent(draft.selectedAgentId) || !Array.isArray(draft.messages)) return null
  return {
    selectedAgentId: draft.selectedAgentId,
    agentModule: normalizeWorkbenchCopyStudioModule(draft.selectedAgentId, draft.agentModule),
    selectedProjectId: typeof draft.selectedProjectId === "string" ? draft.selectedProjectId : "",
    input: typeof draft.input === "string" ? draft.input : "",
    messages: stripPendingGenerationMessages(draft.messages),
    videoCopyExtractionId: typeof draft.videoCopyExtractionId === "string" ? draft.videoCopyExtractionId : undefined,
    sourceOriginalText: typeof draft.sourceOriginalText === "string" ? draft.sourceOriginalText : undefined,
    sourceAnalysisText: typeof draft.sourceAnalysisText === "string" ? draft.sourceAnalysisText : undefined,
    sourceTopicTitle: typeof draft.sourceTopicTitle === "string" ? draft.sourceTopicTitle : undefined,
    sourceTopicRationale: typeof draft.sourceTopicRationale === "string" ? draft.sourceTopicRationale : undefined,
    editorText: typeof draft.editorText === "string" ? draft.editorText : undefined,
    editorFormat: typeof draft.editorFormat === "string" ? draft.editorFormat as ContentFormat : undefined,
    editorSourceMessageId: typeof draft.editorSourceMessageId === "string" ? draft.editorSourceMessageId : undefined,
    editorPanelWidth: typeof draft.editorPanelWidth === "number" ? clampEditorPanelWidth(draft.editorPanelWidth) : undefined,
    editorPanelOpen: typeof draft.editorPanelOpen === "boolean" ? draft.editorPanelOpen : undefined,
  }
}

/** 旧版本草稿没有 pendingGeneration 标记，只能按占位文案特征识别（生成中刷新落下的脏数据） */
const LEGACY_PENDING_MESSAGE_PATTERN =
  /^正在[^，\n]{1,12}，(?:会读取当前项目资料并匹配知识库，再生成交付物|将根据本次输入生成交付物)…$|^正在理解你的要求，随后[^，\n]{1,12}…$|^正在读取项目资料并匹配知识库…$|^正在连接模型[^，\n]{1,12}，请稍候…$|^生成仍在进行，复杂任务可能需要 2–3 分钟；也可点停止后重试。$/u

/**
 * 生成中的占位气泡不进草稿：生成会在服务端跑完并进历史，
 * 草稿里留下它只会让刷新/恢复后的会话永远显示「生成中」。
 */
export function stripPendingGenerationMessages(messages: AimDraft["messages"]): AimDraft["messages"] {
  return messages.filter((message) => {
    if (message?.role !== "assistant") return true
    if (message.pendingGeneration === true) return false
    return !LEGACY_PENDING_MESSAGE_PATTERN.test(message.content || "")
  })
}

/**
 * @description 加载 AIM 草稿
 * @param agentId - 智能体 ID
 * @param requestedScope - 请求的作用域
 * @returns 草稿对象，不存在时返回 null
 */
export function loadAimDraft(agentId: AimAgentId, requestedScope?: AimDraftProjectScope): AimDraft | null {
  if (typeof window === "undefined") return null
  try {
    const scope = requestedScope || window.sessionStorage.getItem(aimDraftScopePointerKey(agentId)) || "quick"
    const current = parseDraft(window.sessionStorage.getItem(aimDraftStorageKey(agentId, scope)))
    if (current) return current

    const legacyKey = `${LEGACY_AIM_DRAFT_STORAGE_KEY_PREFIX}:${agentId}`
    const legacy = parseDraft(window.sessionStorage.getItem(legacyKey))
    if (!legacy) return null
    const legacyScope = legacy.selectedProjectId || "quick"
    if (requestedScope && requestedScope !== legacyScope) return null
    window.sessionStorage.setItem(aimDraftStorageKey(agentId, legacyScope), JSON.stringify(legacy))
    window.sessionStorage.setItem(aimDraftScopePointerKey(agentId), legacyScope)
    window.sessionStorage.removeItem(legacyKey)
    return legacy
  } catch {
    return null
  }
}

/**
 * @description 保存 AIM 草稿
 * @param draft - 草稿对象
 * @param projectScope - 项目作用域
 * @returns 无返回值
 */
export function saveAimDraft(draft: AimDraft, projectScope: AimDraftProjectScope) {
  if (typeof window === "undefined") return
  try {
    const storageKey = aimDraftStorageKey(draft.selectedAgentId, projectScope)
    const messages = stripPendingGenerationMessages(draft.messages)
    if (
      !draft.input.trim()
      && messages.length === 0
      && !draft.editorText?.trim()
      && !draft.sourceOriginalText?.trim()
      && !draft.sourceAnalysisText?.trim()
      && !draft.sourceTopicTitle?.trim()
      && !draft.sourceTopicRationale?.trim()
      && !draft.videoCopyExtractionId
    ) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify({ ...draft, messages }))
    window.sessionStorage.setItem(aimDraftScopePointerKey(draft.selectedAgentId), projectScope)
  } catch {
    // Losing a browser draft is better than breaking the editor.
  }
}

/**
 * @description 清除 AIM 草稿
 * @param agentId - 智能体 ID
 * @param projectScope - 项目作用域
 * @returns 无返回值
 */
export function clearAimDraft(agentId: AimAgentId, projectScope: AimDraftProjectScope) {
  if (typeof window === "undefined") return
  window.sessionStorage.removeItem(aimDraftStorageKey(agentId, projectScope))
}
