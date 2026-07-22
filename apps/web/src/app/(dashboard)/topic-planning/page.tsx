import { redirect } from "next/navigation"

/**
 * /topic-planning 已迁入「内容机会 — 已收藏研究」
 * 保留旧地址兼容跳转，不删除底层 API 和数据模型。
 */
export default function TopicPlanningPage() {
  redirect("/opportunities?tab=collections")
}
