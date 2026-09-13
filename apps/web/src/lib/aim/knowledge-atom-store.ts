import { prisma } from "@/lib/prisma"
import { atomContentHash, splitKnowledgeAtoms } from "@/lib/aim/knowledge-atoms"

type AtomDelegate = {
  upsert(args: unknown): Promise<unknown>
  count(args: unknown): Promise<number>
}

function atoms(): AtomDelegate | null {
  return (prisma as unknown as { knowledgeAtom?: AtomDelegate }).knowledgeAtom ?? null
}

export async function persistKnowledgeAtomsForEntry(input: {
  userId: string
  projectId?: string | null
  entryId: string
  title: string
  content: string
  valueGrade: string | null
}): Promise<number> {
  const delegate = atoms()
  if (!delegate) return 0
  const drafts = splitKnowledgeAtoms({
    title: input.title,
    content: input.content,
    valueGrade: input.valueGrade,
  })
  for (const draft of drafts) {
    const contentHash = atomContentHash(draft.content)
    await delegate.upsert({
      where: { entryId_contentHash: { entryId: input.entryId, contentHash } },
      create: {
        userId: input.userId,
        projectId: input.projectId ?? null,
        entryId: input.entryId,
        kind: draft.kind,
        content: draft.content,
        valueGrade: draft.valueGrade,
        contentHash,
      },
      update: { kind: draft.kind, valueGrade: draft.valueGrade },
    })
  }
  return drafts.length
}

export async function atomizeProjectKnowledge(input: {
  userId: string
  projectId: string
  take?: number
}): Promise<{ entries: number; atoms: number }> {
  const entries = await prisma.knowledgeEntry.findMany({
    where: { userId: input.userId, projectId: input.projectId, status: "active" },
    select: { id: true, title: true, content: true, valueGrade: true, projectId: true },
    take: input.take ?? 1000,
  })
  let atomsCreated = 0
  for (const entry of entries) {
    atomsCreated += await persistKnowledgeAtomsForEntry({
      userId: input.userId,
      projectId: entry.projectId,
      entryId: entry.id,
      title: entry.title,
      content: entry.content,
      valueGrade: entry.valueGrade,
    })
  }
  return { entries: entries.length, atoms: atomsCreated }
}

export async function countProjectAtoms(projectId: string): Promise<number> {
  const delegate = atoms()
  if (!delegate) return 0
  return delegate.count({ where: { projectId } })
}
