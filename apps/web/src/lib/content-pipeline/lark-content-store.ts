/*
 * 飞书 Base 「内容素材库」写入器
 *
 * 环境变量：
 *   LARK_CLI_PATH             — lark-cli 可执行文件路径
 *   LARK_CONTENT_BASE_TOKEN  — 内容素材库 Base token
 *   LARK_CONTENT_TABLE_ID    — 内容素材数据表 table ID
 */

import { runLarkBaseCommand } from "@/lib/lark-base-tool"

// ─── 类型定义 ──────────────────────────────────────────────────────

export type ContentItemStatus = "待处理" | "处理中" | "已完成" | "失败"

export interface ContentItemRecord {
  视频标题: string
  原始链接: string
  来源: string
  转录文本: string
  AI总结: string
  关键要点: string
  处理状态: ContentItemStatus
  处理时间: string
}

export interface ContentStoreConfig {
  cliPath?: string
  baseToken: string
  tableId: string
}

// ─── 配置读取 ──────────────────────────────────────────────────────

export function readContentStoreConfig(
  env: Record<string, string | undefined> = process.env,
): ContentStoreConfig {
  const cliPath = env.LARK_CLI_PATH?.trim()
  const baseToken = env.LARK_CONTENT_BASE_TOKEN?.trim()
  const tableId = env.LARK_CONTENT_TABLE_ID?.trim()

  if (!baseToken) throw new Error("缺少 LARK_CONTENT_BASE_TOKEN")
  if (!tableId) throw new Error("缺少 LARK_CONTENT_TABLE_ID")

  return { cliPath, baseToken, tableId }
}

// ─── 去重查询 ──────────────────────────────────────────────────────

export async function findExistingRecord(
  videoUrl: string,
  config?: ContentStoreConfig,
): Promise<string | null> {
  const cfg = config || readContentStoreConfig()
  const runCommand = (command: string, args: string[]) =>
    runLarkBaseCommand(command, args, { cliPath: cfg.cliPath })

  try {
    const payload = await runCommand("+record-list", [
      "--base-token", cfg.baseToken,
      "--table-id", cfg.tableId,
      "--filter", `原始链接="${videoUrl}"`,
      "--limit", "1",
    ])

    const data = payload as Record<string, unknown>
    const items = extractRecordItems(data)
    if (items.length > 0 && items[0].record_id) {
      return items[0].record_id
    }
    return null
  } catch {
    return null
  }
}

// ─── 写入/更新记录 ──────────────────────────────────────────────────

export async function upsertContentItem(
  record: ContentItemRecord,
  config?: ContentStoreConfig,
): Promise<{ ok: boolean; recordId?: string; error?: string }> {
  const cfg = config || readContentStoreConfig()
  const runCommand = (command: string, args: string[]) =>
    runLarkBaseCommand(command, args, { cliPath: cfg.cliPath })

  try {
    const fields: Record<string, unknown> = {
      视频标题: record.视频标题,
      原始链接: record.原始链接,
      来源: record.来源,
      转录文本: record.转录文本,
      AI总结: record.AI总结,
      关键要点: record.关键要点,
      处理状态: record.处理状态,
      处理时间: record.处理时间,
    }

    const existingId = await findExistingRecord(record.原始链接, cfg)
    if (existingId) {
      await runCommand("+record-upsert", [
        "--base-token", cfg.baseToken,
        "--table-id", cfg.tableId,
        "--record-id", existingId,
        "--json", JSON.stringify(fields),
      ])
      return { ok: true, recordId: existingId }
    }

    const payload = await runCommand("+record-upsert", [
      "--base-token", cfg.baseToken,
      "--table-id", cfg.tableId,
      "--json", JSON.stringify(fields),
    ])

    const data = payload as Record<string, unknown>
    const items = extractRecordItems(data)
    const recordId = items.length > 0 ? items[0].record_id : undefined

    return { ok: true, recordId }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export async function createPendingContentItem(
  videoUrl: string,
  source: string,
  config?: ContentStoreConfig,
): Promise<{ ok: boolean; recordId?: string; error?: string }> {
  return upsertContentItem(
    {
      视频标题: "处理中...",
      原始链接: videoUrl,
      来源: source,
      转录文本: "",
      AI总结: "",
      关键要点: "",
      处理状态: "待处理",
      处理时间: new Date().toISOString().slice(0, 10),
    },
    config,
  )
}

// ─── 辅助函数 ──────────────────────────────────────────────────────

interface RecordItem {
  record_id?: string
  fields?: Record<string, unknown>
}

function extractRecordItems(payload: unknown): RecordItem[] {
  if (!payload || typeof payload !== "object") return []
  const data = payload as Record<string, unknown>

  const inner =
    data.data && typeof data.data === "object"
      ? (data.data as Record<string, unknown>)
      : data

  const items = Array.isArray(inner.items)
    ? inner.items
    : Array.isArray(inner.records)
      ? inner.records
      : []

  return items.filter(
    (item): item is RecordItem => !!item && typeof item === "object",
  )
}
