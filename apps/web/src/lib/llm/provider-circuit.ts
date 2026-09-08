import { redis } from "@/lib/redis"
import type { ProviderErrorKind } from "./telemetry"

export type CircuitFailureKind =
  | "timeout"
  | "network"
  | "server"
  | "empty_response"
  | "rate_limit"
  | "balance"
  | "auth"
  | "model_unavailable"

export type AimProbeStatus = "healthy" | "failed" | "unconfigured"

export type AimProbeHop = {
  name: string
  model: string
  status: AimProbeStatus
  durationMs?: number
}

export interface ProviderCircuitStore {
  get(key: string): Promise<string | null>
  set(key: string, value: string, ttlSeconds?: number): Promise<void>
  del(key: string): Promise<void>
}

type CircuitState = {
  consecutiveFailures: number
  lastFailureAt: number
  openedUntil: number | null
  halfOpen: boolean
}

const FIVE_MIN_MS = 5 * 60 * 1000
const FIFTEEN_MIN_MS = 15 * 60 * 1000
const STORE_TTL_SECONDS = 20 * 60
const REDIS_BUDGET_MS = 150
const RETRYABLE_KINDS = new Set<CircuitFailureKind>(["timeout", "network", "server", "empty_response"])
const SEVERE_KINDS = new Set<CircuitFailureKind>(["rate_limit", "balance", "auth", "model_unavailable"])

let redisFallbackLogged = false

function logRedisFallback(): void {
  if (redisFallbackLogged) return
  redisFallbackLogged = true
  console.warn("[llm-circuit] redis unavailable, using process memory")
}

function withBudget<T>(task: Promise<T>, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      logRedisFallback()
      resolve(fallback)
    }, REDIS_BUDGET_MS)
    task.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        logRedisFallback()
        resolve(fallback)
      },
    )
  })
}

function circuitKey(provider: string, model: string, scope?: string): string {
  const safeScope = encodeURIComponent(scope?.trim() || "global")
  return `aim:llm:circuit:${safeScope}:${provider}:${model}`
}

function logCircuit(event: Record<string, string | number | boolean | null>): void {
  console.info("[llm-circuit]", event)
}

function bindCircuitStorage(store?: ProviderCircuitStore) {
  const memory = new Map<string, string>()
  async function read(key: string): Promise<CircuitState | null> {
    let raw = memory.get(key) ?? null
    if (raw == null && store) {
      try {
        raw = await withBudget(store.get(key), null)
        if (raw) memory.set(key, raw)
      } catch {
        logRedisFallback()
      }
    }
    if (!raw) return null
    try {
      return JSON.parse(raw) as CircuitState
    } catch {
      return null
    }
  }
  async function write(key: string, state: CircuitState | null): Promise<void> {
    if (!state) {
      memory.delete(key)
      if (store) void withBudget(store.del(key), undefined).catch(logRedisFallback)
      return
    }
    const raw = JSON.stringify(state)
    memory.set(key, raw)
    if (store) void withBudget(store.set(key, raw, STORE_TTL_SECONDS), undefined).catch(logRedisFallback)
  }
  return { read, write }
}

function stateAfterFailure(prev: CircuitState | null, kind: CircuitFailureKind, t: number): CircuitState | null {
  const severe = SEVERE_KINDS.has(kind)
  const retryable = RETRYABLE_KINDS.has(kind)
  if (!severe && !retryable) return null
  if (prev?.halfOpen) {
    return { consecutiveFailures: 1, lastFailureAt: t, openedUntil: t + (severe ? FIFTEEN_MIN_MS : FIVE_MIN_MS), halfOpen: false }
  }
  if (severe) {
    return { consecutiveFailures: 1, lastFailureAt: t, openedUntil: t + FIFTEEN_MIN_MS, halfOpen: false }
  }
  const withinWindow = Boolean(prev && t - prev.lastFailureAt <= FIVE_MIN_MS)
  const consecutiveFailures = withinWindow ? prev!.consecutiveFailures + 1 : 1
  return {
    consecutiveFailures,
    lastFailureAt: t,
    openedUntil: consecutiveFailures >= 2 ? t + FIVE_MIN_MS : null,
    halfOpen: false,
  }
}

