/**
 * 一次性开发脚本：把指定账号的订阅有效期延长 N 天（本地开发绕过激活用）。
 * 仅作用于 email 精确匹配的单个账号，打印前后值。
 *
 * 运行：DOTENV_CONFIG_PATH=.env NODE_OPTIONS='-r dotenv/config' npx tsx scripts/dev-extend-subscription.ts <email> [days]
 */
import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

function createPrismaClient() {
  const url = new URL(
    (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  )
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
  const email = process.argv[2] || "admin@mingyuan.ai"
  const days = parseInt(process.argv[3] || "365", 10)

  const prisma = createPrismaClient()
  try {
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, expiresAt: true, plan: true } })
    if (!user) {
      console.error(`✗ 未找到账号: ${email}`)
      process.exit(1)
    }
    const before = user.expiresAt
    const next = new Date()
    next.setDate(next.getDate() + days)
    await prisma.user.update({ where: { id: user.id }, data: { expiresAt: next } })
    console.log(`✓ 已延长订阅`)
    console.log(`  账号:    ${user.email}`)
    console.log(`  原到期:  ${before ? new Date(before).toISOString() : "(未设置/未激活)"}`)
    console.log(`  新到期:  ${next.toISOString()}（+${days} 天）`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error("失败:", e)
  process.exit(1)
})
