/**
 * Minimal real completion probe for AIM model routes.
 * Usage: pnpm --filter @mingyuan/web llm:probe -- --route content_producer [--task generation]
 * Does not print API keys, Authorization headers, proxy credentials, or response bodies.
 *
 * 两种探针任务形状（2026-09-11 选题链事故教训：理解型探针测不出生成型故障——
 * 豆包 seed 回 "OK" 只要 5s，但生成 4 张结构化卡 120s+ 直接超时）：
 *   - understanding（默认）：单句回显，验证连通/鉴权/协议。
 *   - generation：要求输出多段结构化 JSON，暴露思考型模型在生成任务上的
 *     真实延迟与 token 预算问题，结果按该跳的 timeoutMs 判定。
 */
import { AGENT_ROUTES } from "../src/lib/llm/agent-router"
import { getProviderConfigs } from "../src/lib/llm/config"
import { OpenAICompatibleProvider } from "../src/lib/llm/provider"
import { summarizeAimRouteProbe, type AimProbeHop } from "../src/lib/llm/provider-circuit"

type ProbeTask = "understanding" | "generation"

function parseRoute(argv: string[]): string {
  const index = argv.indexOf("--route")
  if (index >= 0 && argv[index + 1]) return argv[index + 1]
  return "content_producer"
}

function parseTask(argv: string[]): ProbeTask {
  const index = argv.indexOf("--task")
  if (index >= 0 && argv[index + 1] === "generation") return "generation"
  return "understanding"
}

function buildProbeMessages(task: ProbeTask) {
  if (task === "generation") {
    return [
      {
        role: "system",
        content:
          "你是内容策划助手。输出必须是合法 JSON，结构为 {\"cards\":[{\"title\":string,\"reason\":string,\"score\":number}]}，共 3 张卡，每张 reason 不少于 40 字。除 JSON 外不要输出任何内容。",
      },
      {
        role: "user",
        content: "围绕「小餐馆老板如何用短视频获客」生成 3 张选题卡，角度分别是成本、信任、复购。",
      },
    ] as { role: "system" | "user"; content: string }[]
  }
  return [{ role: "user", content: "Reply with the single word OK." }] as { role: "user"; content: string }[]
}

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
}

async function probeHop(
  name: string,
  model: string,
  task: ProbeTask,
  timeoutMs?: number,
  maxRetries?: number,
): Promise<AimProbeHop> {
  const config = getProviderConfigs().find((item) => item.name === name)
  if (!config) return { name, model, status: "unconfigured" }
  const provider = new OpenAICompatibleProvider({
    ...config,
    ...(model ? { defaultModel: model } : {}),
    ...(timeoutMs !== undefined ? { timeoutMs } : {}),
    ...(maxRetries !== undefined ? { maxRetries } : {}),
  })
  if (!provider.isAvailable()) return { name, model, status: "unconfigured" }
  const startedAt = Date.now()
  try {
    const result = await provider.complete({
      messages: buildProbeMessages(task),
      // 推理型模型（DeepSeek v4 pro / 文心 5.1）会先消耗思考 token，
      // 预算太小会得到空正文，把健康线路误报成 failed；生成型任务正文更长。
      maxTokens: task === "generation" ? 4096 : 512,
    })
    const durationMs = Date.now() - startedAt
    if (result.content.trim()) {
      return { name, model: result.model || model, status: "healthy", durationMs }
    }
    return { name, model, status: "failed", durationMs }
  } catch (error) {
    const durationMs = Date.now() - startedAt
    const message = redact(error instanceof Error ? error.message : String(error))
    console.info("[llm-probe]", { name, model, status: "failed", durationMs, error: message.slice(0, 160) })
    return { name, model, status: "failed", durationMs }
  }
}

async function main(): Promise<void> {
  const route = parseRoute(process.argv.slice(2))
  const task = parseTask(process.argv.slice(2))
  const hops = AGENT_ROUTES[route]
  if (!hops) {
    console.error(`[llm-probe] unknown route ${route}`)
    process.exit(1)
  }
  const results: AimProbeHop[] = []
  const providerConfigs = getProviderConfigs()
  for (const hop of hops) {
    // hop 未显式指定模型时回落到 provider 默认模型，而不是把 provider 名当模型名
    const config = providerConfigs.find((item) => item.name === hop.name)
    const model = hop.model || config?.defaultModel || hop.name
    const result = await probeHop(hop.name, model, task, hop.timeoutMs, hop.maxRetries)
    results.push(result)
    console.info("[llm-probe]", {
      task,
      name: result.name,
      model: result.model,
      status: result.status,
      durationMs: result.durationMs ?? null,
    })
  }
  const summary = summarizeAimRouteProbe(results)
  console.info("[llm-probe]", { route, task, ok: summary.ok })
  process.exit(summary.ok ? 0 : 1)
}

void main()
