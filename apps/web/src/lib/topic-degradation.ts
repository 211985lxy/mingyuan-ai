/** 选题生成失败后的模板卡：model 以 ":fallback" 结尾。 */
export const DEGRADED_TOPIC_SELECT_MESSAGE = "请重新生成后再选用"

export function isDegradedTopicModel(model: unknown): boolean {
  return typeof model === "string" && model.endsWith(":fallback")
}
