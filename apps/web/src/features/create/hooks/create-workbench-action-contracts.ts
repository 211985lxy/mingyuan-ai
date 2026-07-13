import type { Dispatch, SetStateAction } from "react";
import type { CreateWorkbenchDraftState } from "@/features/create/hooks/use-create-workbench-draft";
import type { ApiAsset, ApiScript, ApiVideoPackagingTemplate, BackgroundMusicSelection, MaterialAssignment } from "@/types/api";

type Setter<T> = Dispatch<SetStateAction<T>>;

export interface CreateWorkbenchActionsState {
  currentPhase: number;
  generatedScripts: ApiScript[];
  selectedScriptId: string | null;
  selectedPackagingTemplateId: string | null;
  selectedCopyStructureCode: string | null;
  selectedOpeningCode: string | null;
  selectedEndingCode: string | null;
  fallbackTemplateId: string | null;
  topicSelectionId: string | null;
  hotTopicId: string | null;
  hotTopicTitle: string | null;
  editedScript: string;
  packagingTemplates: ApiVideoPackagingTemplate[];
  materials: MaterialAssignment[];
  backgroundMusic: BackgroundMusicSelection | null;
  assets: ApiAsset[];
}

export interface CreateWorkbenchActionSetters {
  setCurrentPhase: Setter<number>;
  setGeneratedScripts: Setter<ApiScript[]>;
  setSelectedScriptId: Setter<string | null>;
  setEditedScript: Setter<string>;
  setSelectedPackagingTemplateId: Setter<string | null>;
  setMaterials: Setter<MaterialAssignment[]>;
  setBackgroundMusic: Setter<BackgroundMusicSelection | null>;
  setAssets: Setter<ApiAsset[]>;
  setAssetLibraryError: Setter<string | null>;
  setMaterialAssistLoading: Setter<boolean>;
  setMaterialAssistError: Setter<string | null>;
  setTaskError: Setter<string | null>;
  setIsGenerating: Setter<boolean>;
  setIsDegraded: Setter<boolean>;
  setIsSubmitting: Setter<boolean>;
  setTaskId: Setter<string | null>;
  setTaskStatus: Setter<string | null>;
  setStaleWarning: Setter<string | null>;
}

export interface CreateWorkbenchActionsParams {
  state: CreateWorkbenchActionsState;
  setters: CreateWorkbenchActionSetters;
  saveDraft: (overrides?: Partial<CreateWorkbenchDraftState>) => void;
  clearDraft: () => void;
}
