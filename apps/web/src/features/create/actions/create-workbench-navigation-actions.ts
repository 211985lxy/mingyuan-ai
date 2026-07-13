import type { CreateWorkbenchActionsParams } from "@/features/create/hooks/create-workbench-action-contracts";

export function createWorkbenchNavigationActions({ state, setters, saveDraft }: CreateWorkbenchActionsParams) {
  function goToPhase(phase: number) {
    if (phase < state.currentPhase) setters.setCurrentPhase(phase);
  }

  function nextPhase() {
    const next = Math.min(state.currentPhase + 1, 3);
    saveDraft({ currentPhase: next });
    setters.setStaleWarning(null);
    setters.setCurrentPhase(next);
  }

  function prevPhase() {
    const previous = Math.max(state.currentPhase - 1, 0);
    saveDraft({ currentPhase: previous });
    setters.setCurrentPhase(previous);
  }

  return { goToPhase, nextPhase, prevPhase };
}
