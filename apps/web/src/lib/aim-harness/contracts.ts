/**
 * AIM Harness — 唯一共享契约（single source of truth）。
 *
 * 这个文件是 AIM 运行时的身份契约唯一源：智能体 id、入口名，以及与 id
 * 同源的运行时校验/归一化逻辑。此前这些定义被散落在 handler、ui-config、
 * harness/types、eval/contracts 四处各自重复声明，靠"字面量相同 + as 强转"
 * 维系一致；现在收敛到这里，所有模块一律 import 本文件。
 *
 * 纯逻辑，无 React / 图标 / 数据库依赖。UI 元数据（标题、图标、默认格式）
 * 仍在 aim-ui-config.ts 维护，只把这里的类型作为 id 的事实源。
 */

/** AIM 七个内容智能体的规范 id（唯一事实源） */
export type AimAgentId =
  | "content_producer"
  | "free_copywriter"
  | "deep_copywriter"
  | "business_system_diagnosis"
  | "business_diagnosis"
  | "content_review"
  | "persona"

/** 四个服务端入口（镜像 AimRunSpec.entrypoint） */
export type AimEntrypoint = "chat" | "generate" | "agent_api" | "inspiration"

/**
 * 与 AimAgentId 字面量同源的合法 id 集合。作为 isValidAimAgent 的运行时依据，
 * 避免"类型字面量"与"运行时校验集合"出现第三份重复源。
 */
export const AIM_AGENT_IDS: ReadonlySet<AimAgentId> = new Set<AimAgentId>([
  "content_producer",
  "free_copywriter",
  "deep_copywriter",
  "business_system_diagnosis",
  "business_diagnosis",
  "content_review",
  "persona",
])

/** 默认智能体（回退值） */
export const DEFAULT_AIM_AGENT: AimAgentId = "content_producer"

/**
 * 旧 id 归一化映射。内容生产官曾用 "ip_video" 作为公开 id（URL、外部 API、
 * 旧 AimGeneration 记录），现已统一为 "content_producer"。保留旧 id 的归一化，
 * 使旧书签链接、旧外部调用、旧数据库行都能正确路由，不报 404。
 */
export const LEGACY_AGENT_ID_ALIASES: Record<string, AimAgentId> = {
  ip_video: "content_producer",
}

/**
 * 把旧别名归一化为当前规范 id。
 * - 空值回退默认智能体；
 * - 命中别名返回映射后的规范 id；
 * - 否则原样返回（是否最终合法由 isValidAimAgent 判定）。
 *
 * 返回 string 而非 AimAgentId：调用方可能传入完全未知的外部 id，归一化阶段
 * 不做合法性断言，留待 isValidAimAgent / getAgentHandler 决定回退策略。
 */
export function normalizeAimAgentId(id: string | null | undefined): string {
  if (!id) return DEFAULT_AIM_AGENT
  return LEGACY_AGENT_ID_ALIASES[id] ?? id
}

/** 判断某个 id 是否是合法的智能体 id（接受旧别名） */
export function isValidAimAgent(id: string | null | undefined): id is AimAgentId {
  if (!id) return false
  return (AIM_AGENT_IDS as Set<string>).has(id) || id in LEGACY_AGENT_ID_ALIASES
}
