import type { ApiTopicCard, ApiTopicRecommendationMode } from "@/types/api"

export type TopicCategory = "daily_inspiration" | "meeting_minutes" | "benchmark_reference" | "user_insight"

export const CATEGORY_META: Record<
  TopicCategory,
  {
    label: string
    description: string
    titlePlaceholder: string
    contentPlaceholder: string
  }
> = {
  daily_inspiration: {
    label: "日常灵感",
    description: "老板随口一句、客户现场一句话、想到的切入角度，都先收进来。",
    titlePlaceholder: "例如：老板晨会金句",
    contentPlaceholder: "记录原话、场景或你想到的选题切口。",
  },
  meeting_minutes: {
    label: "会议纪要",
    description: "把客户访谈、内部复盘、项目会议纪要粘贴进来，提炼真实问题和可拍选题。",
    titlePlaceholder: "例如：7月客户复盘会",
    contentPlaceholder: "粘贴会议纪要、访谈记录、讨论要点。保留原话、问题、分歧、案例和下一步动作。",
  },
  benchmark_reference: {
    label: "参考素材",
    description: "人工粘贴优质账号链接、爆款标题、开头方式或结构拆解。",
    titlePlaceholder: "例如：某优质账号爆款开头",
    contentPlaceholder: "贴链接、标题、开头文案，或你观察到的结构节奏。",
  },
  user_insight: {
    label: "用户洞察",
    description: "来自客户在选题策划和总聊天框里的真实输入，系统沉淀后再进入选题。",
    titlePlaceholder: "",
    contentPlaceholder: "",
  },
}

export const CATEGORY_ORDER: TopicCategory[] = [
  "daily_inspiration",
  "meeting_minutes",
  "benchmark_reference",
  "user_insight",
]

export const MODE_META: Record<ApiTopicRecommendationMode, { label: string; description: string }> = {
  normal: {
    label: "常规选题",
    description: "基于现有素材，给你一组能直接判断的选题。",
  },
  daily: {
    label: "每日选题日报",
    description: "先告诉你今天主推哪条，再补充原因和备选。",
  },
  weekly: {
    label: "本周选题",
    description: "把本周值得拍的方向先排出来，方便继续筛。",
  },
}

export const SCARCITY_BADGE: Record<string, string> = {
  scenery: "稀缺·景观",
  emotion: "稀缺·情感",
  beauty: "稀缺·美好",
  info: "稀缺·资讯",
  curio: "稀缺·奇闻",
  event: "稀缺·事件",
}

export const RHETORIC_BADGE: Record<string, string> = {
  fu: "赋",
  bi: "比",
  xing: "兴",
}

export const NOVELTY_HIGH = 75
export const NOVELTY_LOW = 60

export const VERDICT_META: Record<
  NonNullable<ApiTopicCard["reviewVerdict"]>,
  { label: string; className: string }
> = {
  strong: { label: "主推", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  usable: { label: "可用", className: "border-sky-200 bg-sky-50 text-sky-700" },
  observe: { label: "观察", className: "border-amber-200 bg-amber-50 text-amber-700" },
  revise: { label: "需优化", className: "border-rose-200 bg-rose-50 text-rose-700" },
}
