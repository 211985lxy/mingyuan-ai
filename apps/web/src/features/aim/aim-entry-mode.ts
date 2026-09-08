/**
 * /aim 首屏模式（Step④ 首屏即对话）。
 *
 * 默认 conversation：/aim 直接渲染对话工作台，不再先弹入口选择页。
 * 一键回滚：设置 NEXT_PUBLIC_AIM_LANDING_DEFAULT="entry" 恢复入口选择页。
 * 显式入口参数（agent/mode/projectId/stage/generationId）在任何模式下都不走 landing。
 */

export type AimLandingMode = "conversation" | "entry"

export function aimLandingMode(): AimLandingMode {
  return process.env.NEXT_PUBLIC_AIM_LANDING_DEFAULT === "entry" ? "entry" : "conversation"
}

function hasExplicitEntryParams(searchParams: URLSearchParams): boolean {
  return searchParams.has("agent")
    || searchParams.has("mode")
    || searchParams.has("projectId")
    || searchParams.has("stage")
    || searchParams.has("generationId")
}

export function shouldShowAimEntrySwitch(searchParams: URLSearchParams): boolean {
  if (aimLandingMode() === "entry") {
    return !hasExplicitEntryParams(searchParams)
  }
  return false
}
