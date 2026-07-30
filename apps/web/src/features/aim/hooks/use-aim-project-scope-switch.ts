"use client"

import { useCallback } from "react"

import {
  loadAimDraft,
  saveAimDraft,
  shouldCarryAimDraftAcrossProjectScope,
  type AimDraft,
} from "@/lib/aim/draft-storage"
import { stripAimTaskScopedSearchParams } from "@/lib/aim/task-session-reset"

type Router = { replace: (href: string) => void }
type SearchParams = { toString: () => string }

/** Saves the current scope before switching and restores only the target scope. */
/**
 * @description React Hook：aimprojectscopeswitch
 * @param input - 输入数据
 * @returns 无返回值
 */
export function useAimProjectScopeSwitch(input: {
  busy: boolean
  currentProjectScope: string
  draft: AimDraft
  router: Router
  searchParams: SearchParams
  setProjectEnabled: (enabled: boolean) => void
  setSelectedProjectId: (projectId: string) => void
  restoreDraft: (draft: AimDraft | null) => void
  afterScopeChange: () => void
}) {
  const {
    busy, currentProjectScope, draft, router, searchParams,
    setProjectEnabled, setSelectedProjectId, restoreDraft, afterScopeChange,
  } = input
  const changeProjectScope = useCallback((scope: string) => {
    if (busy || scope === currentProjectScope) return
    saveAimDraft(draft, currentProjectScope)
    const nextProjectId = scope === "quick" ? "" : scope
    const nextDraft = loadAimDraft(draft.selectedAgentId, scope)
    const carryCurrent = shouldCarryAimDraftAcrossProjectScope({
      current: draft,
      next: nextDraft,
    })

    setProjectEnabled(scope !== "quick")
    setSelectedProjectId(nextProjectId)

    if (carryCurrent) {
      // 进行中的拆解/文案任务：只换客户项目绑定，不拿空草稿覆盖内容
      saveAimDraft({ ...draft, selectedProjectId: nextProjectId }, scope)
    } else {
      restoreDraft(nextDraft)
    }
    afterScopeChange()

    const nextParams = new URLSearchParams(searchParams.toString())
    // 带走活任务时保留对标拆解 id，避免 URL 被剥掉后状态无处回填
    if (carryCurrent) {
      nextParams.delete("generationId")
      nextParams.delete("topicTitle")
      nextParams.delete("topicRationale")
      nextParams.delete("topicSelectionId")
      nextParams.delete("selectedTopicIndex")
      nextParams.delete("idea")
      nextParams.delete("stage")
    } else {
      stripAimTaskScopedSearchParams(nextParams)
    }
    if (scope === "quick") {
      nextParams.set("mode", "quick")
      nextParams.delete("projectId")
    } else {
      if (nextParams.get("mode") === "quick") nextParams.delete("mode")
      nextParams.set("projectId", scope)
    }
    router.replace(`/aim?${nextParams.toString()}`)
  }, [afterScopeChange, busy, currentProjectScope, draft, restoreDraft, router, searchParams, setProjectEnabled, setSelectedProjectId])

  return { changeProjectScope }
}
