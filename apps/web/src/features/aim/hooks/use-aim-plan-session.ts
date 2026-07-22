"use client"

import { useState, useCallback, useRef } from "react"
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

  /** 向服务端请求下一批问题 */
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

  /** 启动计划会话 */
  const startPlan = useCallback(async (requirement: string, projectId: string) => {
    abortRef.current?.abort()
    const fresh = createEmptyPlanSession(requirement, projectId)
    setSession(fresh)
    savePlanDraft(fresh)
    await fetchQuestions(fresh)
  }, [fetchQuestions])

  /** 应用答案并推进到下一题或请求下一轮 */
  const applyAnswer = useCallback((answer: PlanAnswer) => {
    setSession((prev) => {
      if (!prev) return prev

      const answers = [...prev.answers, answer]
      // 将答案写入任务单
      const question = prev.questions.find((q) => q.id === answer.questionId)
      const taskSpec = { ...prev.taskSpec }
      if (question) {
        taskSpec[question.targetField] = answer.resolvedText
      }

      const nextIndex = prev.currentIndex + 1
      const hasMoreLocal = nextIndex < prev.questions.length

      const updated: CopyPlanSession = {
        ...prev,
        answers,
        taskSpec,
        currentIndex: nextIndex,
      }

      if (hasMoreLocal) {
        // 还有本地未展示的问题
        savePlanDraft(updated)
        return updated
      }

      // 本地问题已答完，判断是否需要下一轮
      const shouldFetchMore = prev.round < PLAN_MAX_ROUNDS && prev.questions.length < 5
      if (shouldFetchMore) {
        // 异步请求下一轮（不阻塞 UI）
        const nextRoundSession = { ...updated, round: prev.round + 1 }
        void fetchQuestions(nextRoundSession)
        return { ...updated, loading: true }
      }

      // 所有轮次完成，进入任务单审阅
      const reviewing: CopyPlanSession = { ...updated, status: "reviewing" }
      savePlanDraft(reviewing)
      return reviewing
    })
  }, [fetchQuestions])

  /** 回答当前问题（A/B/C 选择） */
  const answerOption = useCallback((questionId: string, key: "A" | "B" | "C") => {
    setSession((prev) => {
      if (!prev) return prev
      const question = prev.questions.find((q) => q.id === questionId)
      if (!question) return prev
      const option = question.options.find((o) => o.key === key)
      if (!option) return prev

      // 异步应用答案（避免在 setState 内调用另一个 setState）
      const answer: PlanAnswer = {
        questionId,
        selectedKey: key,
        resolvedText: option.text,
        source: "archive",
      }
      // 使用 queueMicrotask 避免 React 批处理问题
      queueMicrotask(() => applyAnswer(answer))
      return prev
    })
  }, [applyAnswer])

  /** 回答当前问题（D 自定义补充） */
  const answerCustom = useCallback((questionId: string, customText: string) => {
    const trimmed = customText.trim()
    if (!trimmed) return

    const answer: PlanAnswer = {
      questionId,
      selectedKey: "D",
      customText: trimmed,
      resolvedText: trimmed,
      source: "user_supplement",
    }
    applyAnswer(answer)
  }, [applyAnswer])

  /** 返回上一题重新选择 */
  const goBack = useCallback(() => {
    setSession((prev) => {
      if (!prev || prev.currentIndex <= 0) return prev
      const prevIndex = prev.currentIndex - 1
      const prevQuestion = prev.questions[prevIndex]
      if (!prevQuestion) return prev

      // 移除上一题的答案
      const answers = prev.answers.filter((a) => a.questionId !== prevQuestion.id)
      // 从任务单中移除对应字段
      const taskSpec = { ...prev.taskSpec }
      delete taskSpec[prevQuestion.targetField]

      const updated: CopyPlanSession = {
        ...prev,
        answers,
        taskSpec,
        currentIndex: prevIndex,
        status: "asking",
      }
      savePlanDraft(updated)
      return updated
    })
  }, [])

  /** 确认任务单并生成 */
  const confirmPlan = useCallback((): ConfirmedWorkflowBrief | null => {
    if (!session || session.status !== "reviewing") return null
    const brief = planTaskSpecToWorkflowBrief(session.taskSpec)
    setSession((prev) => prev ? { ...prev, status: "confirmed" } : prev)
    clearPlanDraft(session.projectId)
    return brief
  }, [session])

  /** 放弃计划 */
  const abandonPlan = useCallback(() => {
    abortRef.current?.abort()
    if (session) clearPlanDraft(session.projectId)
    setSession(null)
  }, [session])

  /** 重置（新任务） */
  const resetPlan = useCallback(() => {
    abortRef.current?.abort()
    if (session) clearPlanDraft(session.projectId)
    setSession(null)
  }, [session])

  /** 从 sessionStorage 恢复草稿（页面刷新后） */
  const restoreDraft = useCallback((projectId: string) => {
    if (!projectId) return
    setSession((prev) => {
      // 已有活跃会话时不覆盖
      if (prev) return prev
      const draft = loadPlanDraft(projectId)
      return draft
    })
  }, [])

  // 派生值
  const isPlanMode = session !== null && session.status !== "abandoned"
  const currentQuestion = session?.status === "asking" && !session.loading && session.currentIndex < session.questions.length
    ? session.questions[session.currentIndex]
    : null
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
    confirmPlan,
    abandonPlan,
    resetPlan,
    restoreDraft,
  }
}
