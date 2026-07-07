import type { ApiCompetitorAnalysis } from "@/types/api"

// ─── Confidence Levels ───────────────────────────────────

export type ConfidenceLevel = "高" | "中高" | "中" | "低"

// ─── Falsification ────────────────────────────────────────

export interface FalsificationRow {
  claim: string
  couldBeWrongIf: string
  verifyBy: string
  correctionSignal: string
  misjudgeCost: string
}

// ─── Question Card (五层诊断) ─────────────────────────────

export interface DiagnosisQuestion {
  questionNo: number
  layerName: string
  coreQuestion: string
  oneLineConclusion: string
  confidence: ConfidenceLevel
  evidenceSource: string[]
  bodySections: string[]
  keyCharts: string[]
  falsificationTable: FalsificationRow[]
  actionSuggestion: string
}

// ─── Strategic Bet ───────────────────────────────────────

export interface StrategicBet {
  type: "主推" | "备选" | "不建议"
  title: string
  reason: string
  successCondition: string
  risk: string
  resourceRequired: string
  stopLossSignal: string
  action30d: string
  action90d: string
}

// ─── Verdict Banner ──────────────────────────────────────

export interface VerdictData {
  assetVerdict: string
  growthVerdict: string
  riskVerdict: string
  confidence: ConfidenceLevel
}

// ─── Content Strategy Evidence ───────────────────────────

export interface ContentStrategyData {
  topicDistribution: Array<{ topic: string; percentage: number }>
  contentFormats: Array<{ format: string; percentage: number }>
  hookPatterns: string[]
  postingFrequency: string
  bestPostingTimes: string
  viralFormula: string
  summary: string
}

// ─── Evidence Dashboard ──────────────────────────────────

export interface EvidenceData {
  topVideos: Array<{
    title: string
    views: number
    likes: number
    engagement_rate: number
    url: string
  }>
  postingHeatmap: Record<string, number>
  avgEngagementRate: number
  avgLikes: number
  avgComments: number
  avgShares: number
}

// ─── Full View Model ─────────────────────────────────────

export interface CompetitorDiagnosisViewModel {
  // Hero
  accountName: string
  accountAvatar: string | null
  followerCount: number | null
  videoCount: number | null
  accountTotalLikes: number | null
  completedAt: string
  overallScore: number
  assetGrade: string
  oneLineVerdict: string
  confidence: ConfidenceLevel

  // Verdict
  verdict: VerdictData

  // Five Layers
  diagnosisQuestions: DiagnosisQuestion[]

  // Content Strategy
  contentStrategy: ContentStrategyData

  // Evidence
  evidence: EvidenceData

  // Raw data (for appendix)
  rawAnalysis: ApiCompetitorAnalysis
}
