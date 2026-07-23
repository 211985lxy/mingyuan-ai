import { createHash } from "node:crypto"
import { NextResponse } from "next/server"
import { detectVideoLinks, processVideo } from "@/lib/content-pipeline"

/**
 * 微信公众号消息接收端点（路由二）
 *
 * 环境变量：
 *   WECHAT_MP_TOKEN      — 公众号后台设置的 Token
 *   WECHAT_MP_APP_ID     — 公众号 AppID
 */
// api-inventory: auth=signed_integration

// ─── 签名验证 ──────────────────────────────────────────────────

function verifySignature(token: string, signature: string, timestamp: string, nonce: string): boolean {
  const arr = [token, timestamp, nonce].sort()
  const hash = createHash("sha1").update(arr.join("")).digest("hex")
  return hash === signature
}

// ─── XML 解析 ──────────────────────────────────────────────────

function parseXml(xml: string): Record<string, string> {
  const result: Record<string, string> = {}
  const patterns: Array<[string, RegExp]> = [
    ["MsgType", /<MsgType><!\[CDATA\[([^\]]*)\]\]><\/MsgType>/],
    ["Content", /<Content><!\[CDATA\[([^\]]*)\]\]><\/Content>/],
    ["FromUserName", /<FromUserName><!\[CDATA\[([^\]]*)\]\]><\/FromUserName>/],
    ["ToUserName", /<ToUserName><!\[CDATA\[([^\]]*)\]\]><\/ToUserName>/],
    ["MsgId", /<MsgId>(\d+)<\/MsgId>/],
    ["CreateTime", /<CreateTime>(\d+)<\/CreateTime>/],
  ]
  for (const [key, pattern] of patterns) {
    const match = xml.match(pattern)
    if (match) result[key] = match[1]
  }
  return result
}

function buildTextReply(toUser: string, fromUser: string, content: string): string {
  const timestamp = Math.floor(Date.now() / 1000)
  return `<xml>
  <ToUserName><![CDATA[${toUser}]]></ToUserName>
  <FromUserName><![CDATA[${fromUser}]]></FromUserName>
  <CreateTime>${timestamp}</CreateTime>
  <MsgType><![CDATA[text]]></MsgType>
  <Content><![CDATA[${content}]]></Content>
</xml>`
}

// ─── GET：微信服务器验证 ──────────────────────────────────────

export async function GET(request: Request) {
  const token = process.env.WECHAT_MP_TOKEN?.trim()
  if (!token) return NextResponse.json({ error: "WECHAT_MP_TOKEN not configured" }, { status: 503 })

  const { searchParams } = new URL(request.url)
  const signature = searchParams.get("msg_signature") || searchParams.get("signature") || ""
  const timestamp = searchParams.get("timestamp") || ""
  const nonce = searchParams.get("nonce") || ""
  const echostr = searchParams.get("echostr") || ""

  if (!verifySignature(token, signature, timestamp, nonce)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 403 })
  }

  return new NextResponse(echostr)
}

// ─── POST：接收消息 ──────────────────────────────────────────

export async function POST(request: Request) {
  const token = process.env.WECHAT_MP_TOKEN?.trim()
  if (!token) return NextResponse.json({ error: "WECHAT_MP_TOKEN not configured" }, { status: 503 })

  try {
    const { searchParams } = new URL(request.url)
    const signature = searchParams.get("msg_signature") || searchParams.get("signature") || ""
    const timestamp = searchParams.get("timestamp") || ""
    const nonce = searchParams.get("nonce") || ""

    if (!verifySignature(token, signature, timestamp, nonce)) {
      return NextResponse.json({ error: "invalid signature" }, { status: 403 })
    }

    const xml = await request.text()
    const msg = parseXml(xml)
    const { MsgType, Content, FromUserName, ToUserName } = msg

    if (MsgType !== "text" || !Content) {
      return new NextResponse("success", { headers: { "Content-Type": "text/plain" } })
    }

    const detection = detectVideoLinks(Content)

    if (!detection.hasLinks) {
      const reply = buildTextReply(
        FromUserName, ToUserName,
        "请发送视频号链接，我会自动提取文案并生成总结，存入素材库。",
      )
      return new NextResponse(reply, { headers: { "Content-Type": "application/xml" } })
    }

    const firstLink = detection.links[0]
    const pipelineUserId = process.env.CONTENT_PIPELINE_USER_ID || ""

    processVideo({
      videoUrl: firstLink.url,
      source: "视频号",
      contextText: detection.textWithoutLinks,
      userId: pipelineUserId || undefined,
    }).catch(() => {})

    const platformLabel =
      firstLink.platform === "channels" ? "视频号" :
      firstLink.platform === "douyin" ? "抖音" : firstLink.platform

    const reply = buildTextReply(
      FromUserName, ToUserName,
      `✅ 收到${platformLabel}视频链接，正在执行处理流水线（5a-5e）...\n处理完成后结果将存入飞书素材库。`,
    )

    return new NextResponse(reply, { headers: { "Content-Type": "application/xml" } })
  } catch {
    return new NextResponse("success", { headers: { "Content-Type": "text/plain" } })
  }
}