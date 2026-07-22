import { redirect } from "next/navigation"

/**
 * /ai-hot 已迁入「内容机会 — 今日机会」
 * 保留旧地址兼容跳转，不删除底层 API。
 */
export default function AiHotPage() {
  redirect("/opportunities?tab=daily")
}
