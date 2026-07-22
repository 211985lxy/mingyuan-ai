/**
 * 飞书文档版本保护与阶段感知更新策略（WP-6）。
 *
 * 核心规则：
 * - 尚未审核 → 更新 AIM 草稿区（overwrite 草稿段落）
 * - 待人工审核 → 追加 AI 修订稿 v2（append，不覆盖人工内容）
 * - 已完成 → 创建新版本（新建文档，旧文档保留）
 * - 人工已编辑 → 禁止全文 overwrite（只允许 append 到指定区域）
 *
 * 文档结构模板（标准化 Markdown）：
 *   # {标题}
 *   ## 当前确认版本
 *   ## AIM 草稿区
 *   ## 人工编辑区
 *   ## 待确认问题
 *   ## 版本记录
 *   ## 运行与来源信息
 */
import { createFeishuDoc, updateFeishuDoc, fetchFeishuDoc } from "@/lib/integrations/feishu-doc-publisher"
import type { LarkCliRunner } from "@/lib/integrations/lark-cli-runner"

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 经营事项阶段（决定文档更新策略）。 */
export type WorkItemStage =
  | "draft"              // 尚未审核（AIM 草稿）
  | "pending_review"     // 待人工审核
  | "completed"          // 已完成
  | "human_edited"       // 人工已编辑

/** 文档更新策略。 */
export type DocUpdateStrategy =
  | "overwrite_draft"    // 覆盖 AIM 草稿区
  | "append_revision"    // 追加 AI 修订稿
  | "create_new_version" // 创建新版本
  | "forbidden"          // 禁止操作

export interface DocVersionContext {
  /** 经营事项当前阶段。 */
  stage: WorkItemStage
  /** 已有文档 token（无则为首次创建）。 */
  existingDocToken?: string
  /** 当前版本号。 */
  currentVersion: number
  /** 人工是否已编辑（通过回读内容检测）。 */
  humanEdited: boolean
}

export interface DocUpdateResult {
  strategy: DocUpdateStrategy
  token: string
  url: string
  version: number
}

// ─── 策略决策 ────────────────────────────────────────────────────────────────

/**
 * 根据阶段和上下文决定文档更新策略。
 */
export function resolveDocUpdateStrategy(context: DocVersionContext): DocUpdateStrategy {
  // 人工已编辑 → 禁止全文 overwrite
  if (context.humanEdited && context.stage !== "completed") {
    return "append_revision"
  }

  switch (context.stage) {
    case "draft":
      // 尚未审核 → 更新 AIM 草稿区
      return context.existingDocToken ? "overwrite_draft" : "overwrite_draft"

    case "pending_review":
      // 待人工审核 → 追加 AI 修订稿
      return "append_revision"

    case "completed":
      // 已完成 → 创建新版本
      return "create_new_version"

    case "human_edited":
      // 人工已编辑 → 禁止全文 overwrite，只允许追加
      return "append_revision"

    default:
      return "forbidden"
  }
}

// ─── 文档结构模板 ────────────────────────────────────────────────────────────

/** 人工编辑区标记（用于检测人工是否编辑过）。 */
export const HUMAN_EDIT_SECTION_MARKER = "## 人工编辑区"
export const HUMAN_EDIT_PLACEHOLDER = "（暂无编辑）"

/**
 * 构建标准化文档结构。
 */
export function buildStandardDocStructure(input: {
  title: string
  confirmedContent: string
  aimDraft: string
  pendingQuestions?: string[]
  version: number
  runInfo?: string
}): string {
  const sections = [
    `# ${input.title}`,
    "",
    "## 当前确认版本",
    input.confirmedContent || "（待确认）",
    "",
    "## AIM 草稿区",
    input.aimDraft,
    "",
    HUMAN_EDIT_SECTION_MARKER,
    HUMAN_EDIT_PLACEHOLDER,
    "",
    "## 待确认问题",
    ...(input.pendingQuestions?.length
      ? input.pendingQuestions.map((q) => `- ${q}`)
      : ["- （无）"]),
    "",
    "## 版本记录",
    `| 版本 | 时间 | 操作 |`,
    `| --- | --- | --- |`,
    `| v${input.version} | ${new Date().toISOString().slice(0, 10)} | AIM 生成 |`,
    "",
    "## 运行与来源信息",
    input.runInfo || "（无）",
    "",
  ]
  return sections.join("\n")
}

