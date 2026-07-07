import { PrismaClient } from "./src/generated/prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"

function createPrismaClient() {
  const url = new URL(
    "mysql://mingyuan:changethis@127.0.0.1:3306/mingyuan".replace(/^mysql:\/\//, "mariadb://")
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
  try {
    const accounts = await prisma.watchAccount.findMany()
    console.log("ACCOUNTS_RESULT:", JSON.stringify(accounts, null, 2))
  } catch (e) {
    console.error("Failed to query watch accounts:", e)
  }
  
  await prisma.$disconnect()
}

main()
