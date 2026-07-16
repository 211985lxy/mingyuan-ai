"use client"

import { useState } from "react"
import { toast } from "sonner"

import { createKnowledge, evolveAimConversation, evolveStyleConversation, type AimEvolutionSuggestion } from "@/lib/api/client"
import type { AimWorkbenchMessage } from "@/lib/aim/workbench-types"

interface AimEvolutionActionInput {
  messages: AimWorkbenchMessage[]
  selectedProjectId: string
  projectEnabled: boolean
}

async function rememberPreference(input: AimEvolutionActionInput, command: string) {
  const messages = [
    ...input.messages.map((message) => ({ role: message.role, content: message.content })),
    { role: "user" as const, content: command },
  ].filter((message) => message.content.trim()).slice(-8)
  if (messages.length === 0) {
    toast.error("没有可沉淀的偏好内容")
    return
  }
  try {
    const result = await evolveStyleConversation({ messages })
    if (result.profile) {
      toast.success(result.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
    } else if (result.reason === "no_style") {
      toast.info("这句话还没有形成稳定偏好")
    } else {
      toast.info(result.reason || "这句话没有形成稳定偏好")
    }
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "偏好沉淀失败")
  }
}

async function evolveConversation(input: AimEvolutionActionInput, setSuggestions: (items: AimEvolutionSuggestion[]) => void) {
  const messages = input.messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({ role: message.role, content: message.content }))
  if (messages.length < 2) {
    toast.error("对话太少，还没有可沉淀的偏好")
    return
  }
  const projectRequest = input.projectEnabled && input.selectedProjectId
    ? evolveAimConversation({ projectId: input.selectedProjectId, messages })
    : Promise.resolve<AimEvolutionSuggestion[]>([])
  const [styleOutcome, projectOutcome] = await Promise.allSettled([
    evolveStyleConversation({ messages }),
    projectRequest,
  ])
  if (styleOutcome.status === "fulfilled") {
    const result = styleOutcome.value
    if (result.profile) toast.success(result.created ? "已建立全局写作风格档案" : "全局写作风格档案已更新")
    else if (result.reason === "no_style") toast.info("这轮对话还没有明显的写作风格可沉淀")
  } else {
    toast.error("写作风格沉淀失败")
  }
  if (projectOutcome.status === "fulfilled") setSuggestions(projectOutcome.value)
}

async function saveSuggestion(input: AimEvolutionActionInput, suggestion: AimEvolutionSuggestion) {
  if (!input.selectedProjectId) return toast.error("请先选择 IP 营销全案")
  try {
    await createKnowledge({
      projectId: input.selectedProjectId,
      category: suggestion.category,
      title: suggestion.title,
      content: suggestion.content,
      tags: suggestion.tags,
      sourceType: "manual",
    })
    toast.success("已沉淀进知识库")
    return true
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "知识沉淀失败")
    return false
  }
}

export function useAimEvolutionActions(input: AimEvolutionActionInput) {
  const [isEvolving, setIsEvolving] = useState(false)
  const [evolutionSuggestions, setEvolutionSuggestions] = useState<AimEvolutionSuggestion[]>([])

  const withProgress = async (action: () => Promise<void>) => {
    setIsEvolving(true)
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "偏好提炼失败")
    } finally {
      setIsEvolving(false)
    }
  }

  return {
    isEvolving,
    evolutionSuggestions,
    dismissEvolutionSuggestion: (suggestion: AimEvolutionSuggestion) => {
      setEvolutionSuggestions((current) => current.filter((item) => item !== suggestion))
    },
    rememberWorkbenchPreference: (command: string) => void withProgress(() => rememberPreference(input, command)),
    handleEvolveConversation: () => withProgress(() => evolveConversation(input, setEvolutionSuggestions)),
    handleSaveEvolutionSuggestion: async (suggestion: AimEvolutionSuggestion) => {
      if (await saveSuggestion(input, suggestion)) {
        setEvolutionSuggestions((current) => current.filter((item) => item !== suggestion))
      }
    },
  }
}
