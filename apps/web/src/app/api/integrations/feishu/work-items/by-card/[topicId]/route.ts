import { NextRequest, NextResponse } from "next/server"
import { checkWorkItemApiSecret } from "@/lib/aim/work-item-api-auth"
import { findAfuCardWorkItem } from "@/lib/aim/afu-card-bridge"
import { createLarkAfuCardWorkItemPorts, readWorkItemStoreConfig } from "@/lib/aim/work-item-store"
import { parseFeishuWorkItem } from "@/lib/aim-feishu-work-item"

export const dynamic = "force-dynamic"

export async function GET(request: NextRequest, { params }: { params: Promise<{ topicId: string }> }) {
  const auth = checkWorkItemApiSecret(request)
  if (auth === "unconfigured") return NextResponse.json({ ok: false, error: "AIM_WORK_ITEM_API_SECRET 未配置，入口已 fail-closed。" }, { status: 503 })
  if (auth === "unauthorized") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  const topicId = (await params).topicId.trim()
  if (!topicId) return NextResponse.json({ ok: false, error: "缺少 topicId。" }, { status: 400 })
  let config
  try { config = readWorkItemStoreConfig() } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "飞书配置缺失" }, { status: 503 })
  }
  try {
    const records = await createLarkAfuCardWorkItemPorts(config).list()
    const matches = records.filter((record) => String(record.fields["Markdown卡片ID"] ?? "").trim() === topicId)
    if (matches.length > 1) return NextResponse.json({ ok: false, error: `Markdown 卡片 ${topicId} 对应多条经营事项。` }, { status: 409 })
    const record = findAfuCardWorkItem(topicId, records)
    if (!record) return NextResponse.json({ ok: true, found: false, topicId }, { status: 200 })
    return NextResponse.json({ ok: true, found: true, topicId, recordId: record.recordId, workItem: parseFeishuWorkItem(record.fields) }, { status: 200 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "经营事项读取失败" }, { status: 502 })
  }
}
