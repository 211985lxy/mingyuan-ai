import type { ContentFormat } from "@/lib/api/client"
import type { AimAgentId } from "@/lib/aim-ui-config"

export interface EditorPanelLabels {
  title: string
  collapsedTitle: string
  referenceTitle: string
  referencePlaceholder: string
  draftTitle: string
  draftPlaceholder: string
  currentLabel: string
  selectActionLabel: string
  documentType: "copy" | "plan"
}

const COPY_FORMATS = new Set<ContentFormat>([
  "video_script",
  "koubo_script",
  "wechat_article",
  "moments_post",
  "community_message",
  "shooting_brief",
  "xiaohongshu_post",
])

const COPY_EDITOR_LABELS: EditorPanelLabels = {
  title: "文案编辑",
  collapsedTitle: "展开文案编辑",
  referenceTitle: "对标文案",
  referencePlaceholder: "暂无对标原文案",
  draftTitle: "我的稿子",
  draftPlaceholder: "AI 生成的稿子会出现在这里，也可以直接粘贴/编辑。",
  currentLabel: "当前稿",
  selectActionLabel: "修改选中文案",
  documentType: "copy",
}

/**
 * @description 根据 Agent 类型和内容格式获取编辑器面板的显示标签配置
 * @param agentId - AIM Agent 标识（如 content_producer、persona 等）
 * @param editorFormat - 可选的内容格式（如 video_script、wechat_article 等）
 * @returns 编辑器面板标签配置对象
 */
export function getAimEditorPanelLabels(agentId: AimAgentId, editorFormat?: ContentFormat): EditorPanelLabels {
  if ((editorFormat && COPY_FORMATS.has(editorFormat)) || agentId === "content_producer" || agentId === "free_copywriter" || agentId === "work_editor") {
    return COPY_EDITOR_LABELS
  }

  if (agentId === "business_system_diagnosis") {
    return {
      title: "诊断案编辑",
      collapsedTitle: "展开诊断案编辑",
      referenceTitle: "业务材料",
      referencePlaceholder: "暂无业务材料",
      draftTitle: "我的诊断案",
      draftPlaceholder: "AI 生成的诊断案会出现在这里，也可以直接粘贴/编辑。",
      currentLabel: "当前诊断案",
      selectActionLabel: "修改选中诊断案",
      documentType: "plan",
    }
  }

  if (agentId === "persona") {
    return {
      title: "人设策划案编辑",
      collapsedTitle: "展开人设策划案编辑",
      referenceTitle: "人物材料",
      referencePlaceholder: "暂无人物材料",
      draftTitle: "我的人设策划案",
      draftPlaceholder: "AI 生成的人设策划案会出现在这里，也可以直接粘贴/编辑。",
      currentLabel: "当前人设策划案",
      selectActionLabel: "修改选中策划案",
      documentType: "plan",
    }
  }

  return {
    title: "策划案编辑",
    collapsedTitle: "展开策划案编辑",
    referenceTitle: "参考材料",
    referencePlaceholder: "暂无参考材料",
    draftTitle: "我的策划案",
    draftPlaceholder: "AI 生成的定位策划案会出现在这里，也可以直接粘贴/编辑。",
    currentLabel: "当前策划案",
    selectActionLabel: "修改选中策划案",
    documentType: "plan",
  }
}