export function createProviderCircuit(opts?: {
  now?: () => number
  store?: ProviderCircuitStore
}): {
  isOpen(provider: string, model: string, scope?: string): Promise<boolean>
  recordFailure(provider: string, model: string, kind: CircuitFailureKind, scope?: string): Promise<void>
  recordSuccess(provider: string, model: string, scope?: string): Promise<void>
} {
  const now = opts?.now ?? Date.now
  const io = bindCircuitStorage(opts?.store)
  return {
    async isOpen(provider, model, scope) {
      const key = circuitKey(provider, model, scope)
      const state = await io.read(key)
      if (!state) return false
      const t = now()
      if (state.openedUntil != null && t < state.openedUntil) return true
      if (state.halfOpen) return true
      if (state.openedUntil != null && t >= state.openedUntil) {
        await io.write(key, { ...state, halfOpen: true, openedUntil: null })
        return false
      }
      return false
    },
    async recordFailure(provider, model, kind, scope) {
      const next = stateAfterFailure(await io.read(circuitKey(provider, model, scope)), kind, now())
      if (!next) return
      await io.write(circuitKey(provider, model, scope), next)
      logCircuit({ provider, model, scope: scope || "global", kind, consecutiveFailures: next.consecutiveFailures, openedUntil: next.openedUntil })
    },
    async recordSuccess(provider, model, scope) {
      await io.write(circuitKey(provider, model, scope), null)
    },
  }
}

function createRedisStore(): ProviderCircuitStore {
  return {
    get: (key) => redis.get(key),
    async set(key, value, ttlSeconds = STORE_TTL_SECONDS) {
      await redis.setex(key, ttlSeconds, value)
    },
    del: async (key) => {
      await redis.del(key)
    },
  }
}

function shouldUseRedisStore(): boolean {
  return process.env.NODE_ENV !== "test"
}

let defaultCircuit = createProviderCircuit(
  shouldUseRedisStore() ? { store: createRedisStore() } : undefined,
)

export function resetProviderCircuitForTests(): void {
  redisFallbackLogged = false
  defaultCircuit = createProviderCircuit()
}

export async function isProviderCircuitOpen(provider: string, model: string, scope?: string): Promise<boolean> {
  try {
    return await defaultCircuit.isOpen(provider, model, scope)
  } catch {
    return false
  }
}

export async function recordProviderCircuitFailure(
  provider: string,
  model: string,
  kind: CircuitFailureKind,
  scope?: string,
): Promise<void> {
  try {
    await defaultCircuit.recordFailure(provider, model, kind, scope)
  } catch {
    // Circuit bookkeeping must never block generation.
  }
}

export async function recordProviderCircuitSuccess(provider: string, model: string, scope?: string): Promise<void> {
  try {
    await defaultCircuit.recordSuccess(provider, model, scope)
  } catch {
    // Circuit bookkeeping must never block generation.
  }
}

export function circuitKindFromProviderError(
  kind: ProviderErrorKind,
  message: string,
): CircuitFailureKind | null {
  if (kind === "timeout" || kind === "network") return kind
  if (kind === "server") {
    return /(empty response|empty completion|empty choice|no output)/i.test(message)
      ? "empty_response"
      : "server"
  }
  if (kind === "auth" || kind === "model_unavailable") return kind
  if (kind === "rate_limit") {
    return /(balance|额度|余额|quota|credit|billing|402)/i.test(message) ? "balance" : "rate_limit"
  }
  if (kind === "unknown") return "server"
  return null
}

export async function observeProviderCircuit(
  provider: string,
  model: string,
  outcome: { ok: true } | { ok: false; kind: ProviderErrorKind; message: string },
  scope?: string,
): Promise<void> {
  if (outcome.ok) {
    await recordProviderCircuitSuccess(provider, model, scope)
    return
  }
  const kind = circuitKindFromProviderError(outcome.kind, outcome.message)
  if (kind) await recordProviderCircuitFailure(provider, model, kind, scope)
}

export function summarizeAimRouteProbe(results: AimProbeHop[]): { ok: boolean } {
  const firstThree = results.slice(0, 3)
  return { ok: firstThree.length === 3 && firstThree.every((hop) => hop.status === "healthy") }
}
