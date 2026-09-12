import { readFileSync, readdirSync } from "fs"
import path from "path"
import { describe, expect, it } from "vitest"

import {
  MOVE_PROJECT_TABLES,
  RETAIN_PROJECT_TABLES,
  classifyProjectTables,
} from "@/features/projects/services/project-merge-policy"

const appRoot = path.resolve(__dirname, "../..")

function stripPrismaComments(source: string): string {
  const withoutBlock = source.replace(/\/\*[\s\S]*?\*\//g, "")
  return withoutBlock
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n")
}

function modelsWithProjectIdFromPrisma(): string[] {
  const prismaRoot = path.join(appRoot, "prisma")
  const models: string[] = []

  for (const entry of readdirSync(prismaRoot, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".prisma")) continue

    const content = stripPrismaComments(readFileSync(path.join(prismaRoot, entry.name), "utf8"))
    const modelBlocks = content.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)

    for (const match of modelBlocks) {
      const modelName = match[1]
      const body = match[2]
      const hasProjectIdField = body
        .split("\n")
        .some((line) => /^\s+projectId\s+/.test(line) && !line.trim().startsWith("@@"))

      if (hasProjectIdField) {
        models.push(modelName)
      }
    }
  }

  return models
}

const expectedMove = [
  "AgentInvocation",
  "AimConversation",
  "AimExecutionTrace",
  "AimGeneration",
  "AimMemory",
  "AimRunSnapshot",
  "ApprovalDecision",
  "AssetCandidate",
  "BenchmarkProfile",
  "ChannelBinding",
  "CompetitorAnalysis",
  "ContentGenerationRun",
  "ContentOutcome",
  "CustomerOutcomeProjection",
  "Inspiration",
  "IpWikiPage",
  "KnowledgeEntity",
  "KnowledgeEntry",
  "LearningCandidate",
  "OpportunityCollection",
  "Script",
  "TopicSelection",
  "UserQuestionCard",
  "VideoCopyExtraction",
  "VideoStructure",
  "WatchAccount",
]

const expectedRetain = ["AgentApiCallLog", "AuditEvent", "ProjectMember"]

describe("project merge table policy", () => {
  it("lists every Prisma model with projectId in move or retain policy", () => {
    expect([...MOVE_PROJECT_TABLES].sort()).toEqual(expectedMove.sort())
    expect([...RETAIN_PROJECT_TABLES].sort()).toEqual(expectedRetain.sort())
    expect([...modelsWithProjectIdFromPrisma()].sort()).toEqual(
      [...expectedMove, ...expectedRetain].sort(),
    )
  })

  it("classifies deployed tables into move, retain, missing, and unknown", () => {
    expect(classifyProjectTables(["AimGeneration", "AuditEvent", "BrandNewProjectTable"])).toEqual({
      move: ["AimGeneration"],
      retain: ["AuditEvent"],
      missing: expect.arrayContaining(["KnowledgeEntry"]),
      unknown: ["BrandNewProjectTable"],
    })
  })
})
