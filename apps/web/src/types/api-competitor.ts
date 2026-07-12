import type { CompetitorMetrics, CompetitorAnalysisResult } from "@/lib/tikhub/types";

// ─── Competitor Analysis (v5.0) ─────────────────────────
export type { CompetitorMetrics, CompetitorAnalysisResult }

export type CompetitorAnalysisStatus =
  | "pending"
  | "scraping"
  | "enriching"
  | "analyzing"
  | "completed"
  | "failed"

export type CompetitorCollectionSource = "external_api" | "redfox_api" | "local_browser" | "tikhub_api";

export interface ApiCompetitorAnalysis {
  id: string;
  status: CompetitorAnalysisStatus;
  platform: string;
  targetUrl: string;
  accountName: string | null;
  accountAvatar: string | null;
  followerCount: number | null;
  videoCount: number | null;
  // Extended account info
  accountSignature: string | null;
  accountTotalLikes: number | null;
  accountFollowingCount: number | null;
  accountIsVerified: boolean;
  accountVerifyInfo: string | null;
  metricsData: CompetitorMetrics | null;
  analysisResult: CompetitorAnalysisResult | null;
  overallScore: number | null;
  collectionSource: CompetitorCollectionSource | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  errorMessage: string | null;
  createdAt: string;
  completedAt: string | null;
}

export interface ApiCompetitorReport {
  id: string;
  platform: string;
  targetUrl: string;
  status: CompetitorAnalysisStatus;
  accountName: string | null;
  accountAvatar: string | null;
  followerCount: number | null;
  overallScore: number | null;
  collectionSource: CompetitorCollectionSource | null;
  fallbackUsed: boolean;
  fallbackReason: string | null;
  createdAt: string;
  completedAt: string | null;
  errorMessage: string | null;
}

export interface CompetitorReportsResponse {
  items: ApiCompetitorReport[];
  total: number;
  page: number;
  limit: number;
}

export interface ApiCompetitorWebResearchItem {
  title: string;
  url: string;
  snippet: string;
  publishedAt: string | null;
  source: string;
}

export interface ApiCompetitorWebResearch {
  query: string;
  items: ApiCompetitorWebResearchItem[];
  warnings: string[];
  availability: {
    web: boolean;
    rss: boolean;
    summary: string;
  };
}
