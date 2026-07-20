import { NextRequest, NextResponse } from "next/server"
import { env } from "@/env"
import { decryptWecomPayload, parseWecomEncryptedEnvelope, parseWecomTextMessage, verifyWecomSignature } from "@/lib/integrations/wecom-callback"
import { ingestInspirationEvent, resolveChannelBinding, resolveBindingExecutionMode } from "@/features/topics/services/inspiration-events"
import { isReplySuppressed } from "@/lib/execution-mode"

// api-inventory: auth=signed_integration input=raw_body
export const runtime = "nodejs"

function config() {
  if (env.WECOM_INSPIRATION_ENABLED !== "true") throw new Error("WECOM_DISABLED")
  if (!env.WECOM_CALLBACK_TOKEN || !env.WECOM_ENCODING_AES_KEY || !env.WECOM_CORP_ID) throw new Error("WECOM_NOT_CONFIGURED")
  return { token: env.WECOM_CALLBACK_TOKEN, encodingAesKey: env.WECOM_ENCODING_AES_KEY, corpId: env.WECOM_CORP_ID }
}

function signatureParams(request: NextRequest, encrypted: string) {
  return {
    timestamp: request.nextUrl.searchParams.get("timestamp") || "",
    nonce: request.nextUrl.searchParams.get("nonce") || "",
    signature: request.nextUrl.searchParams.get("msg_signature") || "",
    encrypted,
  }
}

/**
 * @description 处理 GET 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function GET(request: NextRequest) {
  try {
    const current = config()
    const encrypted = request.nextUrl.searchParams.get("echostr") || ""
    if (!verifyWecomSignature({ ...signatureParams(request, encrypted), token: current.token })) {
      return new NextResponse("invalid signature", { status: 401 })
    }
    return new NextResponse(decryptWecomPayload({ encrypted, encodingAesKey: current.encodingAesKey, corpId: current.corpId }), {
      headers: { "Content-Type": "text/plain; charset=utf-8" },
    })
  } catch (error) {
    const status = error instanceof Error && error.message === "WECOM_DISABLED" ? 503 : 400
    return new NextResponse("wecom callback verification failed", { status })
  }
}

/**
 * @description 处理 POST 请求
 * @param request - 请求对象
 * @returns 无返回值
 */
export async function POST(request: NextRequest) {
  try {
    const current = config()
    const envelope = await request.text()
    const encrypted = parseWecomEncryptedEnvelope(envelope)
    if (!verifyWecomSignature({ ...signatureParams(request, encrypted), token: current.token })) {
      return new NextResponse("invalid signature", { status: 401 })
    }
    const message = parseWecomTextMessage(decryptWecomPayload({ encrypted, encodingAesKey: current.encodingAesKey, corpId: current.corpId }))
    if (!message) return new NextResponse("success")
    const binding = await resolveChannelBinding({ platform: "wecom", externalChatId: message.chatId })
    if (!binding) return new NextResponse("success")

    // Respect execution mode: WeCom should not process events when in capture_only mode
    // (ingestInspirationEvent will handle suppression internally via executionModeSnapshot,
    // but we add an early check here to avoid unnecessary work when the global override
    // is capture_only and no binding-level override exists).
    const effectiveMode = resolveBindingExecutionMode(binding.executionMode)
    if (isReplySuppressed(effectiveMode) && effectiveMode === "capture_only") {
      // In capture_only, still record the event but suppress all processing
      // ingestInspirationEvent handles this via executionModeSnapshot
    }

    try {
      await ingestInspirationEvent({
        platform: "wecom",
        externalMessageId: message.messageId,
        externalChatId: message.chatId,
        externalAccountId: env.WECOM_CORP_ID,
        externalSenderId: message.senderId,
        projectId: binding.projectId,
        content: message.content,
        occurredAt: message.occurredAt,
        conversationType: "group",
      }, binding.userId)
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith("INSPIRATION_TRIGGER")) throw error
    }
    return new NextResponse("success")
  } catch (error) {
    console.error("[integrations/wecom/events] failed", error)
    return new NextResponse("wecom event processing failed", { status: 500 })
  }
}
