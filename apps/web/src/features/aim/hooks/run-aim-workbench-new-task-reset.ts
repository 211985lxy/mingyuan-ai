import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ConfirmedWorkflowBrief } from "@/lib/aim-workflow"
import { clearAimDraft, type AimDraftProjectScope } from "@/lib/aim/draft-storage"
import { stripAimTaskScopedSearchParams } from "@/lib/aim/task-session-reset"

type RouterLike = { replace: (href: string) => void }
type SearchParamsLike = { toString: () => string }

/** 切智能体 / 选题预填 / 对标预填：清非草稿的会话附属态。 */
export function clearAimWorkbenchEphemeralState(input: {
  clearSelections: () => void
  clearImages: () => void
  setWorkflowBrief: (value: null) => void
  setWorkflowBriefForm: (value: ConfirmedWorkflowBrief) => void
  setWorkflowBriefDialogOpen?: (value: boolean) => void
  setContentAction: (value: null) => void
}) {
  input.clearSelections()
  input.setWorkflowBrief(null)
  input.setWorkflowBriefForm({})
  input.setWorkflowBriefDialogOpen?.(false)
  input.setContentAction(null)
  input.clearImages()
}

/** 软隔离「新写一篇」：清流程 brief，并剥离 URL 任务态（保留 agent/project/mode）。 */
export function isolateAimTaskSessionExtras(input: {
  clearSelections: () => void
  setWorkflowBrief: (value: null) => void
  setWorkflowBriefForm: (value: ConfirmedWorkflowBrief) => void
  setWorkflowBriefDialogOpen?: (value: boolean) => void
  setContentAction: (value: null) => void
  searchParams: SearchParamsLike
  router: RouterLike
}) {
  input.clearSelections()
  input.setWorkflowBrief(null)
  input.setWorkflowBriefForm({})
  input.setWorkflowBriefDialogOpen?.(false)
  input.setContentAction(null)
  const nextParams = new URLSearchParams(input.searchParams.toString())
  if (stripAimTaskScopedSearchParams(nextParams)) {
    input.router.replace(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
  }
}

/**
 * 顶栏「新任务」/侧栏新建文案：切断会话、草稿、流程 brief、URL 任务态。
 */
export function runAimWorkbenchNewTaskReset(input: {
  abort?: (() => void) | null
  setMessages: (value: []) => void
  setInput: (value: string) => void
  clearCurrentTaskContext: () => void
  clearSelections: () => void
  clearImages: () => void
  setWorkflowBrief: (value: null) => void
  setWorkflowBriefForm: (value: ConfirmedWorkflowBrief) => void
  setWorkflowBriefDialogOpen?: (value: boolean) => void
  setContentAction: (value: null) => void
  setSelectedMethodologyProfileIds: (value: string[]) => void
  setEditorPanelOpen: (value: boolean) => void
  selectedAgentId: AimAgentId
  currentProjectScope: AimDraftProjectScope
  resetPlan: () => void
  setComposerMode: (mode: "direct" | "plan") => void
  clearTurnIntent?: (() => void) | null
  searchParams: SearchParamsLike
  router: RouterLike
}) {
  input.abort?.()
  input.setMessages([])
  input.setInput("")
  input.clearCurrentTaskContext()
  clearAimWorkbenchEphemeralState(input)
  input.setSelectedMethodologyProfileIds([])
  input.setEditorPanelOpen(false)
  clearAimDraft(input.selectedAgentId, input.currentProjectScope)
  input.resetPlan()
  input.setComposerMode("direct")
  input.clearTurnIntent?.()
  const nextParams = new URLSearchParams(input.searchParams.toString())
  if (stripAimTaskScopedSearchParams(nextParams)) {
    input.router.replace(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim")
  }
}
