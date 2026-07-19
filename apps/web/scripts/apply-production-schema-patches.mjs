import { execFileSync } from "node:child_process"
import { resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { parseMysqlUrl } from "./verify-production-schema.mjs"

export const PRODUCTION_SCHEMA_PATCHES = [
  `ALTER TABLE \`AimExecutionTrace\`
    ADD COLUMN IF NOT EXISTS \`inputTokens\` INTEGER NULL,
    ADD COLUMN IF NOT EXISTS \`outputTokens\` INTEGER NULL,
    ADD COLUMN IF NOT EXISTS \`cachedTokens\` INTEGER NULL,
    ADD COLUMN IF NOT EXISTS \`costCny\` DECIMAL(10,6) NULL`,
  `CREATE TABLE IF NOT EXISTS \`AssetCandidate\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`userId\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NOT NULL,
    \`generationId\` VARCHAR(191) NOT NULL,
    \`feishuRecordId\` VARCHAR(64) NULL,
    \`kind\` VARCHAR(40) NOT NULL,
    \`title\` VARCHAR(200) NOT NULL,
    \`content\` TEXT NOT NULL,
    \`evidence\` TEXT NULL,
    \`confidence\` VARCHAR(10) NOT NULL DEFAULT 'medium',
    \`reviewStatus\` VARCHAR(20) NOT NULL DEFAULT 'pending',
    \`crossProjectAllowed\` BOOLEAN NOT NULL DEFAULT false,
    \`promotedEntryId\` VARCHAR(191) NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,
    INDEX \`AssetCandidate_userId_reviewStatus_idx\`(\`userId\`, \`reviewStatus\`),
    INDEX \`AssetCandidate_userId_projectId_kind_idx\`(\`userId\`, \`projectId\`, \`kind\`),
    INDEX \`AssetCandidate_generationId_idx\`(\`generationId\`),
    PRIMARY KEY (\`id\`),
    CONSTRAINT \`AssetCandidate_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT \`AssetCandidate_projectId_fkey\` FOREIGN KEY (\`projectId\`) REFERENCES \`ClientProject\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
]

function runMysql(connection, query) {
  const args = ["--protocol=TCP", "--host", connection.host, "--port", connection.port, "--user", connection.user]
  args.push(connection.database, "--execute", query)
  execFileSync(process.env.MYSQL_BIN || "mysql", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, MYSQL_PWD: connection.password },
  })
}

function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required")
  const connection = parseMysqlUrl(process.env.DATABASE_URL)
  for (const query of PRODUCTION_SCHEMA_PATCHES) runMysql(connection, query)
  console.log(`production-schema-patches-ok count=${PRODUCTION_SCHEMA_PATCHES.length}`)
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
