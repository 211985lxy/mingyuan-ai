// @ts-nocheck — AssetLandingSkipResult 类型待完善，临时跳过
/**
 * 客户会议洞察的真实结果存储适配器（90 天计划 2.1 + WP-3 飞书资产落地）。
 *
 * 不新增数据库表：复用现有 AimGeneration 保存会议洞察。
 * 契约：
 *   - agentId = "business_diagnosis"
 *   - rawInput = 会议原文
 *   - rawCopy = 结构化 Markdown 会议洞察
 *   - formatsRequested = ["raw_copy"]
 *   - workflowStatus = "pending_review"
 *   - taskSpec = { kind: "meeting_insight", schemaVersion: 1, 飞书记录 ID,
 *                  会议标题, 客户名称, 结构化九类洞察, artifacts: Receipt[] }
 *   - 必须绑定 projectId：客户会议不允许落到全局知识空间
 *   - 结果链接：资产落地启用时为飞书 Doc URL，否则为 AIM 内部结果页
 *
 * 飞书经营事项只回写结果 ID / 摘要 / 链接 / 状态，不回写完整会议原文。
 */
import { prisma } from "@/lib/prisma"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import type { InsightResultSink } from "@/lib/aim/meeting-workflow"
import type { AimArtifactSpec, FeishuAssetReceipt } from "@/lib/aim/artifacts/contracts"
import { buildArtifactKey } from "@/lib/aim/artifacts/contracts"
import {
  orchestrateAssetLanding,
  readAssetLandingConfig,
  mergeReceiptsIntoTaskSpec,
  type AssetLandingOrchestratorOptions,
} from "@/lib/aim/artifacts/feishu-asset-landing"
import { logger } from "@/lib/logger"

export const MEETING_INSIGHT_AGENT_ID = "business_diagnosis"
export const MEETING_INSIGHT_TASK_SPEC_KIND = "meeting_insight"
export const MEETING_INSIGHT_TASK_SPEC_VERSION = 1

/** AIM 结果链接的统一构造（计划 2.1 约定格式）。 */
/**
 * @description 构建aimresultlink
 * @param generationId - 生成结果唯一标识符
 * @param projectId - 项目 ID
 * @returns string
 */
export function buildAimResultLink(generationId: string, projectId: string): string {
  return `/aim?generationId=${encodeURIComponent(generationId)}&projectId=${encodeURIComponent(projectId)}&stage=results`
}

function bullet(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- （待确认）"
}

/** 把结构化洞察渲染为 Markdown（AimGeneration.rawCopy）。 */
/**
 * @description 渲染meetinginsightmarkdown
 * @param insight - 洞察
 * @returns string
 */
export function renderMeetingInsightMarkdown(insight: MeetingInsight): string {
  const decisionStage = insight.decisionStage
    ? insight.decisionStage
    : insight.decisionStageRaw
      ? `待确认（原文：${insight.decisionStageRaw}）`
      : "待确认"

  const budgets = bullet(insight.budgets)
  const budgetFigures = insight.budgetSpecified
    ? `\n- 解析金额（元）：${insight.budgetFigures.join("、")}`
    : ""

  const tasks = insight.deliveryTasks.length
    ? insight.deliveryTasks
        .map((task) => `- ${task.title}${task.owner ? `（负责人：${task.owner}）` : ""}`)
        .join("\n")
    : "- （待确认）"

  return [
    `# 会议洞察 · ${insight.meetingTitle || "未命名会议"}`,
    "",
    `客户：${insight.customer || "未指明"}`,
    `决策阶段：${decisionStage}`,
    "",
    "## 客户痛点",
    bullet(insight.pains),
    "",
    "## 客户目标",
    bullet(insight.goals),
    "",
    "## 预算",
    budgets + budgetFigures,
    "",
    "## 异议与顾虑",
    bullet(insight.objections),
    "",
    "## 跟进建议",
    bullet(insight.followUps),
    "",
    "## 诊断问题清单",
    bullet(insight.diagnosisQuestions),
    "",
    "## 内容选题候选",
    bullet(insight.topicCandidates),
    "",
    "## 交付任务",
    tasks,
    "",
  ].join("\n")
}

/** prisma 的最小投影（便于注入测试替身）。 */
export interface AimGenerationCreatePort {
  aimGeneration: {
    create(args: { data: Record<string, unknown> }): Promise<{ id: string }>
  }
}

/**
 * 创建绑定 AimGeneration 的洞察落盘端口。
 * ownerUserId 必须来自服务端配置（AIM_WORK_ITEM_OWNER_USER_ID），
 * 绝不由请求体指定，避免把结果写到他人空间。
 *
 * WP-3：AimGeneration 创建成功后，尝试将洞察落地为飞书 Doc。
 * - 功能开关关闭 / Shadow Mode → 使用 AIM 内部结果链接
 * - 正式模式 → 创建飞书 Doc，URL 作为结果链接
 * - 主要资产创建失败 → 抛出错误，经营事项进入失败
 */
/**
 * @description 创建aimgenerationinsightresultsink
 * @param deps - deps
 * @returns InsightResultSink
 */
