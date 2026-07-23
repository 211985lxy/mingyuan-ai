"use client"

import { useState, useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { requestAimPlan } from "@/lib/api/aim"
import {
  createEmptyPlanSession,
  PLAN_MAX_ROUNDS,
  PLAN_MAX_TOTAL_QUESTIONS,
  type CopyPlanSession,
  type PlanAnswer,
  type PlanQuestion,
  type PlanQuestionDimension,
  type PlanResponse,
  type PlanTaskSpec,
  type PlanTaskSpecField,
} from "@/lib/aim/plan-types"
import type { ConfirmedWorkflowBrief } from "@/lib/aim-workflow"

/** 计划会话 sessionStorage key 前缀 */
const PLAN_STORAGE_PREFIX = "aim_plan_session_"

function storageKey(projectId: string): string {
  return `${PLAN_STORAGE_PREFIX}${projectId}`
}

/** 保存计划草稿到 sessionStorage */
function savePlanDraft(session: CopyPlanSession): void {
  if (typeof window === "undefined") return
  try {
    sessionStorage.setItem(storageKey(session.projectId), JSON.stringify(session))
  } catch { /* quota exceeded — ignore */ }
}

/** 清除计划草稿 */
export function clearPlanDraft(projectId: string): void {
  if (typeof window === "undefined" || !projectId) return
  try {
    sessionStorage.removeItem(storageKey(projectId))
  } catch { /* ignore */ }
}

/** 将 PlanTaskSpec 转换为 ConfirmedWorkflowBrief（供生成链路使用） */
export function planTaskSpecToWorkflowBrief(taskSpec: Partial<PlanTaskSpec>): ConfirmedWorkflowBrief {
  return {
    goal: taskSpec.contentGoal,
    targetCustomer: taskSpec.targetCustomer,
    realProblem: taskSpec.realProblem,
    coreMessage: taskSpec.coreMessage,
    platform: taskSpec.platform,
    useScenario: taskSpec.useScenario,
    outputFormat: taskSpec.outputFormat,
    style: taskSpec.style,
    lengthRule: taskSpec.lengthRule,
    ctaText: taskSpec.ctaText,
    desiredAction: taskSpec.desiredAction as ConfirmedWorkflowBrief["desiredAction"],
    mustKeep: taskSpec.mustKeep,
    avoid: taskSpec.avoid,
  }
}

export interface UseAimPlanSessionReturn {
  session: CopyPlanSession | null
  /** 当前应展示的问题（一次一题） */
  currentQuestion: PlanQuestion | null
  /** 当前题号（1-based，用于进度展示） */
  questionNumber: number
  /** 总问题数 */
  totalQuestions: number
  /** 是否处于计划模式 */
  isPlanMode: boolean
  /** 启动计划会话 */
  startPlan: (requirement: string, projectId: string) => Promise<void>
  /** 回答当前问题（A/B/C 选择） */
  answerOption: (questionId: string, key: "A" | "B" | "C") => void
  /** 回答当前问题（D 自定义补充） */
  answerCustom: (questionId: string, customText: string) => void
  /** 返回上一题重新选择 */
  goBack: () => void
  /** 从任务单指定字段返回对应问题重新选择 */
  reselectField: (field: string) => void
  /** 确认任务单并生成 */
  confirmPlan: () => ConfirmedWorkflowBrief | null
  /** 放弃计划 */
  abandonPlan: () => void
  /** 重置（新任务） */
  resetPlan: () => void
  /** 失败后重试当前一轮 */
  retryPlan: () => Promise<void>
}

/**
 * 计划模式会话管理 Hook
 *
 * 管理"一句话需求 → 逐题追问 → 任务单确认 → 生成"的完整生命周期。
 * 问题在对话区一次展示一题，单选；选择 D 后展开输入框。
 */
export function useAimPlanSession(): UseAimPlanSessionReturn {
  const [session, setSession] = useState<CopyPlanSession | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const fetchQuestions = usePlanQuestionFetcher(setSession, abortRef)

  const startPlan = useCallback(async (requirement: string, projectId: string) => {
    abortRef.current?.abort()
    const fresh = createEmptyPlanSession(requirement, projectId)
    setSession(fresh)
    savePlanDraft(fresh)
    await fetchQuestions(fresh)
  }, [fetchQuestions])

  const { answerOption, answerCustom } = usePlanSessionAnswers(session, setSession, fetchQuestions)
  const { goBack, reselectField } = usePlanSessionNavigation(session, setSession)
  const { confirmPlan, abandonPlan, resetPlan } = usePlanSessionLifecycle(session, setSession, abortRef)
  const retryPlan = useCallback(async () => {
    if (!session || session.loading) return
    await fetchQuestions({ ...session, error: undefined })
  }, [fetchQuestions, session])

  const isPlanMode = session !== null && session.status !== "abandoned"
  const currentQuestion = session?.status === "asking" && !session.loading && session.currentIndex < session.questions.length ? session.questions[session.currentIndex] : null
  const questionNumber = session ? session.currentIndex + 1 : 0
  const totalQuestions = session?.questions.length ?? 0

  return {
    session,
    currentQuestion,
    questionNumber,
    totalQuestions,
    isPlanMode,
    startPlan,
    answerOption,
    answerCustom,
    goBack,
    reselectField,
    confirmPlan,
    abandonPlan,
    resetPlan,
    retryPlan,
  }
}

function usePlanQuestionFetcher(
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
  abortRef: MutableRefObject<AbortController | null>,
) {
  return useCallback(async (current: CopyPlanSession): Promise<CopyPlanSession> => {
    const controller = new AbortController()
    abortRef.current = controller
    const loadingSession = { ...current, loading: true, error: undefined }
    setSession(loadingSession)
    savePlanDraft(loadingSession)
    try {
      const response: PlanResponse = await requestAimPlan({
        projectId: current.projectId,
        requirement: current.requirement,
        confirmedFields: current.taskSpec,
        answeredQuestionIds: current.answers.map((answer) => answer.questionId),
        round: current.round,
      }, controller.signal)
      const updated: CopyPlanSession = {
        ...current,
        loading: false,
        questions: [...current.questions, ...response.questions],
        assumptions: response.assumptions,
        taskSpec: response.taskSpec,
        round: response.round,
        status: response.ready && response.questions.length === 0 ? "reviewing" : "asking",
      }
      setSession(updated)
      savePlanDraft(updated)
      return updated
    } catch (error) {
      if (controller.signal.aborted) return current
      const failed = { ...current, loading: false, error: error instanceof Error ? error.message : "计划生成失败" }
      setSession(failed)
      savePlanDraft(failed)
      return failed
    }
  }, [abortRef, setSession])
}

function usePlanSessionAnswers(
  session: CopyPlanSession | null,
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
  fetchQuestions: (session: CopyPlanSession) => Promise<CopyPlanSession>,
) {
  const applyAnswer = usePlanAnswerApplier(session, setSession, fetchQuestions)
  const answerOption = useCallback((questionId: string, key: "A" | "B" | "C") => {
    const question = session?.questions.find((item) => item.id === questionId)
    const option = question?.options.find((item) => item.key === key)
    if (!question || !option) return
    applyAnswer({ questionId, selectedKey: key, resolvedText: option.text, source: "archive" })
  }, [applyAnswer, session])
  const answerCustom = useCallback((questionId: string, customText: string) => {
    const trimmed = customText.trim().slice(0, 1000)
    if (trimmed) applyAnswer({ questionId, selectedKey: "D", customText: trimmed, resolvedText: trimmed, source: "user_supplement" })
  }, [applyAnswer])
  return { answerOption, answerCustom }
}

function usePlanAnswerApplier(
  session: CopyPlanSession | null,
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
  fetchQuestions: (session: CopyPlanSession) => Promise<CopyPlanSession>,
) {
  return useCallback((answer: PlanAnswer) => {
    if (!session || session.loading) return
    const question = session.questions.find((item) => item.id === answer.questionId)
    if (!question || session.answers.some((item) => item.questionId === answer.questionId)) return
    const taskSpec = { ...session.taskSpec, [question.targetField]: answer.resolvedText }
    const updated = {
      ...session,
      answers: [...session.answers, answer],
      taskSpec,
      currentIndex: session.currentIndex + 1,
    }
    if (updated.currentIndex < session.questions.length) {
      setSession(updated)
      savePlanDraft(updated)
      return
    }
    if (session.round < PLAN_MAX_ROUNDS && session.questions.length < PLAN_MAX_TOTAL_QUESTIONS) {
      void fetchQuestions({ ...updated, round: session.round + 1 })
      return
    }
    const reviewing = { ...updated, status: "reviewing" as const }
    setSession(reviewing)
    savePlanDraft(reviewing)
  }, [fetchQuestions, session, setSession])
}

function usePlanSessionNavigation(
  session: CopyPlanSession | null,
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
) {
  const goBack = useCallback(() => {
    if (!session || session.currentIndex <= 0) return
    const question = session.questions[session.currentIndex - 1]
    if (!question) return
    const taskSpec = { ...session.taskSpec }
    delete taskSpec[question.targetField]
    const updated = {
      ...session,
      answers: session.answers.filter((answer) => answer.questionId !== question.id),
      taskSpec,
      currentIndex: session.currentIndex - 1,
      status: "asking" as const,
    }
    setSession(updated)
    savePlanDraft(updated)
  }, [session, setSession])

  const reselectField = useCallback((field: string) => {
    if (!session) return
    const match = [...session.questions].map((question, index) => ({ question, index })).reverse().find(({ question }) => question.targetField === field)
    if (!match) {
      const overrideQuestion = buildOverrideQuestion(field)
      if (!overrideQuestion) return
      const taskSpec = { ...session.taskSpec }
      delete taskSpec[overrideQuestion.targetField]
      const updated = {
        ...session,
        questions: [...session.questions, overrideQuestion],
        assumptions: session.assumptions.filter((assumption) => assumption.field !== field),
        taskSpec,
        currentIndex: session.questions.length,
        status: "asking" as const,
      }
      setSession(updated)
      savePlanDraft(updated)
      return
    }
    const replayQuestions = session.questions.slice(match.index)
    const replayQuestionIds = new Set(replayQuestions.map((question) => question.id))
    const replayFields = new Set(replayQuestions.map((question) => question.targetField))
    const updated = {
      ...session,
      answers: session.answers.filter((answer) => !replayQuestionIds.has(answer.questionId)),
      taskSpec: Object.fromEntries(Object.entries(session.taskSpec).filter(([key]) => !replayFields.has(key as PlanTaskSpecField))),
      currentIndex: match.index,
      status: "asking" as const,
    }
    setSession(updated)
    savePlanDraft(updated)
  }, [session, setSession])

  return { goBack, reselectField }
}

const FIELD_OVERRIDE_QUESTIONS: Partial<Record<PlanTaskSpecField, {
  dimension: PlanQuestionDimension
  prompt: string
}>> = {
  contentGoal: { dimension: "core_message", prompt: "请补充本次内容真正要达成的目标。" },
  coreMessage: { dimension: "core_message", prompt: "请补充这条内容最核心要传达的信息。" },
  targetCustomer: { dimension: "audience", prompt: "请补充这条内容真正要说给哪类人听。" },
  realProblem: { dimension: "pain", prompt: "请补充这次最值得击中的真实痛点。" },
  platform: { dimension: "platform", prompt: "请补充这条内容准备发布的平台。" },
  useScenario: { dimension: "scenario", prompt: "请补充这条内容的具体使用场景。" },
  outputFormat: { dimension: "format", prompt: "请补充这次需要的内容形式。" },
  style: { dimension: "style", prompt: "请补充希望采用的表达风格。" },
  lengthRule: { dimension: "length", prompt: "请补充希望控制的内容长度。" },
  ctaText: { dimension: "cta", prompt: "请补充内容结尾的行动号召。" },
  mustKeep: { dimension: "style", prompt: "请补充成稿中必须保留的信息。" },
  avoid: { dimension: "style", prompt: "请补充这次表达必须避开的内容。" },
}

function buildOverrideQuestion(field: string): PlanQuestion | null {
  const targetField = field as PlanTaskSpecField
  const config = FIELD_OVERRIDE_QUESTIONS[targetField]
  if (!config) return null
  return {
    id: `q_override_${targetField}_${Date.now().toString(36)}`,
    dimension: config.dimension,
    prompt: config.prompt,
    options: [],
    hasCustomOption: true,
    targetField,
  }
}

function usePlanSessionLifecycle(session: CopyPlanSession | null, setSession: Dispatch<SetStateAction<CopyPlanSession | null>>, abortRef: MutableRefObject<AbortController | null>) {
  const confirmPlan = useCallback((): ConfirmedWorkflowBrief | null => {
    if (!session || session.status !== "reviewing") return null
    const brief = planTaskSpecToWorkflowBrief(session.taskSpec)
    setSession(null)
    clearPlanDraft(session.projectId)
    return brief
  }, [session, setSession])
  const abandonPlan = useCallback(() => { abortRef.current?.abort(); if (session) clearPlanDraft(session.projectId); setSession(null) }, [abortRef, session, setSession])
  const resetPlan = useCallback(() => { abortRef.current?.abort(); if (session) clearPlanDraft(session.projectId); setSession(null) }, [abortRef, session, setSession])
  return { confirmPlan, abandonPlan, resetPlan }
}
