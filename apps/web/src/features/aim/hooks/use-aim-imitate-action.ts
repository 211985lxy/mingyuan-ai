import { useState } from "react"
import { toast } from "sonner"
import { polishScript } from "@/lib/api/client"
import type { StyleGuideId } from "@/lib/style-guide-config"
import type { AimEditorActionsOptions } from "@/features/aim/hooks/aim-editor-action-contracts"

/**
 * @description React Hook：aimimitateaction
 * @param options - 配置选项
 * @returns 无返回值
 */
export function useAimImitateAction(options: AimEditorActionsOptions) {
  const [isImitating, setIsImitating] = useState(false)
  const [imitateStyleId, setImitateStyleId] = useState("default")

  function handleImitate() {
    const sourceText = options.sourceOriginalText.trim()
    if (sourceText.length < 30) return toast.error("请先在对标面板加载一条对标爆款原文")
    if (options.editorText.trim().length < 30) return toast.error("草稿太短，请先写一些你行业的方向作为仿写参考")
    setIsImitating(true)
    void polishScript({
      mode: "imitate",
      content: options.editorText,
      viralSourceText: sourceText,
      persona: options.agent.defaultInstruction,
      projectId: options.selectedProjectId || undefined,
      topicTitle: options.sourceTopicTitle || undefined,
      ...(imitateStyleId !== "default" ? { styleId: imitateStyleId as StyleGuideId } : {}),
    }).then((result) => {
      options.setEditorText(result.polished)
      toast.success("已把对标爆款的结构逻辑迁移到你的稿子")
    }).catch((error) => toast.error(error instanceof Error ? error.message : "仿写失败，请重试"))
      .finally(() => setIsImitating(false))
  }

  return { isImitating, imitateStyleId, setImitateStyleId, handleImitate }
}
