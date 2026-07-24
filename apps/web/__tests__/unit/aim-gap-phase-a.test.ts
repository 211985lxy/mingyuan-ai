import { describe, expect, it } from "vitest"

import {
  applyEvalModelSwapFilter,
  AIM_EVAL_MODEL_SWAP_ENV,
} from "@/lib/llm/agent-router"
import { classifyModelSwapBottleneck } from "@/lib/aim-harness/eval-model-swap"
import {
  BOUNDED_TOOL_LOOP_ALLOWLIST,
  DEFAULT_EXECUTION_MAX_STEPS,
  DEFAULT_EXECUTION_TIMEOUT_MS,
  isBoundedToolLoopAllowed,
  resolveExecutionMode,
  resolveExecutionPolicy,
} from "@/lib/aim-harness/execution-mode"
import { BOUND_TOOL_LOOP_TOOL_NAMES } from "@/lib/aim-harness/tool-loop-tools"
import { planAimRun } from "@/lib/aim-harness/planner"
import { buildEvalCandidateFromRunSummary } from "@/lib/aim-harness/eval-candidate-from-trace"
import { selectAimSkills, buildAimSkillBlock } from "@/lib/aim-harness/skill-loader"
import { assessInspirationPipelineReadiness } from "@/lib/inspiration-pipeline-readiness"
import { readLoopRuntimeConfig } from "@/lib/aim/loop-runtime-config"
import { getRegisteredLoop } from "@/lib/aim/loops/registry"
import { runBoundedToolLoop } from "@/lib/aim-harness/tool-loop"
import {
  compareAgainstBaseline,
  createTemplateBaseline,
} from "@/lib/aim-harness/content-baseline"

describe("executionPolicy (阶段 1)", () => {
  it("默认 single_shot 策略冻结", () => {
    const spec = planAimRun({
      entrypoint: "generate",
      agentId: "content_producer",
      rawInput: "写一条短视频脚本",
      targetFormats: ["video_script"],
    })
    expect(spec.executionMode).toBe("single_shot")
    expect(spec.executionPolicy.mode).toBe("single_shot")
    expect(spec.executionPolicy.allowedToolNames).toEqual([])
    expect(spec.executionPolicy.maxSteps).toBe(DEFAULT_EXECUTION_MAX_STEPS)
    expect(spec.executionPolicy.timeoutMs).toBe(DEFAULT_EXECUTION_TIMEOUT_MS)
    expect(spec.executionPolicy.maxAutoRetries).toBe(1)
  })

  it("白名单包含销售补证与选题核验路径", () => {
    expect(isBoundedToolLoopAllowed("business_diagnosis", "positioning_topic")).toBe(true)
    expect(isBoundedToolLoopAllowed("content_producer", "new_copy")).toBe(true)
    expect(BOUNDED_TOOL_LOOP_ALLOWLIST.length).toBeGreaterThan(0)
    expect(BOUND_TOOL_LOOP_TOOL_NAMES).toContain("read_aim_generation")
    expect(BOUND_TOOL_LOOP_TOOL_NAMES).toContain("read_work_item")
  })

  it("未授权路径拒绝 bounded_tool_loop", () => {
    expect(() =>
      resolveExecutionMode({
        requested: "bounded_tool_loop",
        agentId: "content_review",
        runtimeTask: "quality_review",
      }),
    ).toThrow(/未授权/)
  })

  it("授权路径可显式开启 bounded_tool_loop 并带工具白名单", () => {
    const policy = resolveExecutionPolicy({
      requested: "bounded_tool_loop",
      agentId: "business_diagnosis",
      runtimeTask: "positioning_topic",
    })
    expect(policy.mode).toBe("bounded_tool_loop")
    expect(policy.allowedToolNames).toEqual([...BOUND_TOOL_LOOP_TOOL_NAMES])
    expect(policy.maxSteps).toBe(6)
  })
  it("content-growth-v1 已注册且禁止外发", () => {
    const spec = getRegisteredLoop("content-growth-v1")
    expect(spec.trigger).toBe("inspiration_captured")
    expect(spec.supervisionPolicy.allowExternalSideEffects).toBe(false)
    expect(spec.allowedTools).not.toContain("send_customer_message")
  })
})

