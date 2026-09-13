import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import test from "node:test"

import {
  extractExpectedObjects,
  findMissing,
  formatDriftReport,
  mergePrismaDirToString,
} from "./check-migration-drift.mjs"

const SAMPLE_DDL = `
-- CreateTable
CREATE TABLE \`UserQuestionCard\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`userId\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NULL,
    \`userQuoteSnippets\` JSON NOT NULL,

    INDEX \`UserQuestionCard_status_idx\`(\`status\`),
    PRIMARY KEY (\`id\`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE \`Script\` (
    \`id\` VARCHAR(191) NOT NULL,
    \`projectId\` VARCHAR(191) NULL
) DEFAULT CHARACTER SET utf8mb4;

-- AddForeignKey
ALTER TABLE \`UserQuestionCard\` ADD CONSTRAINT \`UserQuestionCard_userId_fkey\` FOREIGN KEY (\`userId\`) REFERENCES \`User\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX \`ChannelBinding_projectId_status_idx\` ON \`ChannelBinding\`(\`projectId\`, \`status\`);
`

test("从理想 DDL 解析期望集合：表/列/外键/索引", () => {
  const expected = extractExpectedObjects(SAMPLE_DDL)
  assert.equal(expected.tables.size, 2)
  assert.ok(expected.tables.has("UserQuestionCard"))
  // 列只收类型行，PRIMARY KEY / INDEX 行不算列
  assert.ok(expected.columns.has("UserQuestionCard.userQuoteSnippets"))
  assert.ok(![...expected.columns].some((c) => c.endsWith(".id)")))
  assert.equal([...expected.columns].filter((c) => c.startsWith("Script.")).length, 2)
  assert.deepEqual([...expected.foreignKeys.keys()], ["UserQuestionCard_userId_fkey"])
  assert.equal(expected.foreignKeys.get("UserQuestionCard_userId_fkey"), "UserQuestionCard")
  assert.deepEqual([...expected.indexes.keys()], ["ChannelBinding_projectId_status_idx"])
})

test("期望 − 实际 = 缺失清单", () => {
  const expected = extractExpectedObjects(SAMPLE_DDL)
  const missing = findMissing(
    expected,
    new Map(), // 一个外键都没有
    new Map([["UserQuestionCard_status_idx", "UserQuestionCard"]]),
    new Set(["UserQuestionCard"]), // Script 表缺失
    new Set(["UserQuestionCard.id", "UserQuestionCard.userId", "UserQuestionCard.projectId", "UserQuestionCard.userQuoteSnippets"]),
  )
  assert.deepEqual(missing.missingForeignKeys, ["UserQuestionCard.UserQuestionCard_userId_fkey"])
  assert.deepEqual(missing.missingIndexes, ["ChannelBinding.ChannelBinding_projectId_status_idx"])
  assert.deepEqual(missing.missingTables, ["Script"])
  assert.deepEqual(missing.missingColumns, ["Script.id", "Script.projectId"])
  assert.match(formatDriftReport(missing).join("\n"), /缺失外键/)
})

test("全部齐备时报 ok", () => {
  const expected = extractExpectedObjects(SAMPLE_DDL)
  const missing = findMissing(
    expected,
    new Map([["UserQuestionCard_userId_fkey", "UserQuestionCard"]]),
    new Map([["ChannelBinding_projectId_status_idx", "ChannelBinding"]]),
    new Set(["UserQuestionCard", "Script"]),
    new Set([...expected.columns]),
  )
  assert.equal(formatDriftReport(missing).length, 0)
})

test("目录 schema 合并成单文件：剥 generator、保留一个 datasource 和全部模型", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-dir-"))
  fs.writeFileSync(path.join(dir, "a.prisma"), [
    'generator client { provider = "prisma-client" }',
    'datasource db { provider = "mysql" }',
    "model Alpha { id String @id }",
  ].join("\n"))
  fs.writeFileSync(path.join(dir, "b.prisma"), [
    'generator client { provider = "prisma-client" }',
    'datasource db { provider = "mysql" }',
    "model Beta { id String @id }",
  ].join("\n"))

  const merged = mergePrismaDirToString(dir)
  assert.match(merged, /model Alpha \{/)
  assert.match(merged, /model Beta \{/)
  assert.equal(merged.match(/generator client/g)?.length ?? 0, 0)
  assert.equal(merged.match(/datasource db/g)?.length ?? 0, 1)
  fs.rmSync(dir, { recursive: true })
})

test("没有 .prisma 文件时合并报错", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "prisma-empty-"))
  assert.throws(() => mergePrismaDirToString(dir), /no \.prisma files/)
  fs.rmSync(dir, { recursive: true })
})
