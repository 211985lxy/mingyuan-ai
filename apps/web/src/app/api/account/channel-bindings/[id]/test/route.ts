import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @param options - 配置选项
 * @returns 无返回值
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params
    const binding = await prisma.channelBinding.findFirst({
      where: { id, userId: user.id },
      include: { project: { select: { status: true } } },
    })
    if (!binding) return NextResponse.json({ error: "群聊绑定不存在" }, { status: 404 })
    const configured = binding.platform === "feishu"
      ? env.FEISHU_TOPIC_PIPELINE_ENABLED !== "false" && Boolean(env.FEISHU_APP_ID && env.FEISHU_APP_SECRET && env.FEISHU_VERIFICATION_TOKEN)
      : binding.platform === "workbuddy_wechat"
        ? env.WORKBUDDY_WECHAT_ENABLED === "true"
        : env.WECOM_INSPIRATION_ENABLED === "true" && Boolean(env.WECOM_CALLBACK_TOKEN && env.WECOM_ENCODING_AES_KEY && env.WECOM_CORP_ID)
    return NextResponse.json({
      ok: binding.status === "active" && binding.project.status === "active" && configured,
      checks: {
        bindingActive: binding.status === "active",
        projectActive: binding.project.status === "active",
        platformConfigured: configured,
      },
      note: binding.platform === "workbuddy_wechat" ? "仍需在专用设备和白名单群完成真实收发与异步回群验收。" : undefined,
    })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json({ error: "群聊绑定测试失败" }, { status: 500 })
  }
}