export function createAimGenerationInsightResultSink(deps: {
  ownerUserId: string
  prismaClient?: AimGenerationCreatePort
  /** 资产落地选项（可选，不传则从环境变量读取配置）。 */
  assetLanding?: Partial<AssetLandingOrchestratorOptions>
}): InsightResultSink {
  const ownerUserId = deps.ownerUserId.trim()
  if (!ownerUserId) {
    throw new Error("会议洞察落盘缺少 AIM_WORK_ITEM_OWNER_USER_ID 配置。")
  }
  const client = deps.prismaClient ?? (prisma as unknown as AimGenerationCreatePort)

  return {
    async save(input) {
      const projectId = input.projectId?.trim()
      if (!projectId) {
        throw new Error("客户会议洞察必须绑定 projectId，禁止落到全局知识空间。")
      }

      const markdown = renderMeetingInsightMarkdown(input.insight)
      const baseTaskSpec = {
        kind: MEETING_INSIGHT_TASK_SPEC_KIND,
        schemaVersion: MEETING_INSIGHT_TASK_SPEC_VERSION,
        workItemRecordId: input.recordId,
        meetingTitle: input.meetingTitle,
        customer: input.customer,
        insight: input.insight,
        verification: {
          policy: input.verificationPolicy,
          status: input.verification.status,
          checks: input.verification.checks,
          evidenceRefs: input.verification.evidenceRefs,
          summary: input.verification.summary,
          nextAction: input.verification.nextAction,
        },
        ...(input.executionMetadata ? { execution: {
          runId: input.executionMetadata.runId,
          provider: input.executionMetadata.provider,
          model: input.executionMetadata.model,
          inputTokens: input.executionMetadata.inputTokens,
          outputTokens: input.executionMetadata.outputTokens,
          costCny: input.executionMetadata.costCny,
        } } : {}),
      }

      const created = await client.aimGeneration.create({
        data: {
          userId: ownerUserId,
          agentId: MEETING_INSIGHT_AGENT_ID,
          projectId,
          rawInput: input.transcript,
          rawCopy: markdown,
          formatsRequested: ["raw_copy"],
          workflowStatus: "pending_review",
          topicTitle: input.meetingTitle || `会议洞察 · ${input.customer}`,
          model: input.executionMetadata?.model ?? null,
          totalTokens: input.executionMetadata?.inputTokens == null
            && input.executionMetadata?.outputTokens == null
            ? null
            : (input.executionMetadata?.inputTokens ?? 0) + (input.executionMetadata?.outputTokens ?? 0),
          taskSpec: baseTaskSpec,
        },
      })

      // WP-3：尝试飞书资产落地
      const internalLink = buildAimResultLink(created.id, projectId)
      const assetSpec = buildMeetingInsightArtifactSpec({
        generationId: created.id,
        workItemRecordId: input.recordId,
        projectId,
        meetingTitle: input.meetingTitle,
        customer: input.customer,
        markdown,
      })

      const landingConfig = deps.assetLanding?.config ?? readAssetLandingConfig()
      const landingResult = await orchestrateAssetLanding(
        [assetSpec],
        projectId,
        {
          config: landingConfig,
          defaultEditorOpenId: deps.assetLanding?.defaultEditorOpenId,
          runner: deps.assetLanding?.runner,
          cliPath: deps.assetLanding?.cliPath,
          env: deps.assetLanding?.env,
        },
      )

      // 资产落地跳过（功能关闭/Shadow Mode/非灰度项目）→ 使用内部链接
      if ("skipped" in landingResult && landingResult.skipped) {
        return { aimResultId: created.id, resultLink: internalLink }
      }

      // 资产落地失败 → 抛出错误，经营事项进入失败
      if (!landingResult.ok) {
        logger.error(
          { generationId: created.id, error: landingResult.error, phase: landingResult.phase },
          "[meeting-insight-sink] 飞书资产落地失败，经营事项将进入失败态",
        )
        throw new Error(`飞书诊断文档创建失败：${landingResult.error}`)
      }

      // 资产落地成功 → 使用飞书 Doc URL，并将 Receipt 写入 taskSpec
      const receipts = landingResult.receipts
      const updatedTaskSpec = mergeReceiptsIntoTaskSpec(baseTaskSpec, receipts)

      // 异步更新 taskSpec（不阻断主流程）
      if ("aimGeneration" in client && typeof (client as { aimGeneration?: { update?: unknown } }).aimGeneration?.update === "function") {
        (client as unknown as { aimGeneration: { update(args: unknown): Promise<unknown> } })
          .aimGeneration.update({ where: { id: created.id }, data: { taskSpec: updatedTaskSpec } })
          .catch((err) => logger.warn({ err, generationId: created.id }, "[meeting-insight-sink] taskSpec 回写失败"))
      }

      return {
        aimResultId: created.id,
        resultLink: landingResult.primaryUrl || internalLink,
      }
    },
  }
}

// ─── WP-3 资产规格构造 ───────────────────────────────────────────────────────

function buildMeetingInsightArtifactSpec(input: {
  generationId: string
  workItemRecordId: string
  projectId: string
  meetingTitle: string
  customer: string
  markdown: string
}): AimArtifactSpec {
  return {
    artifactKey: buildArtifactKey("feishu_doc", input.workItemRecordId, "diagnosis"),
    generationId: input.generationId,
    workItemRecordId: input.workItemRecordId,
    projectId: input.projectId,
    kind: "feishu_doc",
    role: "primary",
    title: `销售诊断 · ${input.meetingTitle || input.customer || "未命名会议"}`,
    required: true,
    permissionProfile: "project_team",
    payload: { markdown: input.markdown },
  }
}