describe("bounded tool loop kernel", () => {
  it("finish 动作返回 notes", async () => {
    const result = await runBoundedToolLoop({
      agentId: "content_producer",
      runtimeTask: "new_copy",
      rawInput: "写脚本",
      userId: "u1",
      projectId: "p1",
      complete: async () =>
        JSON.stringify({ action: "finish", notes: "已有足够资料", reason: "ok" }),
    })
    expect(result.stopReason).toBe("completed")
    expect(result.notes).toContain("已有足够资料")
  })
})

describe("sales loop operating mode", () => {
  it("影子关闭且 supervised_auto → 正式自动", () => {
    const config = readLoopRuntimeConfig({
      AIM_BUSINESS_LOOPS_ENABLED: "true",
      AIM_LOOP_SHADOW_MODE: "false",
      AIM_LOOP_OPERATING_MODE: "supervised_auto",
      AIM_LOOP_PILOT_PROJECT_IDS: "proj_1",
    })
    expect(config.shadowMode).toBe(false)
    expect(config.operatingMode).toBe("supervised_auto")
  })
})

describe("skills + eval candidates + inspiration readiness", () => {
  it("按 agent 选择 Skill", () => {
    const skills = selectAimSkills({
      agentId: "deep_copywriter",
      runtimeTask: "new_copy",
    })
    expect(skills.some((skill) => skill.id === "ip-copywriting")).toBe(true)
    expect(buildAimSkillBlock([{ id: "x", title: "T", content: "body" }])).toContain("【Skill:T】")
  })

  it("质量失败时生成 eval 候选", () => {
    const draft = buildEvalCandidateFromRunSummary({
      agentId: "content_producer",
      rawInput: "写一条",
      qualityStatus: "fail",
      runId: "run_1",
    })
    expect(draft?.status).toBe("candidate")
    expect(draft?.suggestedFixtureId).toMatch(/^cand_/)
  })

  it("inspiration 影子就绪可检测", () => {
    const result = assessInspirationPipelineReadiness({
      INSPIRATION_PIPELINE_ENABLED: "true",
      INSPIRATION_PIPELINE_SHADOW_MODE: "true",
      BACKGROUND_TASKS_ENABLED: "true",
      CRON_SECRET: "secret",
      FEISHU_TOPIC_PIPELINE_ENABLED: "true",
    })
    expect(result.ok).toBe(true)
    expect(result.level).toBe("shadow")
  })
})

describe("model-swap helpers (WP-A2)", () => {
  it("classify：Δ 小 → harness_bound", () => {
    expect(
      classifyModelSwapBottleneck({
        strongMean: 78,
        weakMean: 76,
        strongContract: 1,
        weakContract: 1,
      }),
    ).toBe("harness_bound")
  })

  it("classify：Δ 大 → model_bound", () => {
    expect(
      classifyModelSwapBottleneck({
        strongMean: 88,
        weakMean: 70,
        strongContract: 1,
        weakContract: 1,
      }),
    ).toBe("model_bound")
  })

  it("applyEvalModelSwapFilter：strong 仅 advanced", () => {
    const routes = [
      { name: "a", capability: "advanced" as const },
      { name: "b", capability: "standard" as const },
      { name: "c", capability: "basic" as const },
    ]
    process.env[AIM_EVAL_MODEL_SWAP_ENV] = "strong"
    try {
      expect(applyEvalModelSwapFilter(routes).map((route) => route.name)).toEqual(["a"])
    } finally {
      delete process.env[AIM_EVAL_MODEL_SWAP_ENV]
    }
  })
})

describe("content baseline compare", () => {
  it("下降超过 5pp 失败", () => {
    const baseline = createTemplateBaseline()
    baseline.metrics.acceptanceRate = 0.9
    baseline.metrics.evidenceCompletenessRate = 0.85
    baseline.metrics.severeFabricationRate = 0
    const candidate = createTemplateBaseline()
    candidate.metrics.acceptanceRate = 0.8
    candidate.metrics.evidenceCompletenessRate = 0.85
    candidate.metrics.severeFabricationRate = 0
    const gate = compareAgainstBaseline(baseline, candidate)
    expect(gate.ok).toBe(false)
    expect(gate.reasons.some((reason) => reason.includes("acceptanceRate"))).toBe(true)
  })
})
