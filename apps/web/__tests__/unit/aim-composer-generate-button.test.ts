import { readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"

const source = readFileSync(join(process.cwd(), "src/app/(dashboard)/aim/page.tsx"), "utf8")
const aimApiSource = readFileSync(join(process.cwd(), "src/lib/api/aim.ts"), "utf8")
const helperSource = readFileSync(join(process.cwd(), "src/lib/aim/workbench-helpers.ts"), "utf8")
const generationSource = readFileSync(join(process.cwd(), "src/hooks/use-aim-generation-actions.ts"), "utf8")
const chatSource = readFileSync(join(process.cwd(), "src/hooks/use-aim-chat-actions.ts"), "utf8")

describe("AIM composer generate button", () => {
  it("requires current input instead of enabling from old messages", () => {
    const canGenerateBlock = source.match(/canGenerate=\{\s*([\s\S]*?)\s*\}\s*primaryActionLabel=/)?.[1] ?? ""
    const canGenerateDefinition =
      source.match(/const canGenerateBase =([^\n]+)/)?.[1] ?? ""

    expect(canGenerateBlock).toContain("canGenerateBase")
    expect(canGenerateDefinition).toContain("w.input.trim().length > 0")
    expect(canGenerateDefinition).not.toContain("messages.some")
  })

  it("shows the user input and generation status before the generation request finishes", () => {
    const pendingBlock = generationSource.match(/function appendPendingGeneration[\s\S]*?function buildGenerationRequest/)?.[0] ?? ""
    const executeBlock = generationSource.match(/async function executeGeneration[\s\S]*?async function generateWithInput/)?.[0] ?? ""

    expect(pendingBlock).toContain("getAimPendingGenerationMessage(input.projectEnabled, input.agent.primaryActionLabel)")
    expect(generationSource).toContain("正在${actionLabel}，会读取当前项目资料并匹配知识库")
    expect(generationSource).toContain("正在${actionLabel}，将根据本次输入生成交付物")
    expect(executeBlock).toContain("appendPendingGeneration")
    expect(executeBlock.indexOf("appendPendingGeneration")).toBeLessThan(executeBlock.indexOf("await generateAimContent"))
  })

  it("applies the raw generation result before background proofread", () => {
    const executeBlock = generationSource.match(/async function executeGeneration[\s\S]*?async function generateWithInput/)?.[0] ?? ""
    expect(executeBlock).toContain("applyGenerationResponse(input, assistantMessageId, currentInput, response)")
    expect(executeBlock).toContain("softProofreadInBackground")
    expect(executeBlock.indexOf("applyGenerationResponse")).toBeLessThan(executeBlock.indexOf("softProofreadInBackground"))
    expect(executeBlock).not.toMatch(/await proofreadAimResponse/)
    expect(generationSource).toContain("async function softProofreadInBackground")
    expect(generationSource).toMatch(/await proofreadAimResponse\(response, input\.agent\.defaultInstruction\)/)
    expect(generationSource).toContain("if (response.fastPath) return")
  })

  it("appends a new assistant turn after every follow-up generation request", () => {
    const pendingBlock = generationSource.match(/function appendPendingGeneration[\s\S]*?function buildGenerationRequest/)?.[0] ?? ""
    expect(pendingBlock).not.toContain("findLatestDeliverableMessage")
    expect(pendingBlock).not.toContain("inPlace")
    expect(pendingBlock).toContain('role: "user" as const')
    expect(pendingBlock).toContain('role: "assistant" as const')
    expect(pendingBlock.indexOf('role: "user" as const')).toBeLessThan(pendingBlock.indexOf('role: "assistant" as const'))
    expect(pendingBlock).toContain("pendingScrollMessageIdRef.current = assistantMessageId")
  })

  it("keeps generated documents in the conversation instead of rendering a right editor panel", () => {
    expect(source).not.toContain("BenchmarkEditorPanel")
    expect(source).not.toContain("onEditResult")
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
    const generateClientBlock = aimApiSource.match(/export async function generateAimContent[\s\S]*?\n}/)?.[0] ?? ""

    expect(generateClientBlock).toContain("timeout: 180000")
  })

  it("aborts the previous in-flight request before starting a new generation", () => {
    expect(generationSource).toContain("beginExclusiveRequest")
    expect(generationSource).toContain("requestAbortRef.current?.abort()")
    expect(generationSource).toContain("endExclusiveRequest")
    expect(generationSource).toContain("generateAimContentWithTransientRetry")
    expect(generationSource).toContain("isTransientGenerateFailure")
  })

  it("does not clear busy when a newer request has taken over the abort ref", () => {
    const endBlock = generationSource.match(/function endExclusiveRequest[\s\S]*?\n}/)?.[0] ?? ""
    expect(endBlock).toContain("requestAbortRef.current === controller")
    expect(endBlock).toContain("clearBusy()")
  })
})
