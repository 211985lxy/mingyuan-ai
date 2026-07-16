import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { authenticateRequest, authErrorResponse } from "@/lib/user-auth"
import { LLMClient } from "@/lib/llm/client"

// ─── GET /api/inspiration — 获取用户的灵感列表 ───────────────

export async function GET(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const url = new URL(request.url)
    const status = url.searchParams.get("status") // pending | processing | completed | failed
    const limit = Math.min(50, Math.max(1, parseInt(url.searchParams.get("limit") || "20", 10)))

    const items = await prisma.inspiration.findMany({
      where: {
        userId: user.id,
        ...(status ? { aiStatus: status } : {}),
      },
      orderBy: { createdAt: "desc" },
      take: limit,
    })

    return NextResponse.json({ items })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "灵感列表读取失败" },
      { status: 500 }
    )
  }
}

// ─── POST /api/inspiration — 提交灵感（带可选 AI 处理） ───────

export async function POST(request: NextRequest) {
  try {
    const user = await authenticateRequest(request)
    const body = await parseJsonRecord(request)
    const content = typeof body.content === "string" ? body.content.trim() : ""
    const source = typeof body.source === "string" ? body.source.trim() : "text"
    const autoProcess = body.autoProcess !== false // default: auto-process

    if (!content) {
      return NextResponse.json({ error: "灵感内容不能为空" }, { status: 400 })
    }

    if (content.length > 10000) {
      return NextResponse.json({ error: "灵感内容过长，请控制在 10000 字以内" }, { status: 400 })
    }

    // 创建灵感记录
    const inspiration = await prisma.inspiration.create({
      data: {
        userId: user.id,
        source,
        content,
        aiStatus: autoProcess ? "pending" : "completed",
      },
    })

    // 如果需要 AI 处理，异步生成选题
    if (autoProcess) {
      processInspiration(inspiration.id).catch((err) => {
        console.error(`[inspiration/${inspiration.id}] AI processing failed:`, err)
      })
    }

    return NextResponse.json(inspiration, { status: 201 })
  } catch (error) {
    return authErrorResponse(error) ?? NextResponse.json(
      { error: "灵感保存失败" },
      { status: 500 }
    )
  }
}

// ─── AI 处理：分析灵感并生成选题和文案 ─────────────────────

async function processInspiration(inspirationId: string) {
  const llm = LLMClient.shared()

  // 标记处理中
  await prisma.inspiration.update({
    where: { id: inspirationId },
    data: { aiStatus: "processing" },
  })

  try {
    // 获取灵感内容
    const insp = await prisma.inspiration.findUnique({
      where: { id: inspirationId },
    })
    if (!insp) throw new Error("灵感记录不存在")

    // Step 1: 让 AI 从灵感中提取选题建议
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
- 如果灵感包含具体案例/数据/对比，优先围绕这些展开
- 如果灵感比较散，帮用户提炼最值得讲的核心观点`,
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

    // 更新灵感记录，保存生成的选题
    await prisma.inspiration.update({
      where: { id: inspirationId },
      data: {
        aiStatus: "completed",
        generatedTopics: topics.length > 0 ? topics : undefined,
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
