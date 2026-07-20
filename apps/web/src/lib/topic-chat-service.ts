import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { generateTopicCards } from "@/lib/topic-generation"
import {
  buildTopicChatReply,
  buildTopicKnowledgeDraft,
  classifyTopicChatInput,
} from "@/lib/topic-chat"
import {
  buildTopicProjectSource,
  createTopicIpProfile,
  loadTopicChatContext,
} from "@/lib/topics/chat-context"
import { buildInspirationReplyText } from "@/features/topics/services/inspiration-reply"
import { enqueueReply } from "@/features/topics/services/reply-outbox"

/**
 * @description 处理topicchatmessage
 * @param input - 输入数据
 * @returns 无返回值
 */
export async function handleTopicChatMessage(input: {
  userId: string
  projectId: string
  content: string
  inspirationId?: string
}) {
  const content = input.content.trim()
  const [project, elements, ipProfile] = await loadTopicChatContext(input)

  if (!project) throw new Error("客户项目不存在或无权访问")

  const classification = classifyTopicChatInput(content)
  const draft = buildTopicKnowledgeDraft({ content, classification })

  const projectSource = buildTopicProjectSource(project)
  const topicIpProfile = ipProfile ?? await createTopicIpProfile(input.userId, project)

  const result = await generateTopicCards({
    ipProfile: topicIpProfile,
    elements,
    topicSources: [
      { category: "client_project", title: project.name, content: projectSource || project.name },
      { category: draft.category, title: draft.title, content: draft.content },
    ],
    recommendationMode: "normal",
    refreshCount: 0,
  })

  if (!result.success) throw new Error(result.error || "选题生成失败")

  const today = new Date().toISOString().split("T")[0]
  const { knowledgeEntry, selection } = await prisma.$transaction(async (tx) => {
    const knowledgeEntry = await tx.knowledgeEntry.create({
      data: {
        userId: input.userId,
        projectId: project.id,
        category: draft.category,
        title: draft.title,
        content: draft.content,
        tags: draft.tags,
        sourceType: draft.sourceType,
        status: "active",
      },
      select: { id: true, category: true, title: true },
    })
    const selection = await tx.topicSelection.create({
      data: {
        userId: input.userId,
        ipProfileId: topicIpProfile.id,
        elementCodes: result.elementCodes as unknown as Prisma.InputJsonValue,
        candidates: result.cards as unknown as Prisma.InputJsonValue,
        sourceHighlights: [
          { category: "client_project", title: project.name, content: projectSource || project.name },
          { category: draft.category, title: draft.title, content: draft.content },
        ] as unknown as Prisma.InputJsonValue,
        promptText: result.promptText,
        model: result.model,
        status: "pending",
        recommendationMode: "normal",
        recommendedDate: today,
      },
      select: { id: true },
    })
    if (input.inspirationId) {
      // Fetch the inspiration record for platform context (needed for outbox reply)
      const inspiration = await tx.inspiration.findUnique({
        where: { id: input.inspirationId },
        select: { source: true, externalChatId: true, externalMessageId: true },
      })
      await tx.inspiration.updateMany({
        where: { id: input.inspirationId, userId: input.userId },
        data: {
          aiStatus: "completed",
          processingStage: "completed",
          generatedTopics: result.cards as unknown as Prisma.InputJsonValue,
          knowledgeEntryId: knowledgeEntry.id,
          topicSelectionId: selection.id,
          errorMessage: null,
        },
      })
      // Create outbox reply for async delivery instead of legacy replyStatus + background task
      if (inspiration?.source) {
        const replyText = buildInspirationReplyText({
          generatedTopics: result.cards,
          topicSelectionId: selection.id,
        })
        await enqueueReply({
          inspirationId: input.inspirationId,
          replyType: "final",
          platform: inspiration.source,
          externalChatId: inspiration.externalChatId || "",
          externalMessageId: inspiration.externalMessageId ?? undefined,
          replyText,
        }, tx as never)
      }
    }
    return { knowledgeEntry, selection }
  })

  const reply = buildTopicChatReply({
    savedTitle: knowledgeEntry.title,
    cards: result.cards.map((card) => ({
      title: card.title,
      hook: card.hook,
      angle: card.angle,
      rationale: card.rationale,
    })),
  })

  return {
    classification,
    knowledgeEntry,
    topicSelectionId: selection.id,
    cards: result.cards,
    reply,
  }
}
