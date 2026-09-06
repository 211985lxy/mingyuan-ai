"use client"

import { useCallback } from "react"

import type { AimDraft } from "@/lib/aim/draft-storage"

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
  const { busy, currentProjectScope } = input
  const changeProjectScope = useCallback((scope: string) => {
    // Project scope is fixed by the logged-in AIM account. Keep this legacy
    // command as a guarded no-op so old callers cannot switch or carry drafts
    // into another customer's context.
    if (busy || scope === currentProjectScope) return
  }, [busy, currentProjectScope])

  return { changeProjectScope }
}
