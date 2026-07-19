import { env } from "@/env"

type LoopRuntimeEnvironment = {
  AIM_BUSINESS_LOOPS_ENABLED?: string
  AIM_LOOP_SHADOW_MODE?: string
  AIM_LOOP_PILOT_PROJECT_IDS?: string
}

export interface LoopRuntimeConfig {
  enabled: boolean
  shadowMode: boolean
  pilotProjectIds: ReadonlySet<string>
}

function runtimeEnvironment(): LoopRuntimeEnvironment {
  return {
    AIM_BUSINESS_LOOPS_ENABLED: env.AIM_BUSINESS_LOOPS_ENABLED,
    AIM_LOOP_SHADOW_MODE: env.AIM_LOOP_SHADOW_MODE,
    AIM_LOOP_PILOT_PROJECT_IDS: env.AIM_LOOP_PILOT_PROJECT_IDS,
  }
}

export function readLoopRuntimeConfig(
  source: LoopRuntimeEnvironment = runtimeEnvironment(),
): LoopRuntimeConfig {
  const enabled = source.AIM_BUSINESS_LOOPS_ENABLED?.trim().toLowerCase() === "true"
  const shadowMode = source.AIM_LOOP_SHADOW_MODE?.trim().toLowerCase() !== "false"
  const pilotProjectIds = new Set(
    (source.AIM_LOOP_PILOT_PROJECT_IDS ?? "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean),
  )
  if (enabled && pilotProjectIds.size === 0) {
    throw new Error("Business Loop 已启用但未配置 AIM_LOOP_PILOT_PROJECT_IDS。")
  }
  return { enabled, shadowMode, pilotProjectIds }
}
