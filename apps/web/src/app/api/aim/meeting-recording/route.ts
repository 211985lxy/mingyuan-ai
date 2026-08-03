/**
 * 会议录制转写编排入口（会议纪要 Agent P1）。
 *
 * 把「腾讯会议本地录制 → 云端转写 → meeting-insight 洞察」串成一条同步链路：
 *   前端直传 OSS 拿 assetUrl → 签名 URL → 阿里云录音文件识别（说话人分离）
 *   → 创建经营事项拿 recordId → runMeetingInsightWorkflow（复用，零改动）
 *
 * 文件入口走网页上传（不经飞书 IM，规避 100MB 文件下载上限）。
 * recordId 由 createMeetingWorkItem 自动创建（meeting-insight 要求已存在记录）。
 *
 * 鉴权：用户 JWT（与 /api/aim/transcribe 一致）。
 * api-inventory: auth=jwt, input=json
 */
import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { parseJsonRecord, apiRequestErrorResponse } from "@/lib/api-contract"
import { generateSignedUrl, isManagedOssUrl } from "@/lib/oss"
import { transcribeRecordingFile } from "@/lib/aliyun-asr"
import { createMeetingWorkItem } from "@/lib/aim/services/work-item-creation"
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
// 录音文件识别含提交+轮询，长会议耗时较长；对齐 process-video 的 maxDuration。
export const maxDuration = 120

interface MeetingRecordingRequestBody {
  assetUrl?: string
  projectId?: string
  customer?: string
  meetingTitle?: string
  /** 预期说话人数（2-100）；不填自动判断。 */
  speakerNum?: number
}

function badRequest(message: string) {
  return NextResponse.json({ ok: false, error: message }, { status: 400 })
}

/**
 * @description 处理 POST 请求：录制文件 → 转写 → meeting-insight
 */
export async function POST(request: NextRequest) {
  // 1. 鉴权（用户 JWT）
  let userId: string
  try {
    const auth = await authenticateRequest(request)
    userId = auth.id
  } catch (error) {
    const authResponse = authErrorResponse(error)
    if (authResponse) return authResponse
    return badRequest("未授权。")
  }

  // 2. 解析输入
  let body: MeetingRecordingRequestBody
  try {
    body = (await parseJsonRecord(request)) as MeetingRecordingRequestBody
  } catch (error) {
    return apiRequestErrorResponse(request, error) ?? badRequest("请求体不是合法 JSON。")
  }

  const assetUrl = (body.assetUrl ?? "").trim()
  const projectId = (body.projectId ?? "").trim()
  const customer = (body.customer ?? "").trim()
  const meetingTitle = (body.meetingTitle ?? "").trim()
  const speakerNum = body.speakerNum && body.speakerNum >= 2 ? body.speakerNum : undefined

  if (!assetUrl) return badRequest("缺少 assetUrl：请先直传 OSS 拿到资源 URL。")
  if (!projectId) return badRequest("缺少 projectId。")
  if (!customer) return badRequest("缺少 customer。")
  if (!meetingTitle) return badRequest("缺少 meetingTitle。")

  // 3. 项目归属校验（与 meeting-insight 路由一致，项目零串线）
  const project = await prisma.clientProject.findUnique({
    where: { id: projectId },
    select: { userId: true },
  })
  if (!project || project.userId !== userId) {
    return NextResponse.json(
      { ok: false, error: "项目不存在或不属于当前用户。" },
      { status: 403 },
    )
  }

  // 4. OSS 签名 URL（给阿里云 ASR 公网可读访问）
  const readableUrl = isManagedOssUrl(assetUrl) ? generateSignedUrl(assetUrl, 3600) : assetUrl

  // 5. 录音文件识别（说话人分离）
  let transcription
  try {
    transcription = await transcribeRecordingFile(readableUrl, { speakerNum })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `录音文件识别失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }
  if (!transcription.readableTranscript.trim()) {
    return NextResponse.json(
      { ok: false, error: "转写结果为空，无法生成会议洞察。" },
      { status: 422 },
    )
  }

  // 6. 创建经营事项拿 recordId（meeting-insight 要求已存在记录）
  let config
  try {
    config = readWorkItemStoreConfig()
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "飞书经营事项配置缺失" },
      { status: 503 },
    )
  }

  const ownerUserId = process.env.AIM_WORK_ITEM_OWNER_USER_ID?.trim()
  if (!ownerUserId) {
    return NextResponse.json(
      { ok: false, error: "缺少 AIM_WORK_ITEM_OWNER_USER_ID 配置。" },
      { status: 503 },
    )
  }

  let workItem
  try {
    workItem = await createMeetingWorkItem({ projectId, customer, meetingTitle, config })
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: `创建经营事项失败：${err instanceof Error ? err.message : String(err)}` },
      { status: 502 },
    )
  }

  // 7. meeting-insight 工作流（复用，零改动）
  const store = createLarkWorkItemStore(config)
  const resultSink = createAimGenerationInsightResultSink({ ownerUserId })

  const result = await runMeetingInsightWorkflow(
    {
      recordId: workItem.recordId,
      meetingTitle,
      customer,
      transcript: transcription.readableTranscript,
      projectId,
      actorId: ownerUserId,
    },
    { store, resultSink },
  )

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: result.error,
        recordId: result.recordId,
        transcription: transcription.stats,
      },
      { status: 409 },
    )
  }

  return NextResponse.json(
    {
      ok: true,
      recordId: result.recordId,
      aimResultId: result.aimResultId,
      resultLink: buildAimResultLink(result.aimResultId, projectId),
      transcription: transcription.stats,
    },
    { status: 200 },
  )
}
