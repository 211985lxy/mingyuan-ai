/**
 * 停用一个外部 Agent API Key（status → disabled）。
 *
 * 停用后立即生效：authenticateAgentToken 会因 status !== "active" 返回 401。
 * 用于密钥轮换流程中的"停用旧 Key"步骤。
 *
 * 运行示例：
 * DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/disable-agent-api-key.ts \
 *   --keyPrefix=maim_a1b2c3
 *
 * 也可用 --name 定位（按 email 下的 name 精确匹配）：
 * DOTENV_CONFIG_PATH=.env.local NODE_OPTIONS='-r dotenv/config' npx tsx scripts/disable-agent-api-key.ts \
 *   --email=admin@mingyuan.ai \
 *   --name=codex-prod
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"

function parseArgs() {
  const args = new Map<string, string>()
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/)
    if (match) args.set(match[1], match[2])
  }
  return {
    keyPrefix: args.get("keyPrefix") || "",
    email: args.get("email") || "",
    name: args.get("name") || "",
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

async function main() {
  const input = parseArgs()
  if (!input.keyPrefix && !(input.email && input.name)) {
    throw new Error("需要 --keyPrefix 或 (--email + --name) 之一来定位 Key")
  }

  const prisma = createPrismaClient()
  try {
    const target = await (async () => {
      if (input.keyPrefix) {
        const keys = await prisma.agentApiKey.findMany({
          where: { keyPrefix: { startsWith: input.keyPrefix } },
          select: { id: true, name: true, keyPrefix: true, status: true, userId: true },
        })
        if (keys.length === 0) throw new Error(`未找到前缀匹配的 Key：${input.keyPrefix}`)
        if (keys.length > 1) {
          const list = keys.map((k) => `${k.keyPrefix} (${k.name})`).join("\n  ")
          throw new Error(`前缀匹配到多个 Key，请提供更完整的前缀：\n  ${list}`)
        }
        return keys[0]
      }
      // email + name lookup
      const user = await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })
      if (!user) throw new Error(`未找到账号：${input.email}`)
      const key = await prisma.agentApiKey.findFirst({
        where: { userId: user.id, name: input.name },
        select: { id: true, name: true, keyPrefix: true, status: true },
      })
      if (!key) throw new Error(`未找到名为 "${input.name}" 的 Key`)
      return key
    })()

    if (target.status === "disabled") {
      console.log(`Key ${target.keyPrefix} (${target.name}) 已是停用状态，无需重复操作。`)
      return
    }

    await prisma.agentApiKey.update({
      where: { id: target.id },
      data: { status: "disabled" },
    })

    console.log("✓ Agent API Key 已停用，立即生效（后续调用返回 401）。")
    console.log(`名称: ${target.name}`)
    console.log(`前缀: ${target.keyPrefix}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("停用失败:", error instanceof Error ? error.message : error)
  process.exit(1)
})
