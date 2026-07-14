import type { ApiHotTopicFit, ApiHotTopicInsight } from "./api-insights";
import type { ApiVideoStructureBlueprint } from "./api-video";

export interface ApiContentGenerationRun {
  id: string;
  userId: string;
  ipProfileId: string;
  templateId: string;
  structureId: string | null;
  structureSnapshot: ApiVideoStructureBlueprint | null;
  hotTopicId: string | null;
  hotTopic: string | null;
  hotTopicInsight: ApiHotTopicInsight | null;
  hotTopicFit: ApiHotTopicFit | null;
  inputsJson: Record<string, string>;
  promptText: string;
  model: string;
  status: string;
  qualityScore: number | null;
  qualityMetadata: Record<string, unknown> | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
}
