import { describe, expect, it } from "vitest"

import {
  AIM_GENERATE_REQUEST_BUDGET_BYTES,
  fitAimGenerateRequestBody,
  serializeAimGenerateRequestBody,
} from "@/lib/aim/generate-payload-budget"

const bytes = (text: string) => new TextEncoder().encode(text).byteLength

describe("AIM generate payload budget", () => {
  it("leaves normal requests unchanged", () => {
    const body = {
      agentId: "content_producer",
      rawInput: "写一条短视频口播",
      targetFormats: ["video_script" as const],
    }

    expect(fitAimGenerateRequestBody(body)).toEqual(body)
  })

  it("truncates oversized conversation history in rawInput by UTF-8 bytes", () => {
    const latest = "【本次生成输入】\n按当前拆解重新生成，保留这个结尾"
    const body = {
      agentId: "content_producer",
      rawInput: `【本轮对话】\n${"助手：旧成稿".repeat(20_000)}\n\n${latest}`,
      targetFormats: ["video_script" as const],
      polishInstruction: "润色说明".repeat(8_000),
    }

    const fitted = fitAimGenerateRequestBody(body)
    expect(bytes(JSON.stringify(fitted))).toBeLessThanOrEqual(AIM_GENERATE_REQUEST_BUDGET_BYTES)
    expect(fitted.rawInput).toContain("按当前拆解重新生成")
    expect(fitted.rawInput).toContain("保留这个结尾")
  })

  it("serializeAimGenerateRequestBody stays under the client budget", () => {
    const serialized = serializeAimGenerateRequestBody({
      agentId: "content_producer",
      rawInput: `必须保留开头${"中文素材".repeat(40_000)}必须保留结尾`,
      targetFormats: ["video_script"],
    })
    const parsed = JSON.parse(serialized) as { rawInput: string }

    expect(bytes(serialized)).toBeLessThanOrEqual(AIM_GENERATE_REQUEST_BUDGET_BYTES)
    expect(parsed.rawInput).toContain("必须保留开头")
    expect(parsed.rawInput).toContain("必须保留结尾")
  })
})
