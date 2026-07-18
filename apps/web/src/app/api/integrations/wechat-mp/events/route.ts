import { NextResponse } from "next/server"
import { createHash } from "node:crypto"
import { detectVideoLinks } from "@/lib/content-pipeline"
import { processVideo } from "@/lib/content-pipeline"

/**
 * 微信公众号消息接收端点（路由二）
 *
 * 微信公众号后台配置"服务器地址(URL)"指向此端点。
 * 当用户发送包含视频号链接的消息时：
 *   1. 验证微信签名（GET 请求）
 *   2. 接收消息（POST 请求，XML 格式）
 *   3. 提取视频链接 → 触发处理流水线 → 写入飞书 Base
 *   4. 返回被动回复文本
 *
 * 环境变量：
 *   WECHAT_MP_TOKEN         — 公众号后台设置的 Token（用于签名验证）
 *   WECHAT_MP_ENCODING_AES_KEY — 消息加解密密钥（可选，明文模式不需要）
 *   WECHAT_MP_APP_ID        — 公众号 AppID
 *   WECHAT_MP_APP_SECRET    — 公众号 AppSecret
 */

// ─── 微信签名验证 ──────────────────────────────────────────────

function verifyWechatSignature(
  token: string,
  signature: string,
  timestamp: string,
  nonce: string,
): boolean {
  const arr = [token, timestamp, nonce].sort()
  const str = arr.join("")
  const hash = createHash("sha1").update(str).digest("hex")
  return hash === signature
}

// ─── XML 解析 ──────────────────────────────────────────────────

function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  // 简易 XML 解析（微信公众号消息结构简单，不需要完整 XML 解析器）
  const patterns = [
    /<MsgType><!\[CDATA\[([^\]]*)\]\]><\/MsgType>/,
    /<Content><!\[CDATA\[([^\]]*)\]\]><\/Content>/,
    /<FromUserName><!\[CDATA\[([^\]]*)\]\]><\/FromUserName>/,
    /<ToUserName><!\[CDATA\[([^\]]*)\]\]><\/ToUserName>/,
    /<MsgId>(\d+)<\/MsgId>/,
    /<CreateTime>(\d+)<\/CreateTime>/,
  ]

  const fieldNames = ["MsgType", "Content", "FromUserName", "ToUserName", "MsgId", "CreateTime"]

  for (let i = 0; i < patterns.length; i++) {
    const match = xml.match(patterns[i])
    if (match) {
      result[fieldNames[i]] = match[1]
    }
  }

  return result
}

// ─── XML 回复构建 ────────────────────────────────────────────

// 将任意文本安全地嵌入 XML CDATA 段：转义 `]]>` 防止提前闭合注入。
// 例：含 `]]>` 的串会被拆成 `]]]]><![CDATA[>`，解析后还原为原始 `]]>`。
function cdataEscape(value: string): string {
  return value.replace(/\]\]>/g, "]]]]><![CDATA[>")
}

function buildTextReply(toUser: string, fromUser: string, content: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `<xml>
  <ToUserName><![CDATA[${cdataEscape(toUser)}]]></ToUserName>
  <FromUserName><![CDATA[${cdataEscape(fromUser)}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${cdataEscape(content)}]]></Content>
</xml>`
}

// ─── GET：微信服务器验证 ──────────────────────────────────────

export async function GET(request: Request) {
  const token = process.env.WECHAT_MP_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ error: "WECHAT_MP_TOKEN not configured" }, { status: 503 })
  }

  const { searchParams } = new URL(request.url)
  const signature = searchParams.get("msg_signature") || searchParams.get("signature") || ""
  const timestamp = searchParams.get("timestamp") || ""
  const nonce = searchParams.get("nonce") || ""
  const echostr = searchParams.get("echostr") || ""

  if (!verifyWechatSignature(token, signature, timestamp, nonce)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 })
  }

  return new NextResponse(echostr)
}

// ─── POST：接收消息 ──────────────────────────────────────────

export async function POST(request: Request) {
  const token = process.env.WECHAT_MP_TOKEN?.trim()
  if (!token) {
    return NextResponse.json({ error: "WECHAT_MP_TOKEN not configured" }, { status: 503 })
  }

  try {
    // 验证签名
    const { searchParams } = new URL(request.url)
    const signature = searchParams.get("msg_signature") || searchParams.get("signature") || ""
    const timestamp = searchParams.get("timestamp") || ""
    const nonce = searchParams.get("nonce") || ""

    if (!verifyWechatSignature(token, signature, timestamp, nonce)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 403 })
    }

    // 解析 XML 消息
    const xml = await request.text()
    const msg = parseXml(xml)

    const { MsgType, Content, FromUserName, ToUserName } = msg

    // 只处理文本消息
    if (MsgType !== "text" || !Content) {
      return new NextResponse("success", { headers: { "Content-Type": "text/plain" } })
    }

    // 检测视频链接
    const detection = detectVideoLinks(Content)

    if (!detection.hasLinks) {
      // 无视频链接，返回提示
      const reply = buildTextReply(
        FromUserName,
        ToUserName,
        "请发送视频号链接，我会自动提取文案并生成总结，存入素材库。",
      )
      return new NextResponse(reply, { headers: { "Content-Type": "application/xml" } })
    }

    // 有视频链接，触发处理流水线
    const firstLink = detection.links[0]

    // 异步处理（不阻塞微信 5s 响应超时）
    processVideo({
      videoUrl: firstLink.url,
      source: "视频号",
      contextText: detection.textWithoutLinks,
    }).catch(() => {
      // 处理异常时静默
    })

    // 立即回复（被动回复）
    const platformLabel = firstLink.platform === "channels" ? "视频号" :
      firstLink.platform === "douyin" ? "抖音" : firstLink.platform

    const reply = buildTextReply(
      FromUserName,
      ToUserName,
      `✅ 收到${platformLabel}视频链接，正在提取文案并生成总结...\n处理完成后结果将存入飞书素材库。`,
    )

    return new NextResponse(reply, { headers: { "Content-Type": "application/xml" } })
  } catch (error) {
    // 微信要求返回 "success" 表示已处理（即使出错也不返回错误码）
    return new NextResponse("success", { headers: { "Content-Type": "text/plain" } })
  }
}
