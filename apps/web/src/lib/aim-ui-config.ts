import type { ComponentType } from "react"
import { Activity, LineChart, PenLine, ShieldCheck, Video, Edit3 } from "lucide-react"
import type { ContentFormat } from "@/lib/api/client"
// 身份契约唯一源：aim-harness/contracts.ts。
// AimAgentId 类型 + 运行时校验/归一化逻辑（DEFAULT_AIM_AGENT /
// LEGACY_AGENT_ID_ALIASES / normalizeAimAgentId / isValidAimAgent）已迁出本文件，
// 这里 re-export 以兼容现有从 aim-ui-config 引入这些符号的调用方。
export type { AimAgentId } from "@/lib/aim-harness/contracts"
export {
  DEFAULT_AIM_AGENT,
  normalizeAimAgentId,
  isValidAimAgent,
} from "@/lib/aim-harness/contracts"
import type { AimAgentId } from "@/lib/aim-harness/contracts"
import { DEFAULT_AIM_AGENT, normalizeAimAgentId } from "@/lib/aim-harness/contracts"

/** 智能体的共享元信息（侧边栏与工作台页面的单一事实源） */
export interface AimAgentMeta {
  id: AimAgentId
  title: string
  displayTitle?: string
  description: string
  icon: ComponentType<{ className?: string }>
  defaultFormats: ContentFormat[]
  /**
   * 对用户隐藏的智能体：不进入侧边栏/选择器/对外 agent 列表。
   * 后端路由与合约仍保留该 id 为合法值（历史消息、外部 API 调用、渠道回落
   * 仍可命中），仅 UI 入口不再暴露。归一化由 LEGACY_AGENT_ID_ALIASES 兜底。
   */
  hidden?: boolean
}

export const AIM_AGENT_OPTIONS: AimAgentMeta[] = [
  // 侧栏展示名统一四字；顺序对齐工作流：诊断 → 选题 → 创作 → 编辑 → 复盘
  {
    id: "business_system_diagnosis",
    title: "商业诊断",
    description: "商业模式、流量转化、核心矛盾",
    icon: Activity,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "business_diagnosis",
    title: "选题策划",
    description: "账号对标、内容主线、高潜选题",
    icon: ShieldCheck,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "content_producer",
    title: "内容创作",
    description: "我要搞流量、我要获客、我要讲故事口播",
    icon: Video,
    defaultFormats: ["video_script"],
  },
  {
    id: "free_copywriter",
    title: "交货文案",
    description: "听用户要求，直接交稿；统一创作内置自由模式",
    icon: PenLine,
    defaultFormats: ["raw_copy"],
    // 已并入「内容创作」的自由模式（content_producer + agentModule=free），
    // 不再作为独立入口暴露。保留 id 以兼容历史消息/外部调用/渠道回落。
    hidden: true,
  },
  {
    id: "work_editor",
    // id 保留 work_editor（旧 deep_copywriter 经别名归一）；对外只叫「作品编辑」
    title: "作品编辑",
    description: "二改润色、渠道排版、发布质检",
    icon: Edit3,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "content_review",
    // id 保留 content_review；对外只叫「发布质检」——查问题、标句子、局部改稿
    title: "发布质检",
    description: "标题、钩子、结构、人设一致、风险表达",
    icon: ShieldCheck,
    defaultFormats: ["raw_copy"],
    // 入口已并入「作品编辑」；id、guide 和底层质检引擎完整保留，
    // 用于兼容历史会话、飞书 /质检 命令和外部 Agent API 调用。
    hidden: true,
  },
  {
    id: "content_retro",
    title: "数据复盘",
    description: "已发布内容的数据表现、有效规律、下一步动作",
    icon: LineChart,
    defaultFormats: ["raw_copy"],
  },
]

// AIM_AGENT_IDS / LEGACY_AGENT_ID_ALIASES / normalizeAimAgentId / isValidAimAgent
// 已迁入 @/lib/aim-harness/contracts（顶部 import 并 re-export）。
// 下面保留 getAimAgent：它是 UI 元数据（AIM_AGENT_OPTIONS）专有逻辑，留在 UI 层。

/**
 * @description 根据 ID 获取智能体元信息，非法 ID 回退到默认智能体
 * @param id - 智能体 ID
 * @returns 智能体元信息对象
 */
export function getAimAgent(id: string | null | undefined): AimAgentMeta {
  const normalized = normalizeAimAgentId(id)
  const matched = AIM_AGENT_OPTIONS.find((a) => a.id === (normalized as AimAgentId))
  if (matched) return matched
  return AIM_AGENT_OPTIONS.find((a) => a.id === DEFAULT_AIM_AGENT)!
}
