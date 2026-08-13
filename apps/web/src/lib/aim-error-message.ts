/**
 * 把生成/对话错误映射为对用户友好的文案，避免把英文/技术报错（fetch failed、
 * provider 5xx、JSON 解析、stack 片段等）原样泄漏给终端用户。
 *
 * 规则：本系统有意抛给用户的错误（输入校验、安全闸门、业务约束、已知 4xx）均为
 * 中文；因此"消息含中文 → 视作用户可读，原样透传；否则 → 回落 friendlyFallback"。
 * 完整原始错误由调用方 console.error + trace 记录，不在此吞掉。
 */
const CJK_PATTERN = /[\u4e00-\u9fff]/

export function mapAimErrorToUserMessage(error: unknown, friendlyFallback: string): string {
  const message = error instanceof Error ? error.message : ""
  if (message.includes("连续修正后仍未完成当前要求")) {
    return "这次结果经过两次自动修正仍未完成你的当前要求，未作为正式成稿交付。你的当前稿件已保留，可以直接重试或补充一个关键要求。"
  }
  return message && CJK_PATTERN.test(message) ? message : friendlyFallback
}
