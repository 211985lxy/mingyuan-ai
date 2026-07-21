import type { ComponentType } from "react"
import { Activity, Compass, PenLine, ShieldCheck, Video, Edit3 } from "lucide-react"
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
}

export const AIM_AGENT_OPTIONS: AimAgentMeta[] = [
  {
    id: "business_system_diagnosis",
    title: "商业模式诊断",
    description: "商业模式、流量转化、核心矛盾",
    icon: Activity,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "business_diagnosis",
    title: "灵感选题策划",
    description: "账号对标、内容主线、高潜选题",
    icon: ShieldCheck,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "content_producer",
    title: "内容文案创作",
    displayTitle: "内容创作官",
    description: "社媒速产、深度长文、自由交付",
    icon: Video,
    defaultFormats: ["video_script"],
  },
  {
    id: "free_copywriter",
    title: "交货文案创作",
    description: "听用户要求，直接交稿；统一创作官内置自由模式",
    icon: PenLine,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "deep_copywriter",
    title: "作品编辑",
    displayTitle: "作品编辑官",
    description: "文字二改、公众号排版、小红书图文",
    icon: Edit3,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "content_review",
    title: "发布前质检",
    description: "标题、钩子、结构、风险表达",
    icon: ShieldCheck,
    defaultFormats: ["raw_copy"],
  },
  {
    id: "persona",
    title: "人设故事梳理",
    description: "来时路、人设故事、置顶脚本",
    icon: Compass,
    defaultFormats: ["video_script"],
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
