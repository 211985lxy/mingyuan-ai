export interface ApiVideoStructure {
  id: string;
  name: string;
  displayName: string;
  subtitle: string | null;
  description: string | null;
  useCase: string | null;
  blueprint: ApiVideoStructureBlueprint;
  sortOrder: number;
  status: string;
}

export type StructurePace = "fast" | "medium" | "slow";
export type StructureEvidenceDensity = "low" | "medium" | "high";
export type StructureCtaStyle = "soft" | "direct" | "hard";
export interface ApiVideoStructureBlueprint {
  openingPattern: string;
  narrativeBeats: string[];
  evidenceSlots: number;
  ctaSlot: string;
  durationRange: { min: number; max: number };
  pace?: StructurePace;
  evidenceDensity?: StructureEvidenceDensity;
  ctaStyle?: StructureCtaStyle;
}
