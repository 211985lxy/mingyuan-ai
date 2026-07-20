/**
 * AIM Agent API 生成服务（WP-12 Commit C）。
 *
 * 从 api/agent/v1/aim/generate/route.ts 原样迁出：Agent 调用日志写入，以及生成
 * 请求的构造（输入解析 + 格式校验 + 归一化 + access 断言 + harness 请求对象 +
 * domain 闭包）。路由瘦身到只保留：agent 认证 → 调本模块准备执行 → lastUsedAt
 * 更新 → writeAgentLog(success) → 响应 → catch(writeAgentLog(failed) + 认证错误)。
 *
 * 不可变契约（与原 route 字节一致）：
 *  - 输入校验顺序：rawInput → projectId → 至少一种格式 → 不支持的格式；
 *  - access 断言顺序：assertAgentProjectAccess 先于 assertAgentAccess；
 *  - 错误状态码恒为 400（非 500）；
 *  - 响应字段与 AGENT_DENIED_ACTIONS / warnings:["draft_only"] 不变；
 *  - Harness 入口由 route 直接调用 executeAimRun（满足架构护栏 R1）。
 */
import { NextResponse } from "next/server"
import {
  AGENT_DENIED_ACTIONS,
  findInvalidAgentTargetFormats,
  parseAgentTargetFormats,
  summarizeAgentInput,
} from "@/lib/agent-api-contract"
import type { AgentApiContext } from "@/lib/agent-api-auth"
import { prisma } from "@/lib/prisma"
import type { AimTraceRecorder } from "@/lib/aim-observability"

/** 写入一条 Agent API 调用日志（成功或失败共用，逐字迁出原 route）。 */
/**
 * @description writeagentlog
 * @param params - 参数对象
 * @returns 无返回值
 */
export async function writeAgentLog(params: {
  context: AgentApiContext
  projectId?: string
  agentId?: string
  inputSummary?: string
  outputFormats?: string[]
  status: "success" | "failed"
  errorMessage?: string
  durationMs?: number
  aimGenerationId?: string
}) {
  await prisma.agentApiCallLog.create({
    data: {
      apiKeyId: params.context.apiKeyId,
      userId: params.context.userId,
      projectId: params.projectId || null,
      agentId: params.agentId || null,
      action: "aim.generate",
      inputSummary: params.inputSummary || null,
      outputFormats: params.outputFormats || [],
      status: params.status,
      errorMessage: params.errorMessage || null,
      durationMs: params.durationMs || null,
      aimGenerationId: params.aimGenerationId || null,
    },
  })
}

/** 解析并校验 agent generate 请求体；返回校验错误（首个）或解析后的字段。 */
export type ParsedAgentGenerateBody = {
  rawInput: string
  projectId: string
  agentId: string
  targetFormats: ReturnType<typeof parseAgentTargetFormats>
  inputSummary: string
  instruction?: string
  topicTitle?: string
  topicRationale?: string
}

/**
 * @description 解析agentgeneratebody
 * @param body - 请求体
 * @returns ParsedAgentGenerateBody
 */
export function parseAgentGenerateBody(body: unknown): ParsedAgentGenerateBody {
  const record = (body ?? {}) as Record<string, unknown>
  const rawInput = typeof record.rawInput === "string" ? record.rawInput.trim() : ""
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : ""
  const agentId = typeof record.agentId === "string" ? record.agentId.trim() : ""
  const targetFormats = parseAgentTargetFormats(record.targetFormats)
  const inputSummary = summarizeAgentInput(rawInput)
  return {
    rawInput,
    projectId,
    agentId,
    targetFormats,
    inputSummary,
    instruction: typeof record.instruction === "string" ? record.instruction : undefined,
    topicTitle: typeof record.topicTitle === "string" ? record.topicTitle : undefined,
    topicRationale: typeof record.topicRationale === "string" ? record.topicRationale : undefined,
  }
}

/** 按原 route 顺序校验解析后的字段；返回首个错误文案，全部通过返回 null。 */
/**
 * @description 验证agentgeneratebody
 * @param parsed - 解析后的数据
 * @returns string | null
 */
export function validateAgentGenerateBody(parsed: ParsedAgentGenerateBody): string | null {
  if (!parsed.rawInput) return "请输入内容"
  if (!parsed.projectId) return "请选择 IP 营销全案"
  if (parsed.targetFormats.length === 0) return "请选择至少一种生成格式"
  return null
}

/**
 * 合并 parse + validate + invalidFormats 为单个 prepare（对齐 generate 入口的形态）。
 *
 * 返回判别联合：校验通过返回解析字段；失败返回首个错误文案。注意：调用方拿到
 * `{ok:false}` 后**仍需 throw**（不能提前 return）——agent 的失败日志是审计契约，
 * 必须经 catch → logAgentGenerateFailure 落一条 status:"failed" 记录。校验顺序、
 * 文案与原 route 逐字一致。
 */
export type PreparedAgentGenerateBody =
  | { ok: false; validationError: string }
  | { ok: true } & ParsedAgentGenerateBody

/**
 * @description prepareagentgeneratebody
 * @param body - 请求体
 * @returns PreparedAgentGenerateBody
 */
export function prepareAgentGenerateBody(body: unknown): PreparedAgentGenerateBody {
  const parsed = parseAgentGenerateBody(body)
  const validationError = validateAgentGenerateBody(parsed)
  if (validationError) return { ok: false, validationError }
  const invalidFormats = findInvalidAgentTargetFormats((body as { targetFormats?: unknown })?.targetFormats)
  if (invalidFormats.length > 0) {
    return { ok: false, validationError: formatInvalidFormatsError(invalidFormats) }
  }
  return { ok: true, ...parsed }
}

