/**
 * 创建外部 Agent API Key。
 *
 * V2.1 远程能力升级：支持 clientType、scopes、minuteLimit、dailyTokenLimit、
 * maxInputChars、expiresAt。当未指定 scopes 时，按 clientType 设置默认 scope
 * 预设（codex / workbuddy / custom）。明文 Key 仅创建时显示一次，数据库只存 SHA-256。
 *
 * 运行示例（Codex 专用 Key）：
 * DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/create-agent-api-key.ts \
 *   --email=admin@mingyuan.ai \
 *   --projects=project_id_1 \
 *   --name=codex-prod \
 *   --clientType=codex \
 *   --dailyLimit=20 \
 *   --minuteLimit=3 \
 *   --maxInputChars=50000
 *
 * 运行示例（WorkBuddy 专用 Key）：
 * DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/create-agent-api-key.ts \
 *   --email=admin@mingyuan.ai \
 *   --projects=project_id_1 \
 *   --name=workbuddy-prod \
 *   --clientType=workbuddy
 */
import { createHash, randomBytes } from "crypto"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"
import {
  AGENT_CLIENT_TYPES,
  AGENT_SCOPES,
  defaultScopesForClientType,
  type AgentClientType,
} from "../src/lib/aim-remote/contracts"

const DEFAULT_AGENTS = [
  "business_system_diagnosis",
  "business_diagnosis",
  "content_producer",
  "content_review",
]

function parseArgs() {
  const args = new Map<string, string>()
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) args.set(match[1], match[2])
  }
  const clientTypeRaw = args.get("clientType") || "custom"
  const scopesRaw = args.get("scopes")
  return {
    email: args.get("email") || "",
    name: args.get("name") || "external-agent",
    projects: (args.get("projects") || "").split(",").map((item) => item.trim()).filter(Boolean),
    agents: (args.get("agents") || DEFAULT_AGENTS.join(",")).split(",").map((item) => item.trim()).filter(Boolean),
    dailyLimit: parseInt(args.get("dailyLimit") || "50", 10),
    clientType: clientTypeRaw,
    scopes: scopesRaw ? scopesRaw.split(",").map((item) => item.trim()).filter(Boolean) : null,
    minuteLimit: parseInt(args.get("minuteLimit") || "60", 10),
    dailyTokenLimit: args.get("dailyTokenLimit") ? parseInt(args.get("dailyTokenLimit") as string, 10) : null,
    maxInputChars: parseInt(args.get("maxInputChars") || "50000", 10),
    expiresAt: args.get("expiresAt") || null,
  }
}

function createPrismaClient() {
  const url = new URL((process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://"))
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
    }),
  })
}

function hashKey(key: string) {
  return createHash("sha256").update(key).digest("hex")
}

async function main() {
  const input = parseArgs()
  if (!input.email) throw new Error("缺少 --email")
  if (input.projects.length === 0) throw new Error("缺少 --projects，必须显式授权项目 ID")
  if (!Number.isFinite(input.dailyLimit) || input.dailyLimit < 1) {
    throw new Error("--dailyLimit 必须大于 0")
  }
  if (!AGENT_CLIENT_TYPES.includes(input.clientType as AgentClientType)) {
    throw new Error(`--clientType 必须为 ${AGENT_CLIENT_TYPES.join(" / ")} 之一`)
  }
  const clientType = input.clientType as AgentClientType

  // Resolve scopes: explicit --scopes wins; otherwise default preset by clientType
  let scopes: string[]
  if (input.scopes) {
    const invalid = input.scopes.filter((scope) => !AGENT_SCOPES.includes(scope))
    if (invalid.length > 0) throw new Error(`不支持的 scope：${invalid.join(", ")}`)
    scopes = input.scopes
  } else {
    scopes = defaultScopesForClientType(clientType)
  }

  const invalidAgents = input.agents.filter((agent) => !DEFAULT_AGENTS.includes(agent))
  if (invalidAgents.length > 0) {
    throw new Error(`不支持的智能体：${invalidAgents.join(", ")}`)
  }

  let expiresAt: Date | null = null
  if (input.expiresAt) {
    const parsed = new Date(input.expiresAt)
    if (Number.isNaN(parsed.getTime())) throw new Error("--expiresAt 不是合法的 ISO 日期")
    expiresAt = parsed
  }

  const prisma = createPrismaClient()
  try {
    const user = await prisma.user.findUnique({
      where: { email: input.email },
      select: { id: true, email: true },
    })
    if (!user) throw new Error(`未找到账号：${input.email}`)

    const projects = await prisma.clientProject.findMany({
      where: {
        userId: user.id,
        id: { in: input.projects },
        status: "active",
      },
      select: { id: true, name: true },
    })

    if (projects.length !== input.projects.length) {
      const found = new Set(projects.map((project) => project.id))
      const missing = input.projects.filter((projectId) => !found.has(projectId))
      throw new Error(`项目不存在、已归档或不属于该账号：${missing.join(", ")}`)
    }

    const plainKey = `maim_${randomBytes(24).toString("base64url")}`
    await prisma.agentApiKey.create({
      data: {
        userId: user.id,
        name: input.name,
        keyPrefix: plainKey.slice(0, 14),
        keyHash: hashKey(plainKey),
        allowedProjects: input.projects,
        allowedAgents: input.agents,
        dailyLimit: input.dailyLimit,
        clientType,
        allowedScopes: scopes,
        minuteLimit: input.minuteLimit,
        dailyTokenLimit: input.dailyTokenLimit,
        maxInputChars: input.maxInputChars,
        expiresAt,
      },
    })

    console.log("✓ Agent API Key 已创建。明文 Key 只会显示这一次。")
    console.log(`账号: ${user.email}`)
    console.log(`名称: ${input.name}`)
    console.log(`客户端类型: ${clientType}`)
    console.log(`项目: ${projects.map((project) => project.name).join(", ")}`)
    console.log(`智能体: ${input.agents.join(", ")}`)
    console.log(`Scopes: ${scopes.join(", ") || "(空 — 强制开关开启时 fail-closed)"}`)
    console.log(`每日上限: ${input.dailyLimit} 次 / 分钟 ${input.minuteLimit} 次`)
    if (input.dailyTokenLimit) console.log(`每日 Token 上限: ${input.dailyTokenLimit}`)
    console.log(`输入字符上限: ${input.maxInputChars}`)
    if (expiresAt) console.log(`过期时间: ${expiresAt.toISOString()}`)
    console.log(`API Key: ${plainKey}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("创建失败:", error instanceof Error ? error.message : error)
  process.exit(1)
})