/**
 * 检测文档内容是否包含人工编辑。
 * 规则：人工编辑区存在且内容不是占位符 → 人工已编辑。
 */
export function detectHumanEdit(content: string): boolean {
  const markerIdx = content.indexOf(HUMAN_EDIT_SECTION_MARKER)
  if (markerIdx === -1) return false

  // 取人工编辑区到下一个 ## 之间的内容
  const afterMarker = content.slice(markerIdx + HUMAN_EDIT_SECTION_MARKER.length)
  const nextSectionIdx = afterMarker.indexOf("\n## ")
  const sectionContent = nextSectionIdx === -1
    ? afterMarker
    : afterMarker.slice(0, nextSectionIdx)

  const trimmed = sectionContent.trim()
  // 如果只有占位符或为空，则未编辑
  if (!trimmed || trimmed === HUMAN_EDIT_PLACEHOLDER) return false
  return true
}

// ─── 阶段感知更新执行 ────────────────────────────────────────────────────────

/**
 * 执行阶段感知的文档更新。
 */
export async function executeDocVersionUpdate(input: {
  context: DocVersionContext
  title: string
  newContent: string
  folderToken?: string
  runner?: LarkCliRunner
  cliPath?: string
}): Promise<DocUpdateResult> {
  const strategy = resolveDocUpdateStrategy(input.context)

  switch (strategy) {
    case "overwrite_draft": {
      // 覆盖 AIM 草稿区（首次创建或草稿阶段更新）
      if (!input.context.existingDocToken) {
        const created = await createFeishuDoc({
          title: input.title,
          content: input.newContent,
          folderToken: input.folderToken,
          runner: input.runner,
          cliPath: input.cliPath,
        })
        return { strategy, token: created.token, url: created.url, version: 1 }
      }
      // 更新已有文档的草稿区
      await updateFeishuDoc({
        documentId: input.context.existingDocToken,
        content: input.newContent,
        mode: "replace",
        runner: input.runner,
        cliPath: input.cliPath,
      })
      return {
        strategy,
        token: input.context.existingDocToken,
        url: `https://feishu.cn/docx/${input.context.existingDocToken}`,
        version: input.context.currentVersion,
      }
    }

    case "append_revision": {
      // 追加 AI 修订稿（不覆盖人工内容）
      const docToken = input.context.existingDocToken
      if (!docToken) {
        // 无已有文档则创建
        const created = await createFeishuDoc({
          title: input.title,
          content: input.newContent,
          folderToken: input.folderToken,
          runner: input.runner,
          cliPath: input.cliPath,
        })
        return { strategy, token: created.token, url: created.url, version: 1 }
      }

      const newVersion = input.context.currentVersion + 1
      const revisionContent = [
        "",
        `---`,
        `## AI 修订稿 v${newVersion}`,
        `> 修订时间：${new Date().toISOString()}`,
        "",
        input.newContent,
        "",
      ].join("\n")

      await updateFeishuDoc({
        documentId: docToken,
        content: revisionContent,
        mode: "append",
        runner: input.runner,
        cliPath: input.cliPath,
      })

      return {
        strategy,
        token: docToken,
        url: `https://feishu.cn/docx/${docToken}`,
        version: newVersion,
      }
    }

    case "create_new_version": {
      // 已完成 → 创建新版本（新文档）
      const newVersion = input.context.currentVersion + 1
      const versionedTitle = `${input.title} (v${newVersion})`
      const created = await createFeishuDoc({
        title: versionedTitle,
        content: input.newContent,
        folderToken: input.folderToken,
        runner: input.runner,
        cliPath: input.cliPath,
      })
      return { strategy, token: created.token, url: created.url, version: newVersion }
    }

    case "forbidden":
    default:
      throw new Error("当前阶段禁止文档更新操作")
  }
}
