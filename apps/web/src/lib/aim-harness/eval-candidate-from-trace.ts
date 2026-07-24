/**
 * 失败/优质轨迹 → Eval 候选草稿（缺口升级 D1）。
 * 只生成候选对象，绝不自动写入正式 fixtures。
 */

export interface TraceEvalCandidateDraft {
  status: "candidate"
  suggestedFixtureId: string
  agent: string
  scenario: string
  rawInputPreview: string
  reason: string
  fabricatedSuspected: boolean
  qualityStatus?: string
  sourceRunId?: string
  createdAt: string
}

/**
 * @description 从运行摘要构造 eval 候选（需人工批准后才能入库）
 */
export function buildEvalCandidateFromRunSummary(input: {
  agentId: string
  rawInput: string
  runId?: string
  qualityStatus?: string
  fabricatedSuspected?: boolean
  errorMessage?: string
  scenarioHint?: string
}): TraceEvalCandidateDraft | null {
  const shouldCapture =
    input.fabricatedSuspected === true ||
    input.qualityStatus === "fail" ||
    Boolean(input.errorMessage?.trim())
  if (!shouldCapture) return null

  const slug = input.agentId.replace(/[^a-z0-9_]/gi, "_").toLowerCase()
  const stamp = Date.now().toString(36)
  return {
    status: "candidate",
    suggestedFixtureId: `cand_${slug}_${stamp}`,
    agent: input.agentId,
    scenario: input.scenarioHint ?? "prompt_quality",
    rawInputPreview: input.rawInput.slice(0, 500),
    reason:
      input.errorMessage?.trim() ||
      (input.fabricatedSuspected ? "suspected_fabricated_fact" : `quality_${input.qualityStatus}`),
    fabricatedSuspected: input.fabricatedSuspected === true,
    qualityStatus: input.qualityStatus,
    sourceRunId: input.runId,
    createdAt: new Date().toISOString(),
  }
}
