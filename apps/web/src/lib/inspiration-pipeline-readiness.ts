/**
 * 群聊选题管道生产就绪检查（缺口升级 B3）。
 * 不连接外部平台；只检查开关与必要配置是否齐全。
 */

import { env } from "@/env"

export type InspirationReadinessLevel = "disabled" | "shadow" | "evaluate" | "live" | "misconfigured"

export interface InspirationPipelineReadiness {
  level: InspirationReadinessLevel
  ok: boolean
  checks: Array<{ id: string; passed: boolean; detail: string }>
  nextActions: string[]
}

function truthy(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true"
}

/**
 * @description 评估 Inspiration 管道是否达到可生产启用条件
 */
export function assessInspirationPipelineReadiness(
  source: {
    INSPIRATION_PIPELINE_ENABLED?: string
    INSPIRATION_PIPELINE_SHADOW_MODE?: string
    INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE?: string
    BACKGROUND_TASKS_ENABLED?: string
    FEISHU_TOPIC_PIPELINE_ENABLED?: string
    CRON_SECRET?: string
  } = {
    INSPIRATION_PIPELINE_ENABLED: env.INSPIRATION_PIPELINE_ENABLED,
    INSPIRATION_PIPELINE_SHADOW_MODE: env.INSPIRATION_PIPELINE_SHADOW_MODE,
    INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE: env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE,
    BACKGROUND_TASKS_ENABLED: env.BACKGROUND_TASKS_ENABLED,
    FEISHU_TOPIC_PIPELINE_ENABLED: env.FEISHU_TOPIC_PIPELINE_ENABLED,
    CRON_SECRET: env.CRON_SECRET,
  },
): InspirationPipelineReadiness {
  const checks: InspirationPipelineReadiness["checks"] = []
  const enabled = source.INSPIRATION_PIPELINE_ENABLED !== "false"
  checks.push({
    id: "pipeline_enabled",
    passed: enabled,
    detail: enabled ? "管道未显式关闭" : "INSPIRATION_PIPELINE_ENABLED=false",
  })

  const background = source.BACKGROUND_TASKS_ENABLED !== "false"
  checks.push({
    id: "background_tasks",
    passed: background,
    detail: background ? "后台任务可用" : "BACKGROUND_TASKS_ENABLED=false",
  })

  const cron = Boolean(source.CRON_SECRET?.trim())
  checks.push({
    id: "cron_secret",
    passed: cron,
    detail: cron ? "CRON_SECRET 已配置" : "缺少 CRON_SECRET",
  })

  const modeOverride = source.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE?.trim()
  const shadowLegacy = truthy(source.INSPIRATION_PIPELINE_SHADOW_MODE)
  let level: InspirationReadinessLevel = "disabled"
  if (!enabled) {
    level = "disabled"
  } else if (modeOverride === "live") {
    level = "live"
  } else if (modeOverride === "evaluate") {
    level = "evaluate"
  } else if (modeOverride === "capture_only" || shadowLegacy || !modeOverride) {
    level = shadowLegacy || !modeOverride ? "shadow" : "shadow"
  } else {
    level = "misconfigured"
    checks.push({
      id: "execution_mode",
      passed: false,
      detail: `未知 EXECUTION_MODE_OVERRIDE=${modeOverride}`,
    })
  }

  if (level === "live" || level === "evaluate") {
    checks.push({
      id: "not_shadow",
      passed: !shadowLegacy,
      detail: shadowLegacy
        ? "仍设置 INSPIRATION_PIPELINE_SHADOW_MODE=true，会压制回群"
        : "未强制影子压制",
    })
  }

  const feishu = source.FEISHU_TOPIC_PIPELINE_ENABLED !== "false"
  checks.push({
    id: "feishu_entry",
    passed: feishu,
    detail: feishu ? "飞书入口未关闭" : "FEISHU_TOPIC_PIPELINE_ENABLED=false",
  })

  const criticalFailed = checks.some((check) => !check.passed && check.id !== "feishu_entry")
  const ok = enabled && !criticalFailed && level !== "misconfigured"

  const nextActions: string[] = []
  if (!enabled) nextActions.push("设置 INSPIRATION_PIPELINE_ENABLED=true")
  if (!background) nextActions.push("设置 BACKGROUND_TASKS_ENABLED=true")
  if (!cron) nextActions.push("配置 CRON_SECRET")
  if (level === "shadow") {
    nextActions.push("验收后设 INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE=evaluate，再改为 live")
    nextActions.push("影子样本：真实群消息入库但默认不写正式选题、不回群；满 30 条再谈晋升")
  }
  if (level === "live") {
    nextActions.push("确认 ChannelBinding 与视频 fallback 开关后做真实群样本验收")
  }

  return { level, ok, checks, nextActions }
}

/** 人话解释：影子样本是什么（给 UI / 运维文案复用）。 */
export const SHADOW_SAMPLE_PLAIN_LANGUAGE = [
  "影子样本 = 真实群聊里进来的视频/链接消息，在非 live 模式下跑完管道后留下的入库记录。",
  "capture_only：只记录和提取；evaluate：可生成候选观察。",
  "两种都不写正式选题、默认不回群；用来安全攒证据，满 30 条才考虑升档。",
].join(" ")

