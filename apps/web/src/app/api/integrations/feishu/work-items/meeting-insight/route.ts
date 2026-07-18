/**
 * 客户会议洞察执行入口（90 天计划 2.2）。
 *
 * 把一条飞书经营事项 + 会议原文推进为「待人工审核」的结构化会议洞察：
 *   待处理 → 处理中 → 抽取九类洞察 → AimGeneration 落盘 → 待人工审核。
 *
 * 鉴权：Authorization: Bearer <AIM_WORK_ITEM_API_SECRET>（与 execute 入口同一密钥）。
 *   密钥未配置 → 503（fail-closed）；密钥错误/缺失 → 401。
 *
 * 请求体：{ recordId, projectId, meetingTitle, customer, transcript }
 *   - recordId / projectId / transcript 必填；
 *   - projectId 必须存在且属于 AIM_WORK_ITEM_OWNER_USER_ID（客户会议不允许
 *     落到全局知识空间，也不允许写到他人项目）。
 *
 * 响应：
 *   200 成功（含幂等命中，idempotent:true；重复执行不重复消耗模型、不重复落盘）
 *   400 输入不合法（坏 JSON / 缺必填项）
 *   401 未授权
 *   403 项目不存在或不属于经营事项负责人
 *   409 工作流失败（含失败回写后的可行动错误，不伪造结果）
 *   503 服务密钥 / 飞书配置 / 负责人配置缺失（fail-closed）
 */
import { NextRequest, NextResponse } from "next/server"
import { apiRequestErrorResponse, parseJsonRecord } from "@/lib/api-contract"
import { checkWorkItemApiSecret } from "@/lib/aim/work-item-api-auth"
import {
  createLarkWorkItemStore,
  readWorkItemStoreConfig,
} from "@/lib/aim/work-item-store"
import { runMeetingInsightWorkflow } from "@/lib/aim/meeting-workflow"
import {
  buildAimResultLink,
  createAimGenerationInsightResultSink,
} from "@/lib/aim/meeting-insight-result-sink"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

interface MeetingInsightRequestBody {
  recordId?: string
  projectId?: string
  meetingTitle?: string
  customer?: string
  transcript?: string
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

export async function POST(request: NextRequest) {
  const auth = checkWorkItemApiSecret(request)
  if (auth === "unconfigured") {
    return NextResponse.json(
      { ok: false, error: "经营事项入口服务密钥未配置（AIM_WORK_ITEM_API_SECRET），fail-closed。" },
      { status: 503 },
    )
  }
  if (auth === "unauthorized") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
  }

  let body: MeetingInsightRequestBody
  try {
    body = (await parseJsonRecord(request)) as MeetingInsightRequestBody
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? badRequest("请求体不是合法 JSON。")
  }

  const recordId = (body.recordId ?? "").trim()
  const projectId = (body.projectId ?? "").trim()
  const meetingTitle = (body.meetingTitle ?? "").trim()
  const customer = (body.customer ?? "").trim()
  const transcript = (body.transcript ?? "").trim()

  if (!recordId) return badRequest("缺少 recordId。")
  if (!projectId) return badRequest("缺少 projectId：客户会议必须绑定客户项目。")
  if (!meetingTitle) return badRequest("缺少 meetingTitle。")
  if (!customer) return badRequest("缺少 customer。")
  if (!transcript) return badRequest("缺少 transcript：会议原文为空，禁止凭空抽取。")

  // 结果归属人：只来自服务端配置，不由请求指定。
  const ownerUserId = process.env.AIM_WORK_ITEM_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    return NextResponse.json(
      { ok: false, error: "会议洞察入口缺少 AIM_WORK_ITEM_OWNER_USER_ID 配置，fail-closed。" },
      { status: 503 },
    )
  }

  // 项目归属校验：必须存在且属于经营事项负责人（项目之间零串线）。
  const project = await prisma.clientProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project || project.userId !== ownerUserId) {
    return NextResponse.json(
      { ok: false, error: "项目不存在或不属于经营事项负责人，拒绝执行。" },
      { status: 403 },
    )
  }

  let config
  try {
    config = readWorkItemStoreConfig()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "飞书配置缺失" },
      { status: 503 },
    )
  }
  const store = createLarkWorkItemStore(config)
  const resultSink = createAimGenerationInsightResultSink({ ownerUserId })

  const result = await runMeetingInsightWorkflow(
    { recordId, meetingTitle, customer, transcript, projectId },
    { store, resultSink },
  )

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error, status: result.status, recordId: result.recordId },
      { status: 409 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      status: result.status,
      idempotent: result.idempotent,
      recordId: result.recordId,
      aimResultId: result.aimResultId,
      resultLink: buildAimResultLink(result.aimResultId, projectId),
    },
    { status: 200 },
  )
}
