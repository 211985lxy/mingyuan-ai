/**
 * 粉丝画像分布：飞书列名与序列化格式的单一事实源。
 *
 * 写入端（douyin-lark-sync）与读取端（数据看板 summary-mapping）共用这里的列名，
 * 避免两边各写一份中文字段名而漂移。
 *
 * 存储格式：单列存 JSON 文本（`[{"value":"男","percent":0.62},…]`），
 * 不使用多列拆占比，是因为维度数量会随抖音开放能力变化，拆列需要改表结构。
 *
 * 注意：官方接口对 percent 的语义（占比 / 百分数 / 绝对数）未在文档中写明，
 * 因此这里原样存值，由展示层按数值范围推断。
 */

export const FANS_DISTRIBUTION_FIELDS = {
  gender: "粉丝性别分布",
  ages: "粉丝年龄分布",
  regions: "粉丝地域分布",
} as const

export type FansDistributionItem = { value: string; percent: number }

/** 序列化为飞书文本列的值；空分布返回空串，表示该维度确实没有数据。 */
export function serializeFansDistribution(items?: FansDistributionItem[] | null): string {
  if (!items || items.length === 0) return ""
  return JSON.stringify(items.map((x) => ({ value: x.value, percent: x.percent })))
}

/** 解析飞书文本列；容忍 JSON 字符串与已是数组的两种形态，非法输入返回 null。 */
export function parseFansDistribution(raw: unknown): FansDistributionItem[] | null {
  if (raw == null) return null
  let list: unknown = raw
  if (typeof raw === "string") {
    const text = raw.trim()
    if (!text) return null
    try {
      list = JSON.parse(text)
    } catch {
      return null
    }
  }
  if (!Array.isArray(list)) return null
  const items = list
    .map((x) => {
      if (x == null || typeof x !== "object") return null
      const value = String((x as { value?: unknown }).value ?? "").trim()
      const percent = Number((x as { percent?: unknown }).percent)
      if (!value || Number.isNaN(percent)) return null
      return { value, percent }
    })
    .filter((x): x is FansDistributionItem => x !== null)
  return items.length > 0 ? items : null
}

/**
 * 展示用：把原始值渲染成文本。
 * 官方未标明语义，按范围推断 —— [0,1] 视作占比、[1,100] 视作百分数、更大视作绝对数。
 */
export function formatDistributionValue(percent: number): string {
  if (percent >= 0 && percent <= 1) return `${(percent * 100).toFixed(1)}%`
  if (percent > 1 && percent <= 100) return `${percent.toFixed(1)}%`
  return percent.toLocaleString("zh-CN")
}

/** 展示用：以本维度最大值归一化，得到条形宽度比例（0-1）。 */
export function toBarRatio(percent: number, items: FansDistributionItem[]): number {
  const max = Math.max(...items.map((x) => x.percent))
  if (!Number.isFinite(max) || max <= 0) return 0
  return Math.min(1, Math.max(0, percent / max))
}
