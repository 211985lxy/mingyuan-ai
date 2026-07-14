import type { Prisma } from "@/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { generateTopicCards } from "@/lib/topic-generation"
import {
  buildTopicChatReply,
  buildTopicKnowledgeDraft,
  classifyTopicChatInput,
} from "@/lib/topic-chat"

export async function handleTopicChatMessage(input: {
  userId: string
  projectId: string
  content: string
}) {
  const content = input.content.trim()
  const [project, elements, ipProfile] = await Promise.all([
    prisma.clientProject.findFirst({
      where: { id: input.projectId, userId: input.userId, status: "active" },
      select: {
        id: true,
        name: true,
        industry: true,
        targetCustomer: true,
        offer: true,
        deliveryGoal: true,
      },
    }),
    prisma.topicElement.findMany({
      where: { status: "published" },
      orderBy: { sortOrder: "asc" },
      select: { code: true, name: true, typeLabel: true, description: true },
      take: 200,
    }),
    prisma.ipProfile.findUnique({
      where: { userId: input.userId },
      select: {
        id: true,
        displayName: true,
        industry: true,
        primaryOffer: true,
        targetAudience: true,
      },
    }).catch(() => null),
  ])

  if (!project) throw new Error("客户项目不存在或无权访问")

  const classification = classifyTopicChatInput(content)
  const draft = buildTopicKnowledgeDraft({ content, classification })

  const knowledgeEntry = await prisma.knowledgeEntry.create({
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

  const projectSource = [
    project.industry ? `行业：${project.industry}` : null,
    project.targetCustomer ? `目标客户：${project.targetCustomer}` : null,
    project.offer ? `产品/服务：${project.offer}` : null,
    project.deliveryGoal ? `交付目标：${project.deliveryGoal}` : null,
  ].filter(Boolean).join("\n")

  const topicIpProfile = ipProfile ?? await prisma.ipProfile.create({
    data: {
      userId: input.userId,
      displayName: project.name,
      industry: project.industry,
      primaryOffer: project.offer,
      targetAudience: project.targetCustomer,
      isComplete: false,
      isActive: true,
    },
    select: {
      id: true,
      displayName: true,
      industry: true,
      primaryOffer: true,
      targetAudience: true,
    },
  })

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
  const selection = await prisma.topicSelection.create({
    data: {
      userId: input.userId,
      ipProfileId: topicIpProfile.id,
      elementCodes: result.elementCodes as unknown as Prisma.InputJsonValue,
      candidates: result.cards as unknown as Prisma.InputJsonValue,
      promptText: result.promptText,
      model: result.model,
      status: "pending",
      recommendationMode: "normal",
      recommendedDate: today,
    },
    select: { id: true },
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
