/** 采访意图路由共享类型 — 从 aim-turn-intent.ts 拆出避免循环依赖 */

export type AimTurnIntentAction =
  | "create"
  | "local_edit"
  | "rewrite"
  | "review"
  | "position"
  | "chat"
  | "interview_build_profile"

export type AimTurnIntentScope =
  | "opening"
  | "title"
  | "ending"
  | "cta"
  | "full"
  | "unspecified"
  | "ip_profile"

export interface AimTurnIntent {
  /** 给模型与用户看的一句话意图 */
  summary: string
  action: AimTurnIntentAction
  scope: AimTurnIntentScope
  /** 交付物可读名，如「小红书图文」「口播脚本」 */
  deliverable: string
  /** 必须保留 */
  keep: string[]
  /** 明确禁止 */
  avoid: string[]
  /** 档案缺口（缺卖点/案例等），生成前应提示用户 */
  archiveGaps: string[]
  /** 用户在确认条补充的说明（不改变 action/scope） */
  userSupplement?: string
}
