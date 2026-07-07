import { PrismaClient } from "../src/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import bcrypt from "bcryptjs"

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

const prisma = createPrismaClient()

export async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@mingyuan.ai"
  const password = process.env.ADMIN_PASSWORD

  if (!password) {
    console.log("⚠ ADMIN_PASSWORD not set, skipping admin seed")
    return
  }

  const existing = await prisma.adminUser.findUnique({ where: { email } })
  if (existing) {
    console.log(`✓ Admin user already exists: ${email}`)
    return
  }

  const hash = await bcrypt.hash(password, 12)
  await prisma.adminUser.create({
    data: {
      email,
      password: hash,
      name: "Admin",
      role: "admin",
    },
  })
  console.log(`✓ Created admin user: ${email}`)
}
