/**
 * Minimal real completion probe for AIM model routes.
 * Usage: pnpm --filter @mingyuan/web llm:probe -- --route content_producer
 * Does not print API keys, Authorization headers, proxy credentials, or response bodies.
 */
import { AGENT_ROUTES } from "../src/lib/llm/agent-router"
import { getProviderConfigs } from "../src/lib/llm/config"
import { OpenAICompatibleProvider } from "../src/lib/llm/provider"
import { summarizeAimRouteProbe, type AimProbeHop } from "../src/lib/llm/provider-circuit"

function parseRoute(argv: string[]): string {
  const index = argv.indexOf("--route")
  if (index >= 0 && argv[index + 1]) return argv[index + 1]
  return "content_producer"
}

function redact(value: string): string {
  return value
    .replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/Bearer\s+\S+/gi, "Bearer [redacted]")
}

async function probeHop(name: string, model: string, timeoutMs?: number, maxRetries?: number): Promise<AimProbeHop> {
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
      messages: [{ role: "user", content: "Reply with the single word OK." }],
      // 推理型模型（DeepSeek v4 pro / 文心 5.1）会先消耗思考 token，
      // 预算太小会得到空正文，把健康线路误报成 failed。
      maxTokens: 512,
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
    const result = await probeHop(hop.name, model, hop.timeoutMs, hop.maxRetries)
    results.push(result)
    console.info("[llm-probe]", {
      name: result.name,
      model: result.model,
      status: result.status,
      durationMs: result.durationMs ?? null,
    })
  }
  const summary = summarizeAimRouteProbe(results)
  console.info("[llm-probe]", { route, ok: summary.ok })
  process.exit(summary.ok ? 0 : 1)
}

void main()
