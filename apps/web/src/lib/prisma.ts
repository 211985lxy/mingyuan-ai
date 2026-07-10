// BigInt → Number in JSON.stringify (Prisma BigInt fields)
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types
;(BigInt.prototype as BigInt & { toJSON(): number }).toJSON = function () {
  return Number(this)
}

import { PrismaClient } from "@/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

type PrismaGlobal = {
  prisma?: PrismaClient
}

const globalForPrisma = globalThis as unknown as PrismaGlobal

function hasRequiredDelegates(client: PrismaClient): boolean {
  const prismaClient = client as PrismaClient & {
    publicAvatarPreviewCache?: { findUnique?: unknown }
    publicAvatarPreviewPreference?: { findUnique?: unknown }
    hotTopicFitCache?: { findUnique?: unknown; upsert?: unknown }
    contentTemplate?: { fields?: { expressionBlueprint?: unknown } }
    videoProductionPlan?: { fields?: { recommendationContext?: unknown } }
    pexelsMedia?: { fields?: { provider?: unknown } }
    pexelsQueryCache?: { fields?: { provider?: unknown } }
    clientProject?: { findMany?: unknown }
    aiHotBriefing?: { findUnique?: unknown; upsert?: unknown }
    watchAccount?: { findMany?: unknown; create?: unknown }
    videoCopyExtraction?: { findUnique?: unknown; create?: unknown; update?: unknown }
    agentApiKey?: { findUnique?: unknown; update?: unknown }
    agentApiCallLog?: { create?: unknown; count?: unknown }
    aimExecutionTrace?: { create?: unknown; update?: unknown; findMany?: unknown }
  }

  return (
    typeof prismaClient.publicAvatarPreviewCache?.findUnique === "function"
    && typeof prismaClient.publicAvatarPreviewPreference?.findUnique === "function"
    && typeof prismaClient.hotTopicFitCache?.findUnique === "function"
    && typeof prismaClient.hotTopicFitCache?.upsert === "function"
    && prismaClient.contentTemplate?.fields?.expressionBlueprint !== undefined
    && prismaClient.videoProductionPlan?.fields?.recommendationContext !== undefined
    && prismaClient.pexelsMedia?.fields?.provider !== undefined
    && prismaClient.pexelsQueryCache?.fields?.provider !== undefined
    && typeof prismaClient.clientProject?.findMany === "function"
    && typeof prismaClient.aiHotBriefing?.findUnique === "function"
    && typeof prismaClient.aiHotBriefing?.upsert === "function"
    && typeof prismaClient.watchAccount?.findMany === "function"
    && typeof prismaClient.watchAccount?.create === "function"
    && typeof prismaClient.videoCopyExtraction?.findUnique === "function"
    && typeof prismaClient.videoCopyExtraction?.create === "function"
    && typeof prismaClient.videoCopyExtraction?.update === "function"
    && typeof prismaClient.agentApiKey?.findUnique === "function"
    && typeof prismaClient.agentApiKey?.update === "function"
    && typeof prismaClient.agentApiCallLog?.create === "function"
    && typeof prismaClient.agentApiCallLog?.count === "function"
    && typeof prismaClient.aimExecutionTrace?.create === "function"
    && typeof prismaClient.aimExecutionTrace?.update === "function"
    && typeof prismaClient.aimExecutionTrace?.findMany === "function"
  )
}

function createPrismaClient() {
  // `next build` 的 page-data collection 阶段会 import 本模块；构建机/CI 可能
  // 没有 DATABASE_URL。此时用占位 URL 让模块加载成功（构建不会真正连库），
  // 真正缺失连接串只会在运行期首次查询时报错——生产环境永远会注入
  // DATABASE_URL（systemd EnvironmentFile）。这不是 Mock：占位串不返回任何
  // 假数据，只是推迟到运行期失败。
  const rawUrl = (process.env.DATABASE_URL ?? "").trim()
  const connectionString = rawUrl
    ? rawUrl.replace(/^mysql:\/\//, "mariadb://")
    : "mariadb://build:build@127.0.0.1:3306/mingyuan"
  const url = new URL(connectionString)
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: parseInt(url.port || "3306"),
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    charset: "utf8mb4",
    connectionLimit: 20,
    idleTimeout: 30000,
    connectTimeout: 5000,
    allowPublicKeyRetrieval: true,
  })
  return new PrismaClient({ adapter })
}

function getPrismaClient(): PrismaClient {
  if (globalForPrisma.prisma && hasRequiredDelegates(globalForPrisma.prisma)) {
    return globalForPrisma.prisma
  }

  const nextClient = createPrismaClient()
  globalForPrisma.prisma = nextClient
  return nextClient
}

export const prisma = getPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
