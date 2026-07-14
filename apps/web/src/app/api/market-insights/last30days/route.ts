import { parseJsonRecord } from "@/lib/api-contract"
import { NextResponse } from "next/server"
import { withUserAuth } from "@/lib/user-auth"
import { runLast30DaysResearch } from "@/lib/market-insights/last30days"
import { logger } from "@/lib/logger"

const SUPPORTED_SOURCES = [
  "weibo",
  "xiaohongshu",
  "bilibili",
  "zhihu",
  "douyin",
  "wechat",
  "baidu",
  "toutiao"
]

export const POST = withUserAuth(async (request) => {
  try {
    let body: { topic?: unknown; sources?: unknown }
    try {
      body = await parseJsonRecord(request)
    } catch {
      return NextResponse.json({ error: "请求格式不正确" }, { status: 400 })
    }

    // 1. 验证主题非空
    const topic = typeof body.topic === "string" ? body.topic.trim() : ""
    if (!topic) {
      return NextResponse.json({ error: "研究主题不能为空" }, { status: 400 })
    }

    // 2. 验证指定渠道合法性
    let sources: string[] | undefined
    if (Array.isArray(body.sources)) {
      sources = body.sources.filter((s): s is string => typeof s === "string")
      
      // 检测是否有不支持的平台
      const invalid = sources.filter(s => !SUPPORTED_SOURCES.includes(s))
      if (invalid.length > 0) {
        return NextResponse.json(
          { error: `不支持的数据源：${invalid.join(", ")}` },
          { status: 400 }
        )
      }
    }

    // 3. 调用底层 Python 进程执行检索
    const result = await runLast30DaysResearch(topic, sources)
    return NextResponse.json(result)

  } catch (err: any) {
    logger.error("Error in POST /api/market-insights/last30days:", err)
    
    // 如果是已知自定义异常（带有友好的中文提示），透传给前端
    const friendlyMessages = [
      "近30天市场讨论暂未启用",
      "近30天市场讨论脚本路径未配置或不存在",
      "近30天市场讨论脚本未找到",
      "请求超时，检索多个平台的讨论耗时较长，请稍后重试",
      "检索数据解析失败，请稍后重试",
      "检索启动失败，请稍后重试",
      "检索失败，请稍后重试"
    ]

    const msg = err instanceof Error ? err.message : String(err)
    if (friendlyMessages.some(m => msg.includes(m))) {
      return NextResponse.json({ error: msg }, { status: 500 })
    }

    // 屏蔽所有其他包含系统路径、变量名称或数据库底层错误的详细 stderr，并统一给出最安全的兜底友好提示
    return NextResponse.json({ error: "检索失败，请稍后重试" }, { status: 500 })
  }
})
