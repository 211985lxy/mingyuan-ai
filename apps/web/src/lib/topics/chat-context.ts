import { prisma } from "@/lib/prisma"

interface TopicChatProject {
  id: string
  name: string
  industry: string | null
  targetCustomer: string | null
  offer: string | null
  deliveryGoal: string | null
}

export async function loadTopicChatContext(input: { userId: string; projectId: string }) {
  return Promise.all([
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
      take: 200,
      select: { code: true, name: true, typeLabel: true, description: true },
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
}

export function buildTopicProjectSource(project: TopicChatProject): string {
  return [
    project.industry ? `行业：${project.industry}` : null,
    project.targetCustomer ? `目标客户：${project.targetCustomer}` : null,
    project.offer ? `产品/服务：${project.offer}` : null,
    project.deliveryGoal ? `交付目标：${project.deliveryGoal}` : null,
  ].filter(Boolean).join("\n")
}

export async function createTopicIpProfile(userId: string, project: TopicChatProject) {
  return prisma.ipProfile.create({
    data: {
      userId,
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
}
