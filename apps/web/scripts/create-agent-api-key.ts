/**
 * 创建外部 Agent API Key。
 *
 * 运行示例：
 * DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/create-agent-api-key.ts \
 *   --email=admin@mingyuan.ai \
 *   --projects=project_id_1,project_id_2 \
 *   --name=codex-test \
 *   --dailyLimit=20
 */
import { createHash, randomBytes } from "crypto"

import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

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
  return {
    email: args.get("email") || "",
    name: args.get("name") || "external-agent",
    projects: (args.get("projects") || "").split(",").map((item) => item.trim()).filter(Boolean),
    agents: (args.get("agents") || DEFAULT_AGENTS.join(",")).split(",").map((item) => item.trim()).filter(Boolean),
    dailyLimit: parseInt(args.get("dailyLimit") || "50", 10),
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

  const invalidAgents = input.agents.filter((agent) => !DEFAULT_AGENTS.includes(agent))
  if (invalidAgents.length > 0) {
    throw new Error(`不支持的智能体：${invalidAgents.join(", ")}`)
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
      },
    })

    console.log("✓ Agent API Key 已创建。明文 Key 只会显示这一次。")
    console.log(`账号: ${user.email}`)
    console.log(`项目: ${projects.map((project) => project.name).join(", ")}`)
    console.log(`智能体: ${input.agents.join(", ")}`)
    console.log(`每日上限: ${input.dailyLimit}`)
    console.log(`API Key: ${plainKey}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("创建失败:", error instanceof Error ? error.message : error)
  process.exit(1)
})
