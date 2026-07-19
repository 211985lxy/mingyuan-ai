import { describe, expect, it } from "vitest"
import {
  assertToolAuthorized,
  BUSINESS_LOOP_IDS,
  LOOP_OPERATING_MODES,
  LoopContractError,
  validateBusinessLoopSpec,
  type BusinessLoopSpec,
  type LoopContractErrorReason,
} from "@/lib/aim/loops/contracts"
import {
  assertLoopToolAuthorized,
  findRegisteredLoop,
  getRegisteredLoop,
  listRegisteredLoops,
  SALES_DIAGNOSIS_ALLOWED_TOOLS,
  SALES_DIAGNOSIS_STEPS,
  SALES_DIAGNOSIS_V1,
} from "@/lib/aim/loops/registry"

function cloneSpec(): BusinessLoopSpec {
  return {
    ...SALES_DIAGNOSIS_V1,
    goal: {
      deliverables: [...SALES_DIAGNOSIS_V1.goal.deliverables],
      doneWhen: [...SALES_DIAGNOSIS_V1.goal.doneWhen],
    },
    steps: SALES_DIAGNOSIS_V1.steps.map((step) => ({ ...step })),
    allowedTools: [...SALES_DIAGNOSIS_V1.allowedTools],
    stopPolicy: { ...SALES_DIAGNOSIS_V1.stopPolicy },
    supervisionPolicy: {
      ...SALES_DIAGNOSIS_V1.supervisionPolicy,
      budget: { ...SALES_DIAGNOSIS_V1.supervisionPolicy.budget },
    },
  }
}

function reasonOf(fn: () => unknown): LoopContractErrorReason {
  try {
    fn()
    throw new Error("预期抛出 LoopContractError")
  } catch (error) {
    if (error instanceof LoopContractError) return error.reason
    throw error
  }
}

describe("sales-diagnosis-v1 完整契约", () => {
  it("使用数字版本、销售诊断工作流和人工批准触发器", () => {
    const spec = getRegisteredLoop("sales-diagnosis-v1")
    expect(spec.version).toBe(1)
    expect(spec.workflow).toBe("销售诊断")
    expect(spec.trigger).toBe("manual_approved")
  })

  it("默认影子模式并锁定人工与 Token 预算", () => {
    const policy = SALES_DIAGNOSIS_V1.supervisionPolicy
    expect(policy).toEqual({
      defaultMode: "shadow",
      requireStartApproval: true,
      requireFinalReview: true,
      allowExternalSideEffects: false,
      budget: {
        maxRunsPerWorkItem: 1,
        maxEstimatedInputTokens: 20_000,
        maxOutputTokens: 3_000,
        maxProviderAttempts: 1,
        maxAutoRetries: 0,
      },
    })
  })

  it("第一步先做确定性输入检查", () => {
    expect(SALES_DIAGNOSIS_STEPS[0]).toEqual({
      id: "validate_input",
      name: "校验输入与执行许可",
      tool: "deterministic_preflight",
    })
  })

  it("每个步骤的工具都属于授权白名单", () => {
    const allowed = new Set<string>(SALES_DIAGNOSIS_ALLOWED_TOOLS)
    expect(SALES_DIAGNOSIS_STEPS.every((step) => allowed.has(step.tool))).toBe(true)
  })

  it("注册契约及嵌套策略不可被运行时篡改", () => {
    const spec = getRegisteredLoop("sales-diagnosis-v1")
    expect(Object.isFrozen(spec)).toBe(true)
    expect(Object.isFrozen(spec.allowedTools)).toBe(true)
    expect(Object.isFrozen(spec.steps)).toBe(true)
    expect(spec.steps.every(Object.isFrozen)).toBe(true)
    expect(Object.isFrozen(spec.supervisionPolicy)).toBe(true)
    expect(Object.isFrozen(spec.supervisionPolicy.budget)).toBe(true)

    expect(() => spec.allowedTools.push("send_customer_message")).toThrow(TypeError)
    expect(() => {
      spec.supervisionPolicy.allowExternalSideEffects = true
    }).toThrow(TypeError)
    expect(reasonOf(() => assertLoopToolAuthorized("sales-diagnosis-v1", "send_customer_message"))).toBe(
      "unauthorized_tool",
    )
  })

  it("声明目标、验证、记忆与人工停止策略", () => {
    expect(SALES_DIAGNOSIS_V1.goal.deliverables.length).toBeGreaterThan(0)
    expect(SALES_DIAGNOSIS_V1.goal.doneWhen.length).toBeGreaterThan(0)
    expect(SALES_DIAGNOSIS_V1.verificationPolicy).toBe("sales-diagnosis-evidence-v1")
    expect(SALES_DIAGNOSIS_V1.memoryPolicy).toBe("candidate_after_approval")
    expect(SALES_DIAGNOSIS_V1.stopPolicy.requireHumanReview).toBe(true)
  })
})

