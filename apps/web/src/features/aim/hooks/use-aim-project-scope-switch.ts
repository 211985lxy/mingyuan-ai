"use client"

import { useCallback } from "react"

import { loadAimDraft, saveAimDraft, type AimDraft } from "@/lib/aim/draft-storage"

type Router = { replace: (href: string) => void }
type SearchParams = { toString: () => string }

/** Saves the current scope before switching and restores only the target scope. */
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
  const { busy, currentProjectScope, draft, router, searchParams, setProjectEnabled, setSelectedProjectId, restoreDraft, afterScopeChange } = input
  const changeProjectScope = useCallback((scope: string) => {
    if (busy || scope === currentProjectScope) return
    saveAimDraft(draft, currentProjectScope)
    const nextProjectId = scope === "quick" ? "" : scope
    const nextDraft = loadAimDraft(draft.selectedAgentId, scope)
    setProjectEnabled(scope !== "quick")
    setSelectedProjectId(nextProjectId)
    restoreDraft(nextDraft)
    afterScopeChange()

    const nextParams = new URLSearchParams(searchParams.toString())
    nextParams.delete("generationId")
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
