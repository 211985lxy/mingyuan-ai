import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/app/(dashboard)/aim/page.tsx"), "utf8")
const apiClientSource = readFileSync(join(process.cwd(), "src/lib/api/client.ts"), "utf8")

describe("AIM composer generate button", () => {
  it("requires current input instead of enabling from old messages", () => {
    const canGenerateBlock = source.match(/canGenerate=\{\s*([\s\S]*?)\s*\}\s*primaryActionLabel=/)?.[1] ?? ""

    expect(canGenerateBlock).toContain("input.trim().length > 0")
    expect(canGenerateBlock).not.toContain("messages.some")
  })

  it("shows the user input and generation status before the generation request finishes", () => {
    const generateBlock = source.match(/async function generateWithInput[\s\S]*?async function handleGenerate/)?.[0] ?? ""

    expect(generateBlock).toContain("setMessages((prev) => [")
    expect(generateBlock).toContain("正在${agent.primaryActionLabel}")
    expect(generateBlock.indexOf("setMessages((prev) => [")).toBeLessThan(generateBlock.indexOf("await generateAimContent"))
  })

  it("keeps chat request status inside the assistant message", () => {
    const sendBlock = source.match(/async function sendText[\s\S]*?async function handleEvolveConversation/)?.[0] ?? ""
    const prepareBlock = source.match(/function prepareChatTurn[\s\S]*?function reportChatRevision/)?.[0] ?? ""

    expect(sendBlock).toContain("prepareChatTurn")
    expect(prepareBlock).toContain("正在思考，会先读取上下文和资料，再给出回复")
    expect(sendBlock).toContain("已停止本次回复")
    expect(sendBlock).toContain("对话失败：")
    expect(source).not.toContain("思考中占位")
    expect(source).not.toContain("LOADING_MESSAGES")
  })

  it("allows long-running generation requests", () => {
    const generateClientBlock = apiClientSource.match(/export async function generateAimContent[\s\S]*?\n}/)?.[0] ?? ""

    expect(generateClientBlock).toContain("timeout: 180000")
  })
})
