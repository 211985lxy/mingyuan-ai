"use client"

import { useMemo, type Dispatch, type SetStateAction } from "react"
import { AGENT_OPTIONS, type AimAgentOption } from "@/features/aim/aim-skill-utils"
import type { AimAgentId } from "@/lib/aim-ui-config"
import type { ContentFormat } from "@/lib/api/client"
import type { AimWorkbenchMessage as ChatMessage } from "@/lib/aim/workbench-types"

type Setter<T> = Dispatch<SetStateAction<T>>

/** Route setters needed by route-sync hooks. */
export type AimRouteSetters = {
  setSelectedAgentId: Setter<AimAgentId>
  setSelectedProjectId: Setter<string>
  setProjectEnabled: Setter<boolean>
  setMessages: Setter<ChatMessage[]>
  setInput: Setter<string>
  setSourceVideoCopyExtractionId: Setter<string | undefined>
  setSourceOriginalText: Setter<string>
  setSourceAnalysisText: Setter<string>
  setSourceTopicTitle: Setter<string>
  setSourceTopicRationale: Setter<string>
  setEditorText: Setter<string>
  setEditorFormat: Setter<ContentFormat | undefined>
  setEditorSourceMessageId: Setter<string | undefined>
  setEditorPanelWidth: Setter<number>
  setEditorPanelOpen: Setter<boolean>
}

/** Build stable route setters object for route-sync hooks. */
export function useRouteSetters(setters: AimRouteSetters): AimRouteSetters {
  return useMemo(() => ({
    setSelectedAgentId: setters.setSelectedAgentId,
    setSelectedProjectId: setters.setSelectedProjectId,
    setProjectEnabled: setters.setProjectEnabled,
    setMessages: setters.setMessages,
    setInput: setters.setInput,
    setSourceVideoCopyExtractionId: setters.setSourceVideoCopyExtractionId,
    setSourceOriginalText: setters.setSourceOriginalText,
    setSourceAnalysisText: setters.setSourceAnalysisText,
    setSourceTopicTitle: setters.setSourceTopicTitle,
    setSourceTopicRationale: setters.setSourceTopicRationale,
    setEditorText: setters.setEditorText,
    setEditorFormat: setters.setEditorFormat,
    setEditorSourceMessageId: setters.setEditorSourceMessageId,
    setEditorPanelWidth: setters.setEditorPanelWidth,
    setEditorPanelOpen: setters.setEditorPanelOpen,
  }), [
    setters.setEditorFormat, setters.setEditorPanelOpen, setters.setEditorPanelWidth,
    setters.setEditorSourceMessageId, setters.setEditorText, setters.setInput,
    setters.setMessages, setters.setSelectedAgentId, setters.setSelectedProjectId,
    setters.setProjectEnabled,
    setters.setSourceAnalysisText, setters.setSourceOriginalText,
    setters.setSourceTopicRationale, setters.setSourceTopicTitle,
    setters.setSourceVideoCopyExtractionId,
  ])
}

/**
 * Derive the active agent config with mode-specific overrides.
 *
 * Handles content_producer asset_pack mode and single-create mode.
 */
export function useAimAgentConfig(input: {
  selectedAgentId: AimAgentId
  modeParam: string | null
  sourceTopicTitle: string
  sourceVideoCopyExtractionId: string | undefined
}): AimAgentOption {
  const { selectedAgentId, modeParam, sourceTopicTitle, sourceVideoCopyExtractionId } = input

  return useMemo(() => {
    const baseAgent = AGENT_OPTIONS.find((a) => a.id === selectedAgentId)!
    const isAssetPack = modeParam === "asset_pack"
      || (modeParam === "quick" && Boolean(sourceTopicTitle.trim() || sourceVideoCopyExtractionId))
    if (selectedAgentId === "content_producer" && isAssetPack) {
      const isHotTopicAsset = sourceTopicTitle.trim().length > 0 && !sourceVideoCopyExtractionId
      return {
        ...baseAgent,
        title: "内容文案创作 · 内容资产包",
        intro: "这里是内容文案创作的资产包模式。先生成短视频脚本，拍摄交接单、朋友圈、社群运营、公众号文章可按需点击派生。",
        placeholder: isHotTopicAsset
          ? "这个热点要怎么讲？补充你的观点、客户场景或产品承接，我先生成主脚本..."
          : "说说今天要生产什么内容：选题、原始想法、老板口述、客户问题都可以，我先生成主脚本...",
        defaultFormats: ["video_script" as const],
        quickPrompts: [
          "把这个选题先生成短视频脚本。",
          "基于老板的这段金句，先输出一版可拍脚本。",
        ],
        primaryActionLabel: "生成口播文案",
      }
    }
    if (selectedAgentId === "content_producer") {
      return {
        ...baseAgent,
        title: `${baseAgent.displayTitle ?? baseAgent.title} · 单篇创作`,
        defaultFormats: ["video_script" as const],
        placeholder: "粘贴选题、原始想法、老板口述、现有文案或爆款拆解，我来生成可发布内容…",
        primaryActionLabel: "生成口播文案",
      }
    }
    if (selectedAgentId === "deep_copywriter") return { ...baseAgent, title: baseAgent.displayTitle ?? baseAgent.title }
    return baseAgent
  }, [modeParam, selectedAgentId, sourceTopicTitle, sourceVideoCopyExtractionId])
}
