"use client"

import { useEffect, type MutableRefObject } from "react"

import { clearAimDraft, type AimDraftProjectScope } from "@/lib/aim/draft-storage"
import { stripAimTaskScopedSearchParams } from "@/lib/aim/task-session-reset"
import type { AimAgentId } from "@/lib/aim-ui-config"

/**
 * 侧栏「新建文案」：空稿 + content_producer，保留当前客户/模式。
 */
export function useAimPendingNewCopy(input: {
  pendingNewCopy: boolean
  selectedAgentId: AimAgentId
  currentProjectScope: AimDraftProjectScope
  searchParams: { toString: () => string }
  router: { replace: (href: string) => void }
  lastAgentParamRef: MutableRefObject<string | null>
  resetConversation: () => void
  setSelectedAgentId: (id: AimAgentId) => void
  clearNewCopyRequest: () => void
}) {
  const {
    pendingNewCopy, selectedAgentId, currentProjectScope, searchParams, router,
    lastAgentParamRef, resetConversation, setSelectedAgentId, clearNewCopyRequest,
  } = input

  useEffect(() => {
    if (!pendingNewCopy) return
    clearAimDraft(selectedAgentId, currentProjectScope)
    clearAimDraft("content_producer", currentProjectScope)
    resetConversation()
    setSelectedAgentId("content_producer")
    lastAgentParamRef.current = "content_producer"
    const nextParams = new URLSearchParams(searchParams.toString())
    stripAimTaskScopedSearchParams(nextParams)
    nextParams.set("agent", "content_producer")
    router.replace(nextParams.toString() ? `/aim?${nextParams.toString()}` : "/aim?agent=content_producer")
    clearNewCopyRequest()
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to pendingNewCopy signal
  }, [pendingNewCopy])
}
