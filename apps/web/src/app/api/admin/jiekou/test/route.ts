import { env } from "@/env"
import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import OpenAI from "openai"

/**
 * 中转站测试接口（仅 admin，知识库后台）
 * - 支持两个通道：JieKou（接口AI）/ OpenRouter
 * - OpenRouter 通道可调用免费模型（:free 后缀，200 次/天）
 * - 支持 stream 模式
 */

type ProviderName = "jiekou" | "openrouter"

const PROVIDER_CONFIGS: Record<
  ProviderName,
  { apiKey?: string; baseURL: string; defaultModel: string }
> = {
  jiekou: {
    apiKey: env.JIEKOU_API_KEY,
    baseURL: env.JIEKOU_BASE_URL || "https://api.highwayapi.ai/openai",
    defaultModel: env.JIEKOU_MODEL || "gpt-4o",
  },
  openrouter: {
    apiKey: env.OPENROUTER_API_KEY,
    baseURL: env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
    defaultModel: env.OPENROUTER_MODEL || "anthropic/claude-sonnet-4.6",
  },
}

export const POST = withAdminAuth(async (request: NextRequest) => {
  const body = await request.json()
  const { messages, model, temperature, max_tokens, stream } = body
  const providerName: ProviderName = body.provider === "openrouter" ? "openrouter" : "jiekou"
  const providerConfig = PROVIDER_CONFIGS[providerName]

  // 基础校验
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: "messages 必须是非空数组" }, { status: 400 })
  }

  if (!providerConfig.apiKey) {
    return NextResponse.json(
      { error: `${providerName === "openrouter" ? "OPENROUTER_API_KEY" : "JIEKOU_API_KEY"} 未配置` },
      { status: 500 }
    )
  }

  const client = new OpenAI({
    apiKey: providerConfig.apiKey,
    baseURL: providerConfig.baseURL,
    timeout: 120000,
    // OpenRouter 推荐的来源标识（非必须，但更规范）
    defaultHeaders:
      providerName === "openrouter"
        ? {
            "HTTP-Referer": env.NEXT_PUBLIC_APP_URL || "https://aimingdong.com",
            "X-Title": "Mingyuan AIM Admin",
          }
        : undefined,
  })

  const requestModel = model || providerConfig.defaultModel
  const requestTemperature = typeof temperature === "number" ? temperature : 0.7
  const requestMaxTokens = typeof max_tokens === "number" ? max_tokens : 4000
  const requestStream = stream === true

  try {
    if (requestStream) {
      // 流式输出
      const streamResponse = await client.chat.completions.create({
        model: requestModel,
        messages,
        temperature: requestTemperature,
        max_tokens: requestMaxTokens,
        stream: true,
      })

      const encoder = new TextEncoder()
      const readable = new ReadableStream({
        async start(controller) {
          try {
            for await (const chunk of streamResponse) {
              const delta = chunk.choices[0]?.delta

              if (delta?.content) {
                const sseData = `data: ${JSON.stringify({
                  content: delta.content,
                  done: false,
                })}\n\n`
                controller.enqueue(encoder.encode(sseData))
              }

              if (chunk.choices[0]?.finish_reason) {
                controller.enqueue(encoder.encode("data: [DONE]\n\n"))
                controller.close()
                break
              }
            }
          } catch (error) {
            console.error(`[${providerName}/test] Stream error:`, error)
            controller.error(error)
          }
        },
      })

      return new NextResponse(readable, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
          // 关闭 nginx 代理缓冲，确保 SSE 事件即时下发，避免长耗时时 504
          "X-Accel-Buffering": "no",
        },
      })
    } else {
      // 常规输出
      const response = await client.chat.completions.create({
        model: requestModel,
        messages,
        temperature: requestTemperature,
        max_tokens: requestMaxTokens,
        stream: false,
      })

      const choice = response.choices[0]
      if (!choice?.message?.content) {
        return NextResponse.json({ error: `${providerName} 返回空响应` }, { status: 500 })
      }

      return NextResponse.json({
        content: choice.message.content,
        model: response.model,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : null,
      })
    }
  } catch (error) {
    console.error(`[${providerName}/test] Error:`, error)
    const message = error instanceof Error ? error.message : `${providerName} 调用失败`
    // 免费模型超限时给出更友好的提示
    const hint = message.includes("429")
      ? "（可能是免费模型达到每日 200 次上限，换个模型或明天再试）"
      : ""
    return NextResponse.json({ error: message + hint }, { status: 500 })
  }
})
