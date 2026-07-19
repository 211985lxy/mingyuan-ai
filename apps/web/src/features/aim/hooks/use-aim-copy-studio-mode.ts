"use client"

import { useCallback, useState } from "react"

import { normalizeWorkbenchCopyStudioModule, type CopyStudioModule } from "@/lib/copy-studio"

/** Keeps the workbench-only writing mode scoped to the content producer. */
export function useAimCopyStudioMode(input: { selectedAgentId: string; initialModule: unknown }) {
  const { selectedAgentId, initialModule } = input
  const [storedModule, setStoredModule] = useState<CopyStudioModule | undefined>(() =>
    normalizeWorkbenchCopyStudioModule(selectedAgentId, initialModule),
  )

  const setAgentModule = useCallback((module: CopyStudioModule | undefined) => {
    setStoredModule(normalizeWorkbenchCopyStudioModule(selectedAgentId, module))
  }, [selectedAgentId])

  return { agentModule: normalizeWorkbenchCopyStudioModule(selectedAgentId, storedModule), setAgentModule }
}
