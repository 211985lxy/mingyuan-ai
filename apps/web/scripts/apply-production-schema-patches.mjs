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
  // ── Inspiration 扩展列（灵感管道 + 回复能力） ──
  `ALTER TABLE \`Inspiration\`
    ADD COLUMN IF NOT EXISTS \`projectId\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`dedupeKey\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`processingStage\` VARCHAR(32) NULL,
    ADD COLUMN IF NOT EXISTS \`sourceUrl\` VARCHAR(800) NULL,
    ADD COLUMN IF NOT EXISTS \`canonicalSourceKey\` VARCHAR(255) NULL,
    ADD COLUMN IF NOT EXISTS \`videoCopyExtractionId\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`knowledgeEntryId\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`topicSelectionId\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`replyStatus\` VARCHAR(24) NULL,
    ADD COLUMN IF NOT EXISTS \`replyAttempts\` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS \`replyErrorMessage\` TEXT NULL,
    ADD COLUMN IF NOT EXISTS \`replyClaimToken\` VARCHAR(191) NULL,
    ADD COLUMN IF NOT EXISTS \`replyClaimedAt\` DATETIME(3) NULL,
    ADD COLUMN IF NOT EXISTS \`repliedAt\` DATETIME(3) NULL,
    ADD COLUMN IF NOT EXISTS \`executionModeSnapshot\` VARCHAR(20) NULL`,
  `ALTER TABLE \`Inspiration\`
    ADD UNIQUE INDEX IF NOT EXISTS \`Inspiration_dedupeKey_key\`(\`dedupeKey\`),
    ADD UNIQUE INDEX IF NOT EXISTS \`Inspiration_canonicalSourceKey_key\`(\`canonicalSourceKey\`),
    ADD UNIQUE INDEX IF NOT EXISTS \`Inspiration_replyClaimToken_key\`(\`replyClaimToken\`),
    ADD INDEX IF NOT EXISTS \`Inspiration_projectId_createdAt_idx\`(\`projectId\`, \`createdAt\` DESC),
    ADD INDEX IF NOT EXISTS \`Inspiration_replyStatus_updatedAt_idx\`(\`replyStatus\`, \`updatedAt\`),
    ADD INDEX IF NOT EXISTS \`Inspiration_executionModeSnapshot_idx\`(\`executionModeSnapshot\`),
    ADD INDEX IF NOT EXISTS \`Inspiration_source_idx\`(\`source\`)`,
  // ── ChannelBinding（渠道绑定） ──
  `CREATE TABLE IF NOT EXISTS \`ChannelBinding\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`platform\` VARCHAR(40) NOT NULL,
    \`externalChatId\` VARCHAR(191) NOT NULL,
    \`externalAccountId\` VARCHAR(191) NOT NULL DEFAULT '',
    \`userId\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NOT NULL,
    \`triggerMode\` VARCHAR(32) NOT NULL DEFAULT 'mention_or_keyword',
    \`triggerKeywords\` JSON NOT NULL,
    \`executionMode\` VARCHAR(20) NOT NULL DEFAULT 'live',
    \`status\` VARCHAR(20) NOT NULL DEFAULT 'active',
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,
    UNIQUE INDEX \`ChannelBinding_platform_externalAccountId_externalChatId_key\`(\`platform\`, \`externalAccountId\`, \`externalChatId\`),
    INDEX \`ChannelBinding_userId_status_idx\`(\`userId\`, \`status\`),
    PRIMARY KEY (\`id\`),
    CONSTRAINT \`ChannelBinding_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT \`ChannelBinding_projectId_fkey\` FOREIGN KEY (\`projectId\`) REFERENCES \`ClientProject\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `ALTER TABLE \`ChannelBinding\`
    ADD COLUMN IF NOT EXISTS \`routeTarget\` VARCHAR(16) NOT NULL DEFAULT 'topic',
    ADD COLUMN IF NOT EXISTS \`defaultAgentId\` VARCHAR(40) NULL`,
  // ── AIM 渠道会话（飞书等外部渠道调用 AIM 智能体） ──
  `CREATE TABLE IF NOT EXISTS \`AimConversation\` (
    \`id\` VARCHAR(30) NOT NULL,
    \`userId\` VARCHAR(30) NOT NULL,
    \`projectId\` VARCHAR(30) NOT NULL,
    \`platform\` VARCHAR(40) NOT NULL,
    \`externalChatId\` VARCHAR(191) NOT NULL,
    \`agentId\` VARCHAR(40) NOT NULL,
    \`lastMessageAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    \`updatedAt\` DATETIME(3) NOT NULL,
    UNIQUE INDEX \`AimConversation_platform_externalChatId_agentId_key\`(\`platform\`, \`externalChatId\`, \`agentId\`),
    INDEX \`AimConversation_userId_updatedAt_idx\`(\`userId\`, \`updatedAt\`),
    INDEX \`AimConversation_projectId_updatedAt_idx\`(\`projectId\`, \`updatedAt\`),
    PRIMARY KEY (\`id\`)
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  `CREATE TABLE IF NOT EXISTS \`AimConversationMessage\` (
    \`id\` VARCHAR(30) NOT NULL,
    \`conversationId\` VARCHAR(30) NOT NULL,
    \`role\` VARCHAR(16) NOT NULL,
    \`content\` MEDIUMTEXT NOT NULL,
    \`agentId\` VARCHAR(40) NOT NULL,
    \`externalMessageId\` VARCHAR(191) NULL,
    \`dedupeKey\` VARCHAR(191) NULL,
    \`aimGenerationId\` VARCHAR(40) NULL,
    \`resultSummary\` TEXT NULL,
    \`status\` VARCHAR(20) NOT NULL DEFAULT 'completed',
    \`errorMessage\` TEXT NULL,
    \`createdAt\` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    UNIQUE INDEX \`AimConversationMessage_dedupeKey_key\`(\`dedupeKey\`),
    INDEX \`AimConversationMessage_conversationId_createdAt_idx\`(\`conversationId\`, \`createdAt\`),
    INDEX \`AimConversationMessage_agentId_createdAt_idx\`(\`agentId\`, \`createdAt\`),
    PRIMARY KEY (\`id\`),
    CONSTRAINT \`AimConversationMessage_conversationId_fkey\` FOREIGN KEY (\`conversationId\`) REFERENCES \`AimConversation\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE
  ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  // ── VideoCopyExtraction 扩展列（多 provider 降级） ──
  `ALTER TABLE \`VideoCopyExtraction\`
    ADD COLUMN IF NOT EXISTS \`provider\` VARCHAR(40) NOT NULL DEFAULT 'primary',
    ADD COLUMN IF NOT EXISTS \`fallbackJobId\` VARCHAR(120) NULL`,
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
