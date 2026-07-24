/**
 * AIM 运行错误 / 停止原因分类（14 周正本阶段 5）。
 */

export type AimRunErrorKind =
  | "tool_unauthorized"
  | "tool_timeout"
  | "tool_failed"
  | "budget_exhausted"
  | "insufficient_evidence"
  | "validation_failed"
  | "model_degraded"
  | "human_required"
  | "parse_error"
  | "unknown"

export type AimStopReason =
  | "completed"
  | "max_steps"
  | "timeout"
  | "token_budget_exceeded"
  | "tool_unauthorized"
  | "tool_failed"
  | "insufficient_evidence"
  | "human_required"
  | "validation_failed"
  | "model_degraded"
  | "parse_error"
  | "single_shot"

export function mapToolLoopStopToErrorKind(
  stopReason: string,
): AimRunErrorKind {
  switch (stopReason) {
    case "timeout":
      return "tool_timeout"
    case "max_steps":
      return "budget_exhausted"
    case "human_required":
      return "human_required"
    case "parse_error":
      return "parse_error"
    case "completed":
      return "unknown"
    default:
      return "unknown"
  }
}

export function classifyAimRunError(error: unknown): AimRunErrorKind {
  const message = error instanceof Error ? error.message : String(error)
  if (/未授权|未注册|禁止进入 Tool Loop|未被当前 RunSpec/.test(message)) {
    return "tool_unauthorized"
  }
  if (/timeout|超时/i.test(message)) return "tool_timeout"
  if (/信息不足|证据不足|insufficient/i.test(message)) return "insufficient_evidence"
  if (/validation|验证失败/i.test(message)) return "validation_failed"
  if (/human|人工/i.test(message)) return "human_required"
  return "unknown"
}
