// ─── TikHub API Wire Types ──────────────────────────────

export interface TikHubResponse<T = unknown> {
  code: number;
  data: T | null;
  message: string;
  router: string;
  cache_url?: string | null;
}

// ─── Normalized Domain Types ────────────────────────────

export interface NormalizedAccount {
  platformUserId: string;
  nickname: string;
  avatar: string;
  signature: string;
  followerCount: number;
  followingCount: number;
  totalLikes: number;
  videoCount: number;
  isVerified: boolean;
  verifyInfo: string;
}

export interface NormalizedVideo {
  videoId: string;
  title: string;
  coverUrl: string;
  videoUrl: string;
  createTime: number;   // Unix timestamp (seconds)
  duration: number;     // Seconds
  views: number;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
}

export interface NormalizedComment {
  commentId: string;
  text: string;
  likes: number;
  createTime: number;
  isTop: boolean;
}

// ─── Platform Adapter Contract ──────────────────────────

export type Platform = 'douyin' | 'xiaohongshu' | 'bilibili' | 'kuaishou';

export interface VideoStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  collects: number;
}

export interface PlatformAdapter {
  resolveUrl(url: string): Promise<string>;
  fetchAccount(userId: string): Promise<NormalizedAccount>;
  fetchVideos(userId: string, count: number): Promise<NormalizedVideo[]>;
  fetchVideoStats(videoIds: string[]): Promise<Map<string, VideoStats>>;
  fetchComments(videoId: string, count: number): Promise<NormalizedComment[]>;
}

// ─── Metrics & Analysis Result Types ────────────────────

export interface CompetitorMetrics {
  engagement: {
    avg_likes: number;
    avg_comments: number;
    avg_shares: number;
    avg_collects: number;
    avg_views: number;
    weighted_engagement_rate: number;
    like_to_comment_ratio: number;
  };
  publishing: {
    total_videos: number;
    avg_per_week: number;
    avg_per_month: number;
    most_active_day: string;
    most_active_hour: number;
    consistency_score: number;
  };
  content: {
    avg_duration_seconds: number;
    duration_distribution: Record<string, number>;
    viral_ratio: number;
    top_hashtags: Array<{ tag: string; count: number }>;
  };
}

export interface CompetitorAnalysisResult {
  scores: {
    content_power: number;
    growth_power: number;
    engagement_power: number;
    monetization_power: number;
    persona_power: number;
    operation_power: number;
    overall: number;
  };
  sections: {
    account_overview: {
      account_type: string;
      content_vertical: string;
      positioning: string;
      differentiator: string;
    };
    content_strategy: {
      topic_distribution: Array<{ topic: string; percentage: number }>;
      content_formats: Array<{ format: string; percentage: number }>;
      hook_patterns: string[];
      posting_frequency: string;
      best_posting_times: string;
      viral_formula: string;
    };
    growth_analysis: {
      growth_trend: string;
      growth_drivers: string[];
      follower_quality: string;
    };
    engagement_analysis: {
      avg_engagement_rate: number;
      avg_likes: number;
      avg_comments: number;
      avg_shares: number;
      comment_quality: string;
      anomaly_detection: string;
    };
    monetization_analysis: {
      monetization_paths: string[];
      product_categories: string[];
      estimated_revenue_level: string;
    };
    recommendations: {
      reusable_strategies: string[];
      differentiation_points: string[];
      action_plan_30d: string[];
      risks: string[];
    };
  };
  stats: {
    total_videos_analyzed: number;
    date_range: { from: string; to: string };
    top_videos: Array<{
      title: string;
      views: number;
      likes: number;
      engagement_rate: number;
      url: string;
    }>;
    posting_heatmap: Record<string, number>;
  };
}
