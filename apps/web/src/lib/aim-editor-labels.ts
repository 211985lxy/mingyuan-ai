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

// Keep this client-facing module independent from the server-only LLM router.
// These are the legacy agent ids that the router maps to copy_studio.* modules.
const COPY_STUDIO_AGENT_IDS = new Set<AimAgentId>([
  "content_producer",
  "deep_copywriter",
  "free_copywriter",
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

export function getAimEditorPanelLabels(agentId: AimAgentId, editorFormat?: ContentFormat): EditorPanelLabels {
  // content_producer/free_copywriter/deep_copywriter 都会在服务端映射为
  // copy_studio.*，统一走文案编辑标签；
  // 文案创作官（copywriter）是三者合并的统一创作入口，同样走文案编辑标签
  if ((editorFormat && COPY_FORMATS.has(editorFormat)) || COPY_STUDIO_AGENT_IDS.has(agentId) || agentId === "copywriter") {
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
