import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"
import type { Prisma } from "@/generated/prisma/client"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await authenticateRequest(request)
    const { id } = await params

    const inspiration = await prisma.inspiration.findFirst({
      where: { id, userId: user.id },
    })
    if (!inspiration) {
      return NextResponse.json({ error: "灵感记录不存在" }, { status: 404 })
    }
    if (inspiration.aiStatus === "processing") {
      return NextResponse.json({ error: "灵感正在处理中，请稍后" }, { status: 409 })
    }

    // 标记处理中，异步执行
    await prisma.inspiration.update({
      where: { id },
      data: { aiStatus: "processing" },
    })

    // 异步处理，不阻塞响应
    processInspiration(id).catch((err) => {
      console.error(`[inspiration/${id}] re-process failed:`, err)
    })

    return NextResponse.json({ ok: true, message: "AI 处理已启动" })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "AI 处理启动失败" },
      { status: 500 }
    )
  }
}

async function processInspiration(inspirationId: string) {
  const llm = LLMClient.shared()

  try {
    const insp = await prisma.inspiration.findUnique({
      where: { id: inspirationId },
    })
    if (!insp) throw new Error("灵感记录不存在")

    // Step 1: 生成选题
    const topicResult = await llm.complete({
      messages: [
        {
          role: "system",
          content: `你是一个短视频选题策划专家。根据用户提供的灵感内容，提炼出 2-3 个可拍摄的短视频选题。

输出严格 JSON 格式：
{
  "topics": [
    {
      "title": "选题标题（2-20字）",
      "rationale": "一句话说明为什么这个选题适合拍成短视频（20-60字）"
    }
  ]
}

要求：
- 选题必须是用户灵感中能自然延伸的，不是凭空生成
- 选题要考虑到短视频的传播性、共鸣感和行动引导
- 如果灵感包含具体案例/数据/对比，优先围绕这些展开`,
        },
        {
          role: "user",
          content: `我的灵感是：\n\n${insp.content}`,
        },
      ],
      temperature: 0.7,
      maxTokens: 1024,
      responseFormat: { type: "json_object" },
    })

    let topics: Array<{ title: string; rationale: string }> = []
    try {
      const parsed = JSON.parse(topicResult.content)
      topics = Array.isArray(parsed.topics) ? parsed.topics.slice(0, 3) : []
    } catch {
      topics = []
    }

    await prisma.inspiration.update({
      where: { id: inspirationId },
      data: {
        aiStatus: "completed",
        generatedTopics: topics.length > 0 ? (topics as unknown as Prisma.InputJsonValue) : undefined,
        errorMessage: null,
      },
    })
  } catch (error) {
    await prisma.inspiration.update({
      where: { id: inspirationId },
      data: {
        aiStatus: "failed",
        errorMessage: error instanceof Error ? error.message : "AI 处理失败",
      },
    })
  }
}
