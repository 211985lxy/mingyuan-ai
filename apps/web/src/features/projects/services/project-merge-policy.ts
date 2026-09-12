export const MOVE_PROJECT_TABLES = [
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
] as const

export const RETAIN_PROJECT_TABLES = [
  "AgentApiCallLog",
  "AuditEvent",
  "ProjectMember",
] as const

export function classifyProjectTables(deployedTables: readonly string[]) {
  const deployed = new Set(deployedTables)
  const known = new Set<string>([...MOVE_PROJECT_TABLES, ...RETAIN_PROJECT_TABLES])
  return {
    move: MOVE_PROJECT_TABLES.filter((table) => deployed.has(table)),
    retain: RETAIN_PROJECT_TABLES.filter((table) => deployed.has(table)),
    missing: [...known].filter((table) => !deployed.has(table)).sort(),
    unknown: [...deployed].filter((table) => !known.has(table)).sort(),
  }
}
