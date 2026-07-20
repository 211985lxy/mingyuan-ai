// ─── Topic Engine (v5.0) ────────────────────────────────

export type ApiTopicRecommendationMode = "normal" | "daily" | "weekly";

export interface ApiTopicCard {
  title: string;
  elementCodes: string[];
  openingTypeCode: string;
  structureCode: string;
  rationale?: string;
  topicType?: "人设型" | "转化型" | "流量型";
  sourceType?: "个人灵感" | "客户资料" | "公司卖点" | "行业热点" | "对标参考";
  score?: number;
  scoreReason?: string;
  scoreBreakdown?: {
    projectFit: number;
    contentValue: number;
    viralHook: number;
    conversionFit: number;
    feasibility: number;
  };
  reviewVerdict?: "strong" | "usable" | "observe" | "revise";
  revisionAdvice?: string;
  hook?: string;
  angle?: string;
  cta?: string;
  contentLine?: string;
  creativeTrace?: {
    stylePositioning: string;
    logicSteps: string[];
    sources: Array<{
      kind: "benchmark" | "product" | "persona";
      source: string;
      usage: string;
    }>;
    destinyAlignment: {
      baziBasis: string;
      ziweiBasis: string;
      styleMapping: string;
    };
  };
  defamiliarization?: {
    scarcityType?: "scenery" | "emotion" | "beauty" | "info" | "curio" | "event";
    rhetoric?: "fu" | "bi" | "xing";
    noveltyScore?: number;
    note?: string;
    advice?: string;
  };
}

export interface ApiTopicGenerateResponse {
  topicSelectionId: string;
  cards: ApiTopicCard[];
  elementCodes: string[];
  sourceHighlights?: Array<{
    category: string;
    title: string;
    content: string;
  }>;
}

export interface ApiTopicSelectResponse {
  topicSelectionId: string;
  selectedIndex: number;
  selectedCard: ApiTopicCard;
  status: string;
}

export interface ApiOpeningType {
  id: string;
  code: string;
  name: string;
  description: string;
  formulas: { template: string; example?: string }[];
}

export interface ApiCopyStructure {
  id: string;
  code: string;
  name: string;
  description: string;
  beats: { key: string; label: string; guidance?: string }[];
  caseStudy?: string;
}

export interface ApiEndingType {
  id: string;
  code: string;
  name: string;
  description: string;
  guidance: string;
}
