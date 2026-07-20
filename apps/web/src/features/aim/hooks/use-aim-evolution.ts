"use client"

import { useCallback, useState } from "react"
import { toast } from "sonner"
import {
  createKnowledge,
  evolveAimConversation,
  evolveStyleConversation,
  type AimEvolutionSuggestion,
} from "@/lib/api/client"
import type { ChatMessage } from "@/features/aim/aim-workbench-types"

interface UseAimEvolutionParams {
  messages: ChatMessage[]
  projectEnabled: boolean
  selectedProjectId: string
}

/**
 * @description React Hook：aimevolution
 * @param options - 配置选项
 * @returns 无返回值
 */
export function useAimEvolution({
  messages,
  projectEnabled,
  selectedProjectId,
}: UseAimEvolutionParams) {
  const [isEvolving, setIsEvolving] = useState(false)
  const [evolutionSuggestions, setEvolutionSuggestions] = useState<AimEvolutionSuggestion[]>([])

  function rememberWorkbenchPreference(input: string) {
    const contextMessages = [
      ...messages.map((message) => ({ role: message.role, content: message.content })),
      { role: "user" as const, content: input },
    ].filter((message) => message.content.trim()).slice(-8)

    if (contextMessages.length === 0) {
      toast.error("没有可沉淀的偏好内容")
      return
    }

    setIsEvolving(true)
    void evolveStyleConversation({
      messages: contextMessages,
      projectId: projectEnabled ? selectedProjectId || undefined : undefined,
    })
      .then((result) => {
        if (result.profile) {
          toast.success(result.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
        } else if (result.reason === "no_style") {
          toast.info("这句话还没有形成稳定偏好")
        } else {
          toast.info(result.reason || "这句话没有形成稳定偏好")
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : "偏好沉淀失败")
      })
      .finally(() => setIsEvolving(false))
  }

  const handleEvolveConversation = useCallback(async () => {
    const sourceMessages = messages
      .filter((message) => message.role === "user" || message.role === "assistant")
      .map((message) => ({ role: message.role, content: message.content }))

    if (sourceMessages.length < 2) {
      toast.error("对话太少，还没有可沉淀的偏好")
      return
    }

    const canEvolveProject = projectEnabled && !!selectedProjectId
    setIsEvolving(true)
    try {
      const results = await Promise.allSettled([
        evolveStyleConversation({
          messages: sourceMessages,
          projectId: canEvolveProject ? selectedProjectId : undefined,
        }),
        canEvolveProject
          ? evolveAimConversation({ projectId: selectedProjectId, messages: sourceMessages })
          : Promise.resolve<AimEvolutionSuggestion[]>([]),
      ])

      const [styleOutcome, projectOutcome] = results
      if (styleOutcome.status === "fulfilled") {
        const result = styleOutcome.value
        if (result.profile) {
          toast.success(result.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
        } else if (result.reason === "no_style") {
          toast.info("这轮对话还没有明显的写作风格可沉淀")
        }
      } else {
        toast.error("写作风格沉淀失败")
      }

      if (projectOutcome.status === "fulfilled") {
        setEvolutionSuggestions(projectOutcome.value)
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "沉淀失败")
    } finally {
      setIsEvolving(false)
    }
  }, [messages, projectEnabled, selectedProjectId])

  async function handleSaveEvolutionSuggestion(suggestion: AimEvolutionSuggestion) {
    if (!selectedProjectId) {
      toast.error("请先选择 IP 营销全案")
      return
    }
    try {
      await createKnowledge({
        projectId: selectedProjectId,
        category: suggestion.category,
        title: suggestion.title,
        content: suggestion.content,
        tags: suggestion.tags,
        sourceType: "manual",
      })
      setEvolutionSuggestions((prev) => prev.filter((item) => item !== suggestion))
      toast.success("已沉淀进知识库")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "知识沉淀失败")
    }
  }

  return {
    isEvolving,
    evolutionSuggestions,
    setEvolutionSuggestions,
    rememberWorkbenchPreference,
    handleEvolveConversation,
    handleSaveEvolutionSuggestion,
  }
}
