import { NextRequest, NextResponse } from "next/server"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { prisma } from "@/lib/prisma"
import { buildContentDistributionClaimDraft } from "@/lib/aim/content-distribution-claim"
import { submitContentDistributionClaim } from "@/lib/aim/content-distribution-claim-submit"
import type { ContentFormat } from "@/lib/aim-generator"
import type { TaskSpec } from "@/lib/task-spec"

export const dynamic = "force-dynamic"

/**
 * POST /api/aim/history/[id]/distribution-claim
 * 一键创建/更新飞书内容增长领取事项；配置缺失时返回可复制草稿。
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const record = await prisma.aimGeneration.findFirst({
      where: { id, userId: user.id },
      select: {
        id: true,
        projectId: true,
        taskSpec: true,
        publishUrl: true,
        publishPlatform: true,
        videoScript: true,
        wechatArticle: true,
        momentsPost: true,
        shootingBrief: true,
        rawCopy: true,
        project: { select: { name: true } },
      },
    })
    if (!record) {
      return NextResponse.json({ error: "生成记录不存在" }, { status: 404 })
    }

    const formats: ContentFormat[] = [
      record.videoScript ? "video_script" as const : null,
      record.wechatArticle ? "wechat_article" as const : null,
      record.momentsPost ? "moments_post" as const : null,
      record.shootingBrief ? "shooting_brief" as const : null,
      record.rawCopy ? "raw_copy" as const : null,
    ].filter(Boolean) as ContentFormat[]

    const origin = request.nextUrl.origin
    const draft = buildContentDistributionClaimDraft({
      generationId: record.id,
      projectId: record.projectId,
      projectName: record.project?.name,
      taskSpec: (record.taskSpec as TaskSpec | null) ?? null,
      formats,
      aimBaseUrl: origin,
      publishUrl: record.publishUrl,
      publishPlatform: record.publishPlatform,
    })

    const result = await submitContentDistributionClaim({ draft })
    if (!result.ok) {
      return NextResponse.json({ error: result.error, draft: result.draft }, { status: 502 })
    }

    return NextResponse.json({
      mode: result.mode,
      created: result.created,
      recordId: result.recordId,
      openUrl: result.openUrl,
      draft: {
        plainText: result.draft.plainText,
        contentPackageName: result.draft.contentPackageName,
        aimContentLink: result.draft.aimContentLink,
      },
      reason: result.mode === "copy_only" ? result.reason : undefined,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: error instanceof Error ? error.message : "创建飞书领取事项失败" },
      { status: 500 },
    )
  }
}
