import { describe, expect, it } from "vitest"

import {
  AIM_CHAT_REQUEST_BUDGET_BYTES,
  fitAimChatRequestBody,
  serializeAimChatRequestBody,
} from "@/lib/aim/chat-payload-budget"

const bytes = (text: string) => new TextEncoder().encode(text).byteLength

describe("AIM chat payload budget", () => {
  it("leaves normal requests unchanged", () => {
    const body = {
      messages: [{ role: "user" as const, content: "帮我优化开头" }],
      agentId: "content_producer",
      stream: true,
    }

    expect(fitAimChatRequestBody(body)).toEqual(body)
  })

  it("drops oldest turns while preserving the latest request", () => {
    const latest = "按当前拆解重新生成，保留这个结尾"
    const body = {
      messages: [
        { role: "user" as const, content: "旧需求".repeat(16_000) },
        { role: "assistant" as const, content: "旧成稿".repeat(16_000) },
        { role: "user" as const, content: latest },
      ],
      agentId: "content_producer",
      stream: true,
    }

    const fitted = fitAimChatRequestBody(body)
    expect(fitted.messages).toEqual([{ role: "user", content: latest }])
    expect(bytes(JSON.stringify(fitted))).toBeLessThanOrEqual(AIM_CHAT_REQUEST_BUDGET_BYTES)
  })

  it("bounds a single oversized turn and editor context by UTF-8 bytes", () => {
    const serialized = serializeAimChatRequestBody({
      messages: [{
        role: "user",
        content: `必须保留开头${"中文素材".repeat(30_000)}必须保留结尾`,
      }],
      agentId: "content_producer",
      stream: true,
      editorContext: {
        action: "对标改写",
        referenceSelection: "参考".repeat(20_000),
        draftSelection: "选区".repeat(20_000),
        draftText: "草稿".repeat(60_000),
      },
    })
    const parsed = JSON.parse(serialized) as {
      messages: Array<{ content: string }>
    }

    expect(bytes(serialized)).toBeLessThanOrEqual(AIM_CHAT_REQUEST_BUDGET_BYTES)
    expect(parsed.messages[0].content).toContain("必须保留开头")
    expect(parsed.messages[0].content).toContain("必须保留结尾")
  })

  it("replaces an image URL that cannot fit in the request", () => {
    const serialized = serializeAimChatRequestBody({
      messages: [{
        role: "user",
        content: [{
          type: "image_url",
          image_url: { url: `https://example.com/${"x".repeat(160_000)}` },
        }],
      }],
      agentId: "content_producer",
      stream: true,
    })
    const parsed = JSON.parse(serialized) as {
      messages: Array<{ content: Array<{ type: string; text?: string }> }>
    }

    expect(bytes(serialized)).toBeLessThanOrEqual(AIM_CHAT_REQUEST_BUDGET_BYTES)
    expect(parsed.messages[0].content).toEqual([
      { type: "text", text: "图片链接过大，请重新上传后再试。" },
    ])
  })
})
