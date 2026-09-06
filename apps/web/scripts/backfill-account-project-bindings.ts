/**
 * Conservative one-time migration for the account → project binding.
 *
 * Default mode is dry-run. Pass --apply only after reviewing the candidates.
 * A row is auto-bound only when exactly one active project name/company name
 * matches the account name or its IP profile name; all other rows stay visible
 * in the admin review queue.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "../src/generated/prisma/client"
import { bindAccountProject } from "../src/lib/account-project-context"
import { chooseUniqueBindingCandidate } from "../src/lib/account-project-binding-backfill"

function createPrismaClient() {
  const rawUrl = (process.env.DATABASE_URL ?? "").replace(/^mysql:\/\//, "mariadb://")
  if (!rawUrl) throw new Error("DATABASE_URL is required")
  const url = new URL(rawUrl)
  return new PrismaClient({
    adapter: new PrismaMariaDb({
      host: url.hostname,
      port: parseInt(url.port || "3306", 10),
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      database: url.pathname.slice(1),
      charset: "utf8mb4",
      connectionLimit: 5,
    }),
  })
}

async function main() {
  const apply = process.argv.includes("--apply")
  const prisma = createPrismaClient()
  let autoBound = 0
  let reviewRequired = 0
  let setupRequired = 0

  try {
    const users = await prisma.user.findMany({
      where: { boundProjectId: null },
      select: {
        id: true,
        name: true,
        ipProfile: { select: { displayName: true, nickname: true } },
        clientProjects: {
          where: { status: "active" },
          select: { id: true, name: true, companyName: true },
        },
      },
    })

    for (const user of users) {
      const candidate = chooseUniqueBindingCandidate({
        userName: user.name,
        profileNames: [user.ipProfile?.displayName, user.ipProfile?.nickname],
        projects: user.clientProjects,
      })

      if (!candidate) {
        if (user.clientProjects.length === 0) setupRequired += 1
        else reviewRequired += 1
        continue
      }

      autoBound += 1
      console.log(`${apply ? "[apply]" : "[dry-run]"} ${user.id} -> ${candidate.id}`)
      if (apply) {
        await bindAccountProject({ userId: user.id, projectId: candidate.id, source: "migration" })
      }
    }

    console.log(`完成：${apply ? "已执行" : "预览"}，可自动绑定 ${autoBound}，待审核 ${reviewRequired}，待设置 ${setupRequired}`)
    if (!apply) console.log("未写入数据库；确认候选后再传入 --apply。")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error) => {
  console.error("账号项目绑定回填失败：", error)
  process.exitCode = 1
})
