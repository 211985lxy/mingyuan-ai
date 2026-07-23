import type { ContentFormat } from "@/lib/api/client"

export const AIM_FORMAT_LABELS: Record<ContentFormat, string> = {
  video_script: "口播文案",
  wechat_article: "公众号文章",
  moments_post: "朋友圈文案",
  community_message: "社群运营文案",
  shooting_brief: "拍摄交接单",
  raw_copy: "原始文案",
  koubo_script: "口播文案",
  xiaohongshu_post: "小红书图文",
}

export const AIM_SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-muted/45 px-2 text-xs text-muted-foreground shadow-none hover:bg-muted hover:text-foreground"
export const AIM_ACTIVE_SOFT_ACTION_CLASS = "h-7 rounded-md border-0 bg-primary/10 px-2 text-xs text-primary shadow-none hover:bg-primary/15"

export const AIM_WORKFLOW_STATUS_OPTIONS = [
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
 * @description 获取 AIM 工作流状态标签
 * @param status - 状态值
 * @returns 状态标签文本
 */
export function getAimWorkflowStatusLabel(status?: string | null) {
  return AIM_WORKFLOW_STATUS_OPTIONS.find((item) => item.value === status)?.label || "草稿"
}

/**
 * @description 分离 AIM 方法注释和结果内容
 * @param content - 包含方法注释的内容
 * @returns 分离后的方法注释和结果
 */
export function splitAimMethodNote(content: string) {
  const match = content.match(/\[\[AIM_METHOD_NOTE\]\]([\s\S]*?)\[\[\/AIM_METHOD_NOTE\]\]/)
  if (!match) return { methodNote: "", result: content }
  return {
    methodNote: match[1].trim(),
    result: content.replace(match[0], "").trim(),
  }
}
