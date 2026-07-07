import { seedAdmin } from "./seed-admin"
import { seedStructures } from "./seed-structures"
import { seedTopicEngine } from "./seed-topic-engine"
import { seedTemplates } from "./seed-templates"
import { DEFAULT_SYSTEM_SETTINGS } from "../src/lib/system-setting-definitions"
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
  const prisma = createPrismaClient()

  console.log("🌱 Seeding database...")
  await seedAdmin()
  await seedTemplates(prisma)
  await seedStructures(prisma)
  await seedTopicEngine(prisma)
  for (const setting of DEFAULT_SYSTEM_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: setting,
    })
  }
  console.log("🌱 Seeding complete!")
  await prisma.$disconnect()
}

main().catch((e) => {
  console.error("Seed failed:", e)
  process.exit(1)
})
