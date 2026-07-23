"use client"

import { useState, useCallback, useRef, type Dispatch, type MutableRefObject, type SetStateAction } from "react"
import { requestAimPlan } from "@/lib/api/aim"
import {
  createEmptyPlanSession,
  PLAN_MAX_ROUNDS,
  type CopyPlanSession,
  type PlanAnswer,
  type PlanQuestion,
  type PlanResponse,
  type PlanTaskSpec,
} from "@/lib/aim/plan-types"
import type { ConfirmedWorkflowBrief } from "@/lib/aim-workflow"

/** 计划会话 sessionStorage key 前缀 */
const PLAN_STORAGE_PREFIX = "aim_plan_session_"

function storageKey(projectId: string): string {
  return `${PLAN_STORAGE_PREFIX}${projectId}`
}

/** 从 sessionStorage 恢复计划草稿 */
export function loadPlanDraft(projectId: string): CopyPlanSession | null {
  if (typeof window === "undefined" || !projectId) return null
  try {
    const raw = sessionStorage.getItem(storageKey(projectId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CopyPlanSession
    if (parsed.status === "confirmed" || parsed.status === "abandoned") return null
    return parsed
  } catch {
    return null
  }
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
  /** 从 sessionStorage 恢复草稿（页面刷新后） */
  restoreDraft: (projectId: string) => void
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

  const fetchQuestions = useCallback(async (
    current: CopyPlanSession,
  ): Promise<CopyPlanSession> => {
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
        answeredQuestionIds: current.answers.map((a) => a.questionId),
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
      const failed: CopyPlanSession = {
        ...current,
        loading: false,
        error: error instanceof Error ? error.message : "计划生成失败",
      }
      setSession(failed)
      return failed
    }
  }, [])

  const startPlan = useCallback(async (requirement: string, projectId: string) => {
    abortRef.current?.abort()
    const fresh = createEmptyPlanSession(requirement, projectId)
    setSession(fresh)
    savePlanDraft(fresh)
    await fetchQuestions(fresh)
  }, [fetchQuestions])

  const { answerOption, answerCustom } = usePlanSessionAnswers(setSession, fetchQuestions)
  const { goBack, reselectField } = usePlanSessionNavigation(setSession)
  const { confirmPlan, abandonPlan, resetPlan, restoreDraft } = usePlanSessionLifecycle(session, setSession, abortRef)

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
    restoreDraft,
  }
}

function usePlanSessionAnswers(
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
  fetchQuestions: (session: CopyPlanSession) => Promise<CopyPlanSession>,
) {
  const applyAnswer = usePlanAnswerApplier(setSession, fetchQuestions)
  const answerOption = useCallback((questionId: string, key: "A" | "B" | "C") => {
    setSession((prev) => {
      const question = prev?.questions.find((item) => item.id === questionId)
      const option = question?.options.find((item) => item.key === key)
      if (!question || !option) return prev
      queueMicrotask(() => applyAnswer({ questionId, selectedKey: key, resolvedText: option.text, source: "archive" }))
      return prev
    })
  }, [applyAnswer, setSession])
  const answerCustom = useCallback((questionId: string, customText: string) => {
    const trimmed = customText.trim()
    if (trimmed) applyAnswer({ questionId, selectedKey: "D", customText: trimmed, resolvedText: trimmed, source: "user_supplement" })
  }, [applyAnswer])
  return { answerOption, answerCustom }
}

function usePlanAnswerApplier(
  setSession: Dispatch<SetStateAction<CopyPlanSession | null>>,
  fetchQuestions: (session: CopyPlanSession) => Promise<CopyPlanSession>,
) {
  return useCallback((answer: PlanAnswer) => {
    setSession((prev) => {
      if (!prev) return prev
      const question = prev.questions.find((item) => item.id === answer.questionId)
      const taskSpec = { ...prev.taskSpec }
      if (question) taskSpec[question.targetField] = answer.resolvedText
      const updated = { ...prev, answers: [...prev.answers, answer], taskSpec, currentIndex: prev.currentIndex + 1 }
      if (updated.currentIndex < prev.questions.length) { savePlanDraft(updated); return updated }
      if (prev.round < PLAN_MAX_ROUNDS && prev.questions.length < 5) {
        const nextRoundSession = { ...updated, round: prev.round + 1 }
        queueMicrotask(() => { void fetchQuestions(nextRoundSession) })
        return { ...updated, loading: true }
      }
      const reviewing = { ...updated, status: "reviewing" as const }
      savePlanDraft(reviewing)
      return reviewing
    })
  }, [fetchQuestions, setSession])
}

function usePlanSessionNavigation(setSession: Dispatch<SetStateAction<CopyPlanSession | null>>) {
  const goBack = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.currentIndex <= 0) return prev
      const question = prev.questions[prev.currentIndex - 1]
      if (!question) return prev
      const taskSpec = { ...prev.taskSpec }
      delete taskSpec[question.targetField]
      const updated = { ...prev, answers: prev.answers.filter((a) => a.questionId !== question.id), taskSpec, currentIndex: prev.currentIndex - 1, status: "asking" as const }
      savePlanDraft(updated)
      return updated
    })
  }, [setSession])

  const reselectField = useCallback((field: string) => {
    setSession((prev) => {
      if (!prev) return prev
      const match = [...prev.questions].map((question, index) => ({ question, index })).reverse().find(({ question }) => question.targetField === field)
      if (!match) return prev
      const updated = { ...prev, answers: prev.answers.filter((answer) => answer.questionId !== match.question.id), taskSpec: Object.fromEntries(Object.entries(prev.taskSpec).filter(([key]) => key !== field)), currentIndex: match.index, status: "asking" as const }
      savePlanDraft(updated)
      return updated
    })
  }, [setSession])

  return { goBack, reselectField }
}

function usePlanSessionLifecycle(session: CopyPlanSession | null, setSession: Dispatch<SetStateAction<CopyPlanSession | null>>, abortRef: MutableRefObject<AbortController | null>) {
  const confirmPlan = useCallback((): ConfirmedWorkflowBrief | null => {
    if (!session || session.status !== "reviewing") return null
    const brief = planTaskSpecToWorkflowBrief(session.taskSpec)
    setSession((prev) => prev ? { ...prev, status: "confirmed" } : prev)
    clearPlanDraft(session.projectId)
    return brief
  }, [session, setSession])
  const abandonPlan = useCallback(() => { abortRef.current?.abort(); if (session) clearPlanDraft(session.projectId); setSession(null) }, [abortRef, session, setSession])
  const resetPlan = useCallback(() => { abortRef.current?.abort(); if (session) clearPlanDraft(session.projectId); setSession(null) }, [abortRef, session, setSession])
  const restoreDraft = useCallback((projectId: string) => {
    if (!projectId) return
    setSession((prev) => prev || loadPlanDraft(projectId))
  }, [setSession])
  return { confirmPlan, abandonPlan, resetPlan, restoreDraft }
}
