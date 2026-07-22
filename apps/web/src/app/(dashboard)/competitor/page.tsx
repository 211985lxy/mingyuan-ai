import { redirect } from "next/navigation"

/**
 * /competitor 已迁入「内容机会 — 对标账号」
 * 保留旧地址兼容跳转，不删除底层 API 和数据模型。
 */
export default function CompetitorPage() {
  redirect("/opportunities?tab=benchmarks")
}
