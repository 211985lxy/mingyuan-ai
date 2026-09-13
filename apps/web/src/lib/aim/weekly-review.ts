/**
 * 每周经营复盘。计算公式已收到 metric-layer，这里只做兼容出口。
 */
export {
  computeWeeklyReview,
  pickPeriodEndSnapshots,
  WEEKLY_OUTCOME_WINDOW_POLICY,
  type WeeklyReviewMetrics,
  type WeeklyReviewStorePort,
  type SnapshotKeyRow,
} from "@/lib/aim/metric-layer"
