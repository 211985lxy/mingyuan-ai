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

export const COPY_STUDIO_TITLE = "内容创作官"

/** 当前阶段的作品编辑入口；视频剪辑暂不进入本轮实现。 */
export const WORK_EDITOR_MODULES = ["text", "wechat", "xiaohongshu"] as const
export type WorkEditorModule = (typeof WORK_EDITOR_MODULES)[number]
export const WORK_EDITOR_MODULE_LABELS: Record<WorkEditorModule, string> = {
  text: "文字二改/润色",
  wechat: "公众号排版",
  xiaohongshu: "小红书图文",
}

export const COPY_STUDIO_ROUTE_KEYS: Record<CopyStudioModule, string> = {
  social: "copy_studio.social",
  longform: "copy_studio.longform",
  free: "copy_studio.free",
}

/**
 * @description 判断是否copystudiomodule
 * @param value - 值
 * @returns value is CopyStudioModule
 */
export function isCopyStudioModule(value: unknown): value is CopyStudioModule {
  return typeof value === "string" && COPY_STUDIO_MODULES.includes(value as CopyStudioModule)
}

/** The workbench exposes copy-studio modes only from the content producer. */
/**
 * @description 标准化workbenchcopystudiomodule
 * @param agentId - 智能体 ID
 * @param value - 值
 * @returns CopyStudioModule | undefined
 */
export function normalizeWorkbenchCopyStudioModule(agentId: string, value: unknown): CopyStudioModule | undefined {
  return agentId === "content_producer" && isCopyStudioModule(value) ? value : undefined
}

/**
 * @description copystudiomodulefromroutekey
 * @param routeKey - route键
 * @returns CopyStudioModule | undefined
 */
export function copyStudioModuleFromRouteKey(routeKey: unknown): CopyStudioModule | undefined {
  if (typeof routeKey !== "string" || !routeKey.startsWith("copy_studio.")) return undefined
  return isCopyStudioModule(routeKey.slice("copy_studio.".length))
    ? routeKey.slice("copy_studio.".length) as CopyStudioModule
    : undefined
}

const COPY_STUDIO_COMPATIBLE_AGENT_IDS = new Set([
  "content_producer", "deep_copywriter", "free_copywriter", "ip_video",
])

/** Normalize the additive API aliases before request validation and routing. */
/**
 * @description 标准化requestedcopystudiomodule
 * @param agentModule - 智能体模块
 * @param writerModule - writer模块
 * @returns CopyStudioModule | undefined
 */
export function normalizeRequestedCopyStudioModule(agentModule: unknown, writerModule: unknown): CopyStudioModule | undefined {
  const requested = agentModule ?? writerModule
  return isCopyStudioModule(requested) ? requested : undefined
}

/**
 * @description supportscopystudiomodule
 * @param agentId - 智能体 ID
 * @returns boolean
 */
export function supportsCopyStudioModule(agentId: unknown): boolean {
  return typeof agentId === "string" && COPY_STUDIO_COMPATIBLE_AGENT_IDS.has(agentId)
}

/**
 * @description 解析copystudioroutekey
 * @param value - 值
 * @returns string | null
 */
export function resolveCopyStudioRouteKey(value: unknown): string | null {
  return isCopyStudioModule(value) ? COPY_STUDIO_ROUTE_KEYS[value] : null
}
