/**
 * 内容包完成后的工作流推进建议（不跳过人工审核闸门）。
 * draft → pending_review 合法；不自动进入 ready_to_publish / published。
 */

import { getContentPackageFromTaskSpec } from "@/lib/content-package-spec"
import {
  canTransitionWorkflowStatus,
  normalizeAimWorkflowStatus,
  type AimWorkflowStatus,
} from "@/lib/aim/workflow-status"
import type { TaskSpec } from "@/lib/task-spec"

export interface PackageWorkflowAdvanceSuggestion {
  shouldAdvance: boolean
  from: AimWorkflowStatus
  to: "pending_review"
  reason: string
}

/**
 * @description 内容包请求格式全部完成且无失败时，建议推进到待审核
 */
export function suggestWorkflowAfterContentPackageComplete(input: {
  taskSpec?: TaskSpec | null
  currentStatus?: string | null
}): PackageWorkflowAdvanceSuggestion | null {
  const pkg = getContentPackageFromTaskSpec(input.taskSpec)
  if (!pkg) return null
  if (pkg.requestedFormats.length < 2) return null
  if (pkg.failedFormats.length > 0) return null
  const completed = new Set(pkg.completedFormats)
  const allDone = pkg.requestedFormats.every((format) => completed.has(format))
  if (!allDone) return null

  const from = normalizeAimWorkflowStatus(input.currentStatus)
  if (from === "pending_review" || from === "ready_to_publish" || from === "published" || from === "archived") {
    return null
  }
  if (!canTransitionWorkflowStatus(from, "pending_review")) return null
  return {
    shouldAdvance: true,
    from,
    to: "pending_review",
    reason: "内容包格式已齐，自动进入待审核（发布前仍需人工确认）",
  }
}
