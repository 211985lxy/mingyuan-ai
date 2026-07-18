/**
 * 统一创作台的模块契约。
 * 落库与权限仍使用旧的 AimAgentId；模块只决定当前请求使用哪条模型路由。
 */
export type CopyStudioModule =
  | "social"
  | "longform"
  | "free"

export const COPY_STUDIO_MODULES = ["social", "longform", "free"] as const satisfies readonly CopyStudioModule[]

export const COPY_STUDIO_MODULE_LABELS: Record<CopyStudioModule, string> = {
  social: "社媒速产",
  longform: "深度长文",
  free: "自由交付",
}

export const COPY_STUDIO_ROUTE_KEYS: Record<CopyStudioModule, string> = {
  social: "copy_studio.social",
  longform: "copy_studio.longform",
  free: "copy_studio.free",
}

export function isCopyStudioModule(value: unknown): value is CopyStudioModule {
  return typeof value === "string" && COPY_STUDIO_MODULES.includes(value as CopyStudioModule)
}

export function resolveCopyStudioRouteKey(value: unknown): string | null {
  return isCopyStudioModule(value) ? COPY_STUDIO_ROUTE_KEYS[value] : null
}
