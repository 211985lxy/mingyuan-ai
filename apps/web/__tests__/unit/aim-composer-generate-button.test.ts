import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/app/(dashboard)/aim/page.tsx"), "utf8")
const apiClientSource = readFileSync(join(process.cwd(), "src/lib/api/client.ts"), "utf8")
const helperSource = readFileSync(join(process.cwd(), "src/lib/aim/workbench-helpers.ts"), "utf8")
const generationSource = readFileSync(join(process.cwd(), "src/hooks/use-aim-generation-actions.ts"), "utf8")
const chatSource = readFileSync(join(process.cwd(), "src/hooks/use-aim-chat-actions.ts"), "utf8")

describe("AIM composer generate button", () => {
  it("requires current input instead of enabling from old messages", () => {
    const canGenerateBlock = source.match(/canGenerate=\{\s*([\s\S]*?)\s*\}\s*primaryActionLabel=/)?.[1] ?? ""

    expect(canGenerateBlock).toContain("input.trim().length > 0")
    expect(canGenerateBlock).not.toContain("messages.some")
  })

  it("shows the user input and generation status before the generation request finishes", () => {
    const pendingBlock = generationSource.match(/function appendPendingGeneration[\s\S]*?function buildGenerationRequest/)?.[0] ?? ""
    const executeBlock = generationSource.match(/async function executeGeneration[\s\S]*?async function generateWithInput/)?.[0] ?? ""

    expect(pendingBlock).toContain("setMessages((messages) => [")
    expect(pendingBlock).toContain("正在${input.agent.primaryActionLabel}")
    expect(executeBlock).toContain("appendPendingGeneration")
    expect(executeBlock.indexOf("appendPendingGeneration")).toBeLessThan(executeBlock.indexOf("await generateAimContent"))
  })

  it("keeps chat request status inside the assistant message", () => {
    const sendBlock = chatSource.match(/async function sendAimText[\s\S]*?export function useAimChatActions/)?.[0] ?? ""
    const prepareBlock = helperSource.match(/function prepareAimChatTurn[\s\S]*?function reportAimChatRevision/)?.[0] ?? ""

    expect(sendBlock).toContain("prepareAimChatTurn")
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
