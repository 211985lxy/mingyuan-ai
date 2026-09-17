/**
 * 三比例分派：产物名 ↔ 画幅比例。
 *
 * 单独成文件的原因：`hypit.ts` 已经逼近项目的 400 行模块上限，而这部分是**纯函数**
 * （不碰网络、不读环境），搬出来既减重也让规则本身可被单测直接命中。
 */

/** 交付比例。与 `CreateVideoTaskInput["aspectRatio"]` 同域，但 `1:1` 目前只有 Hypit 支持。 */
export type HypitAspectRatio = "9:16" | "16:9" | "1:1"

/** 一次渲染交付的一个产物（三比例即三条）。 */
export type HypitDeliverable = {
  /** 渲染服务里的逻辑产物名，如 `final-916.video`。 */
  outputName: string
  /** 转存到 OSS 后可分发的 URL。 */
  url: string
  mediaType: string
  /** 从产物名推断；推断不出来为 `null`（此时由调用方按产物顺序决定用途）。 */
  aspectRatio: HypitAspectRatio | null
}

/**
 * 产物名 → 比例的约定标记，**顺序即优先级**：关键词先判，数字写法兜底。
 *
 * 模板侧必须按这些写法命名（见 `services/hypit-renderer/docs/TEMPLATE-CONTRACT.md`）。
 */
const RATIO_MARKERS: ReadonlyArray<{ ratio: HypitAspectRatio; pattern: RegExp }> = [
  { ratio: "9:16", pattern: /(?:^|[^0-9a-z])(vertical|portrait)(?:[^0-9a-z]|$)/i },
  { ratio: "16:9", pattern: /(?:^|[^0-9a-z])(horizontal|landscape|wide)(?:[^0-9a-z]|$)/i },
  { ratio: "1:1", pattern: /(?:^|[^0-9a-z])(square)(?:[^0-9a-z]|$)/i },
  // 数字写法：916 / 9x16 / 9-16 / 9_16（两侧必须是非数字，避免 1916、9160 误命中）
  { ratio: "9:16", pattern: /(?:^|[^0-9])9[-_x:]?16(?:[^0-9]|$)/ },
  { ratio: "16:9", pattern: /(?:^|[^0-9])16[-_x:]?9(?:[^0-9]|$)/ },
  { ratio: "1:1", pattern: /(?:^|[^0-9])1[-_x:]?1(?:[^0-9]|$)/ },
]

/**
 * 从产物名推断比例。
 *
 * 为什么靠命名：`hypit inspect` 是 CLI 输出的透传，产物清单里没有宽高字段，
 * 服务端无法可靠地告诉你哪条是竖版。所以三比例模板必须按约定命名
 * （`final-916` / `final-169` / `final-11`），这里据此分派。
 * 认不出来返回 `null` —— 调用方按产物顺序兜底，不猜。
 */
export function inferHypitAspectRatio(outputName: string): HypitAspectRatio | null {
  const name = outputName.toLowerCase()
  for (const marker of RATIO_MARKERS) {
    if (marker.pattern.test(name)) return marker.ratio
  }
  return null
}

/** 首选比例排第一，其余保持渲染顺序不变（稳定排序，重试结果一致）。 */
export function sortDeliverables(
  deliverables: HypitDeliverable[],
  preferred?: HypitAspectRatio,
): HypitDeliverable[] {
  if (!preferred) return deliverables
  const preferredIndex = deliverables.findIndex((item) => item.aspectRatio === preferred)
  if (preferredIndex <= 0) return deliverables
  const reordered = [...deliverables]
  const [head] = reordered.splice(preferredIndex, 1)
  return [head, ...reordered]
}