describe("注册表 fail-closed", () => {
  it("只注册销售诊断 v1", () => {
    expect(listRegisteredLoops().map((spec) => spec.id)).toEqual(["sales-diagnosis-v1"])
    expect(BUSINESS_LOOP_IDS).toContain("content-growth-v1")
  })

  it("已知但尚未注册的 Loop 返回 null", () => {
    expect(findRegisteredLoop("content-growth-v1")).toBeNull()
  })

  it("非法 Loop ID 不会被 find 静默吞掉", () => {
    expect(reasonOf(() => findRegisteredLoop("sales-diagnosis-v2"))).toBe("invalid_loop_id")
  })

  it("未授权工具被拒绝", () => {
    expect(() => assertLoopToolAuthorized("sales-diagnosis-v1", "aim_harness")).not.toThrow()
    expect(reasonOf(() => assertLoopToolAuthorized("sales-diagnosis-v1", "send_customer_message"))).toBe(
      "unauthorized_tool",
    )
  })
})

describe("完整契约校验", () => {
  it("合法契约通过", () => {
    expect(() => validateBusinessLoopSpec(cloneSpec())).not.toThrow()
  })

  it("四种监督模式均可显式声明，未知模式被拒绝", () => {
    for (const mode of LOOP_OPERATING_MODES) {
      const spec = cloneSpec()
      spec.supervisionPolicy.defaultMode = mode
      expect(() => validateBusinessLoopSpec(spec)).not.toThrow()
    }
    const bad = cloneSpec()
    bad.supervisionPolicy.defaultMode = "autonomous" as never
    expect(reasonOf(() => validateBusinessLoopSpec(bad))).toBe("invalid_contract")
  })

  it("版本必须与 Loop ID 一致", () => {
    const bad = cloneSpec()
    bad.version = 2
    expect(reasonOf(() => validateBusinessLoopSpec(bad))).toBe("invalid_version")
  })

  it("目标、触发器、验证策略与停止策略不可缺失", () => {
    const missingGoal = cloneSpec()
    missingGoal.goal.deliverables = []
    expect(reasonOf(() => validateBusinessLoopSpec(missingGoal))).toBe("invalid_contract")

    const badTrigger = cloneSpec()
    badTrigger.trigger = "cron" as never
    expect(reasonOf(() => validateBusinessLoopSpec(badTrigger))).toBe("invalid_contract")

    const missingVerification = cloneSpec()
    missingVerification.verificationPolicy = ""
    expect(reasonOf(() => validateBusinessLoopSpec(missingVerification))).toBe("invalid_contract")

    const badTimeout = cloneSpec()
    badTimeout.stopPolicy.executionTimeoutMs = 0
    expect(reasonOf(() => validateBusinessLoopSpec(badTimeout))).toBe("invalid_budget")
  })

  it("重复步骤、重复工具和未授权步骤工具分别被拒绝", () => {
    const duplicateStep = cloneSpec()
    duplicateStep.steps.push({ ...duplicateStep.steps[0] })
    expect(reasonOf(() => validateBusinessLoopSpec(duplicateStep))).toBe("duplicate_step")

    const duplicateTool = cloneSpec()
    duplicateTool.allowedTools.push(duplicateTool.allowedTools[0])
    expect(reasonOf(() => validateBusinessLoopSpec(duplicateTool))).toBe("duplicate_tool")

    const unauthorized = cloneSpec()
    unauthorized.steps[0].tool = "unknown_tool"
    expect(reasonOf(() => validateBusinessLoopSpec(unauthorized))).toBe("unauthorized_tool")

    const unknownStep = cloneSpec()
    unknownStep.steps[0].id = "unknown_step" as never
    expect(reasonOf(() => validateBusinessLoopSpec(unknownStep))).toBe("invalid_contract")
  })

  it("所有预算必须是受控整数", () => {
    const cases: Array<[keyof BusinessLoopSpec["supervisionPolicy"]["budget"], number]> = [
      ["maxRunsPerWorkItem", 0],
      ["maxEstimatedInputTokens", -1],
      ["maxOutputTokens", 1.5],
      ["maxProviderAttempts", 0],
      ["maxAutoRetries", -1],
    ]
    for (const [field, value] of cases) {
      const bad = cloneSpec()
      bad.supervisionPolicy.budget[field] = value
      expect(reasonOf(() => validateBusinessLoopSpec(bad)), field).toBe("invalid_budget")
    }
  })

  it("工具授权断言对未知工具 fail-closed", () => {
    expect(() => assertToolAuthorized(cloneSpec(), "aim_harness")).not.toThrow()
    expect(reasonOf(() => assertToolAuthorized(cloneSpec(), "delete_record"))).toBe("unauthorized_tool")
  })
})
