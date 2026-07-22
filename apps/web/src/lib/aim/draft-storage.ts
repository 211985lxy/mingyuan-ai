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
    messages: draft.messages,
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
    if (
      !draft.input.trim()
      && draft.messages.length === 0
      && !draft.editorText?.trim()
      && !draft.sourceOriginalText?.trim()
      && !draft.sourceAnalysisText?.trim()
      && !draft.sourceTopicTitle?.trim()
      && !draft.sourceTopicRationale?.trim()
    ) {
      window.sessionStorage.removeItem(storageKey)
      return
    }
    window.sessionStorage.setItem(storageKey, JSON.stringify(draft))
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
