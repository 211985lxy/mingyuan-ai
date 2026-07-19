import { NextRequest, NextResponse } from "next/server"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { checkWorkItemApiSecret } from "@/lib/aim/work-item-api-auth"
import { upsertAfuCardWorkItem, type AfuCardWorkItemInput } from "@/lib/aim/afu-card-bridge"
import { createLarkAfuCardWorkItemPorts, readWorkItemStoreConfig } from "@/lib/aim/work-item-store"

export const dynamic = "force-dynamic"

const WORKFLOWS = new Set(["内容增长", "销售诊断", "咨询交付"])

function badRequest(error: string) {
  return NextResponse.json({ ok: false, error }, { status: 400 })
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : ""
}

export async function POST(request: NextRequest) {
  const auth = checkWorkItemApiSecret(request)
  if (auth === "unconfigured") return NextResponse.json({ ok: false, error: "AIM_WORK_ITEM_API_SECRET 未配置，入口已 fail-closed。" }, { status: 503 })
  if (auth === "unauthorized") return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })

  let body: Record<string, unknown>
  try { body = await parseJsonRecord(request) } catch (error) {
    return apiRequestErrorResponse(request, error) ?? badRequest("请求体不是合法 JSON。")
  }
  const workflow = text(body.workflow)
  if (!text(body.topicId) || !text(body.title) || !text(body.aimProjectId) || !WORKFLOWS.has(workflow)) {
    return badRequest("需要 topicId、title、aimProjectId，以及合法的 workflow。")
  }

  let config
  try { config = readWorkItemStoreConfig() } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "飞书配置缺失" }, { status: 503 })
  }
  const input: AfuCardWorkItemInput = {
    topicId: text(body.topicId), title: text(body.title), workflow: workflow as AfuCardWorkItemInput["workflow"],
    aimProjectId: text(body.aimProjectId), inputSummary: text(body.inputSummary), sourcePath: text(body.sourcePath) || undefined,
    scheduledStart: text(body.scheduledStart) || undefined, scheduledEnd: text(body.scheduledEnd) || undefined,
    calendarEventId: text(body.calendarEventId) || undefined, ownerOpenId: text(body.ownerOpenId) || undefined,
  }
  try {
    const result = await upsertAfuCardWorkItem(input, createLarkAfuCardWorkItemPorts(config))
    if (!result.ok) return NextResponse.json(result, { status: 409 })
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "经营事项写入失败" }, { status: 502 })
  }
}
