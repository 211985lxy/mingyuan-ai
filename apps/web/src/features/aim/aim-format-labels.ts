import type { ContentFormat } from "@/lib/api/client"

export const FORMAT_LABELS: Record<ContentFormat, string> = {
  video_script: "口播文案",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  community_message: "社群运营文案",
  shooting_brief: "拍摄交接单",
  raw_copy: "原始文案",
  koubo_script: "口播文案",
  xiaohongshu_post: "小红书图文",
}

export const WORKFLOW_STATUS_OPTIONS = [
  { value: "draft", label: "草稿" },
  { value: "pending_review", label: "待审核" },
  { value: "ready_to_shoot", label: "待拍摄" },
  { value: "shooting", label: "拍摄中" },
  { value: "editing", label: "剪辑中" },
  { value: "ready_to_publish", label: "待发布" },
  { value: "published", label: "已发布" },
  { value: "archived", label: "已归档" },
]

/**
 * @description workflowstatuslabel
 * @param status? - status?
 * @returns 无返回值
 */
export function workflowStatusLabel(status?: string | null) {
  return WORKFLOW_STATUS_OPTIONS.find((item) => item.value === status)?.label || "草稿"
}