/**
 * 准备 agent generate 执行所需的全部对象（不调用 Harness —— Harness 调用留在
 * route，满足架构护栏 R1）。
 *
 * 返回：归一化后的 agentId、executeAimRun 请求对象、domain 闭包。
 * 行为与原 route 字段一致，仅搬运到调用方。
 */
/**
 * @description prepareagentaimgeneration
 * @param input - 输入数据
 * @returns 无返回值
 */
export function prepareAgentAimGeneration(input: {
  parsed: ParsedAgentGenerateBody
  /** agentId 归一化函数（透传 normalizeAimAgentId，由 route 传入以保持单一来源） */
  normalizeAgentId: (id: string) => string
  userId: string
}) {
  const { parsed, normalizeAgentId, userId } = input
  // 归一化旧别名（ip_video → content_producer），保证写入 DB / 日志 / 响应的 id 一致
  const agentId = normalizeAgentId(parsed.agentId)

  const runRequest = {
    entrypoint: "agent_api" as const,
    rawInput: parsed.rawInput,
    agentId,
    targetFormats: parsed.targetFormats,
    polishInstruction: parsed.instruction,
    topicTitle: parsed.topicTitle,
    topicRationale: parsed.topicRationale,
    actorId: userId,
    projectId: parsed.projectId,
    runLlmQuality: false,
  }

  const buildDomainInput = (trace?: AimTraceRecorder) => ({
    userId,
    projectId: parsed.projectId,
    rawInput: parsed.rawInput,
    targetFormats: parsed.targetFormats,
    topicTitle: parsed.topicTitle,
    topicRationale: parsed.topicRationale,
    polishInstruction: parsed.instruction,
    trace,
  })

  return { agentId, runRequest, buildDomainInput }
}

/** 把 agent generate 运行结果序列化成对外的 JSON 响应（route 层响应转换）。 */
/**
 * @description 构建agentgenerateresponse
 * @param input - 输入数据
 * @returns 无返回值
 */
export function buildAgentGenerateResponse(input: {
  result: { id: string; results: unknown }
  agentId: string
  projectId: string
  run: {
    metadata: { runId: string; degraded: boolean; provider: string; model: string }
    qualityStatus?: string
  }
  createdAt?: string
}) {
  const { result, agentId, projectId, run, createdAt } = input
  return NextResponse.json({
    id: result.id,
    agentId,
    projectId,
    results: result.results,
    createdAt: createdAt || new Date().toISOString(),
    warnings: ["draft_only"],
    deniedActions: AGENT_DENIED_ACTIONS,
    // Additive harness diagnostics (Phase 4): do not alter existing fields.
    runId: run.metadata.runId,
    degraded: run.metadata.degraded,
    provider: run.metadata.provider,
    model: run.metadata.model,
    qualityStatus: run.qualityStatus,
  })
}

/** 校验失败的格式化文案（与原 route 一致）。 */
/**
 * @description 格式化invalidformatserror
 * @param invalidFormats - invalidFormats
 * @returns string
 */
export function formatInvalidFormatsError(invalidFormats: string[]): string {
  return `不支持的生成格式：${invalidFormats.join(", ")}`
}

/**
 * 生成成功后的收尾：回查 createdAt、更新 apiKey lastUsedAt、写 success 调用日志。
 * 逐字迁出原 route 的 findUnique → agentApiKey.update → writeAgentLog 顺序。
 * 返回 createdAt（供响应序列化）。
 */
/**
 * @description finalizeagentgeneraterun
 * @param input - 输入数据
 * @returns Promise<string | undefined>
 */
export async function finalizeAgentGenerateRun(input: {
  context: AgentApiContext
  projectId: string
  agentId: string
  inputSummary: string
  outputFormats: string[]
  generationId: string
  startedAt: number
}): Promise<string | undefined> {
  const created = await prisma.aimGeneration.findUnique({
    where: { id: input.generationId },
    select: { createdAt: true },
  })

  await prisma.agentApiKey.update({
    where: { id: input.context.apiKeyId },
    data: { lastUsedAt: new Date() },
  })

  await writeAgentLog({
    context: input.context,
    projectId: input.projectId,
    agentId: input.agentId,
    inputSummary: input.inputSummary,
    outputFormats: input.outputFormats,
    status: "success",
    durationMs: Date.now() - input.startedAt,
    aimGenerationId: input.generationId,
  })

  return created?.createdAt.toISOString()
}

/**
 * 失败收尾：仅当 context 已建立时写 failed 调用日志（逐字迁出原 route 的 catch 段）。
 */
/**
 * @description 记录agentgeneratefailure
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function logAgentGenerateFailure(input: {
  context: AgentApiContext | null
  projectId: string
  agentId: string
  inputSummary: string
  outputFormats: string[]
  error: unknown
  startedAt: number
}) {
  if (!input.context) return
  await writeAgentLog({
    context: input.context,
    projectId: input.projectId,
    agentId: input.agentId,
    inputSummary: input.inputSummary,
    outputFormats: input.outputFormats,
    status: "failed",
    errorMessage: input.error instanceof Error ? input.error.message : "生成失败",
    durationMs: Date.now() - input.startedAt,
  })
}
