"use client";

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from "react";
import type { BackgroundMusicSelection, MaterialAssignment } from "@/types/api";

interface WorkbenchDraft {
  currentPhase: number;
  topicSelectionId: string | null;
  selectedTopicIndex: number | null;
  openingTypeCode: string | null;
  copyStructureCode: string | null;
  endingTypeCode: string | null;
  selectedScriptId: string | null;
  editedScript: string;
  packagingTemplateId: string | null;
  materials: MaterialAssignment[];
  backgroundMusic: BackgroundMusicSelection | null;
  savedAt: number;
}

export type CreateWorkbenchDraftState = Omit<WorkbenchDraft, "savedAt">;

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface CreateWorkbenchDraftSetters {
  setCurrentPhase: Setter<number>;
  setTopicSelectionId: Setter<string | null>;
  setSelectedTopicIndex: Setter<number | null>;
  setSelectedOpeningCode: Setter<string | null>;
  setSelectedCopyStructureCode: Setter<string | null>;
  setSelectedEndingCode: Setter<string | null>;
  setSelectedScriptId: Setter<string | null>;
  setEditedScript: Setter<string>;
  setSelectedPackagingTemplateId: Setter<string | null>;
  setMaterials: Setter<MaterialAssignment[]>;
  setBackgroundMusic: Setter<BackgroundMusicSelection | null>;
}

const DRAFT_KEY = "mingyuan:create-draft-v6";
const LEGACY_DRAFT_KEYS = ["mingyuan:create-draft-v5", "mingyuan:create-draft-v4"];
const DRAFT_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export function useCreateWorkbenchDraft(
  state: CreateWorkbenchDraftState,
  setters: CreateWorkbenchDraftSetters,
) {
  const [draftHydrated, setDraftHydrated] = useState(false);
  const {
    setCurrentPhase,
    setTopicSelectionId,
    setSelectedTopicIndex,
    setSelectedOpeningCode,
    setSelectedCopyStructureCode,
    setSelectedEndingCode,
    setSelectedScriptId,
    setEditedScript,
    setSelectedPackagingTemplateId,
    setMaterials,
    setBackgroundMusic,
  } = setters;

  const saveDraft = useCallback((overrides: Partial<WorkbenchDraft> = {}) => {
    const draft: WorkbenchDraft = { ...state, ...overrides, savedAt: Date.now() };
    const hasMeaningfulState =
      draft.currentPhase > 0
      || !!draft.topicSelectionId
      || !!draft.selectedScriptId
      || draft.editedScript.trim().length > 0
      || !!draft.packagingTemplateId
      || draft.materials.length > 0
      || !!draft.backgroundMusic;

    if (!hasMeaningfulState) {
      localStorage.removeItem(DRAFT_KEY);
      return;
    }

    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [state]);

  useEffect(() => {
    try {
      for (const key of LEGACY_DRAFT_KEYS) localStorage.removeItem(key);

      const raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return;

      const draft: WorkbenchDraft = JSON.parse(raw);
      if (Date.now() - draft.savedAt > DRAFT_MAX_AGE_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }

      if (draft.topicSelectionId) setTopicSelectionId(draft.topicSelectionId);
      if (draft.selectedTopicIndex != null) setSelectedTopicIndex(draft.selectedTopicIndex);
      if (draft.openingTypeCode) setSelectedOpeningCode(draft.openingTypeCode);
      if (draft.copyStructureCode) setSelectedCopyStructureCode(draft.copyStructureCode);
      if (draft.endingTypeCode) setSelectedEndingCode(draft.endingTypeCode);
      if (draft.selectedScriptId) setSelectedScriptId(draft.selectedScriptId);
      if (draft.editedScript) setEditedScript(draft.editedScript);
      if (draft.packagingTemplateId) setSelectedPackagingTemplateId(draft.packagingTemplateId);
      if (Array.isArray(draft.materials)) setMaterials(draft.materials);
      if (draft.backgroundMusic) setBackgroundMusic(draft.backgroundMusic);
      if (typeof draft.currentPhase === "number") {
        setCurrentPhase(Math.max(0, Math.min(draft.currentPhase, 3)));
      }
    } catch {
      // Ignore malformed local drafts and continue with an empty workbench.
    } finally {
      setDraftHydrated(true);
    }
  }, [
    setBackgroundMusic,
    setCurrentPhase,
    setEditedScript,
    setMaterials,
    setSelectedCopyStructureCode,
    setSelectedEndingCode,
    setSelectedOpeningCode,
    setSelectedPackagingTemplateId,
    setSelectedScriptId,
    setSelectedTopicIndex,
    setTopicSelectionId,
  ]);

  useEffect(() => {
    if (draftHydrated) saveDraft();
  }, [draftHydrated, saveDraft]);

  const clearDraft = useCallback(() => {
    localStorage.removeItem(DRAFT_KEY);
  }, []);

  return { draftHydrated, saveDraft, clearDraft };
}
