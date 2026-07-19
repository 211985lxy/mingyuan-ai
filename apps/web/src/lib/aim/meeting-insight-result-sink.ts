/**
 * 客户会议洞察的真实结果存储适配器（90 天计划 2.1）。
 *
 * 不新增数据库表：复用现有 AimGeneration 保存会议洞察。
 * 契约：
 *   - agentId = "business_diagnosis"
 *   - rawInput = 会议原文
 *   - rawCopy = 结构化 Markdown 会议洞察
 *   - formatsRequested = ["raw_copy"]
 *   - workflowStatus = "pending_review"
 *   - taskSpec = { kind: "meeting_insight", schemaVersion: 1, 飞书记录 ID,
 *                  会议标题, 客户名称, 结构化九类洞察 }
 *   - 必须绑定 projectId：客户会议不允许落到全局知识空间
 *   - 结果链接统一为 /aim?generationId={id}&projectId={projectId}&stage=results
 *
 * 飞书经营事项只回写结果 ID / 摘要 / 链接 / 状态，不回写完整会议原文。
 */
import { prisma } from "@/lib/prisma"
import type { MeetingInsight } from "@/lib/aim/meeting-insight"
import type { InsightResultSink } from "@/lib/aim/meeting-workflow"

export const MEETING_INSIGHT_AGENT_ID = "business_diagnosis"
export const MEETING_INSIGHT_TASK_SPEC_KIND = "meeting_insight"
export const MEETING_INSIGHT_TASK_SPEC_VERSION = 1

/** AIM 结果链接的统一构造（计划 2.1 约定格式）。 */
export function buildAimResultLink(generationId: string, projectId: string): string {
  return `/aim?generationId=${encodeURIComponent(generationId)}&projectId=${encodeURIComponent(projectId)}&stage=results`
}

function bullet(items: string[]): string {
  return items.length ? items.map((item) => `- ${item}`).join("\n") : "- （待确认）"
}

/** 把结构化洞察渲染为 Markdown（AimGeneration.rawCopy）。 */
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
 */
export function createAimGenerationInsightResultSink(deps: {
  ownerUserId: string
  prismaClient?: AimGenerationCreatePort
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

      const created = await client.aimGeneration.create({
        data: {
          userId: ownerUserId,
          agentId: MEETING_INSIGHT_AGENT_ID,
          projectId,
          rawInput: input.transcript,
          rawCopy: renderMeetingInsightMarkdown(input.insight),
          formatsRequested: ["raw_copy"],
          workflowStatus: "pending_review",
          topicTitle: input.meetingTitle || `会议洞察 · ${input.customer}`,
          taskSpec: {
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
          },
        },
      })

      return {
        aimResultId: created.id,
        resultLink: buildAimResultLink(created.id, projectId),
      }
    },
  }
}
