/**
 * 飞书 Base「内容素材库」写入器
 *
 * 负责将视频处理结果写入飞书多维表格。
 * 复用 AIM 现有的 runLarkBaseCommand 基础设施。
 *
 * 环境变量要求：
 *   LARK_CLI_PATH          — lark-cli 可执行文件路径
 *   LARK_CONTENT_BASE_TOKEN — 内容素材库 Base token
 *   LARK_CONTENT_TABLE_ID    — 内容素材数据表 table ID
 */

import { runLarkBaseCommand } from "@/lib/lark-base-tool"

// ─── 类型定义 ──────────────────────────────────────────────────────

/** 处理状态枚举 */
export type ContentItemStatus = "待处理" | "处理中" | "已完成" | "失败"

/** 写入飞书 Base 的记录结构 */
export interface ContentItemRecord {
  /** 视频标题（轻抖返回或 AI 生成） */
  视频标题: string
  /** 原始视频链接 */
  原始链接: string
  /** 来源：路由一 "抖音群" / 路由二 "视频号" */
  来源: string
  /** 完整转录/文案文本 */
  转录文本: string
  /** AI 生成的内容摘要 */
  AI总结: string
  /** 关键要点（换行分隔） */
  关键要点: string
  /** 处理状态 */
  处理状态: ContentItemStatus
  /** 处理时间 ISO 格式 */
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

  if (!baseToken) throw new Error("缺少 LARK_CONTENT_BASE_TOKEN，请在环境变量中配置内容素材库的 Base token")
  if (!tableId) throw new Error("缺少 LARK_CONTENT_TABLE_ID，请在环境变量中配置内容素材库的数据表 ID")

  return { cliPath, baseToken, tableId }
}

// ─── 去重查询 ──────────────────────────────────────────────────────

/**
 * 检查指定链接是否已存在于飞书 Base 中。
 * 返回已存在的记录 ID（用于后续更新），如果不存在返回 null。
 */
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

    // 解析返回结果，查找匹配的 record_id
    const data = payload as Record<string, unknown>
    const items = extractRecordItems(data)
    if (items.length > 0 && items[0].record_id) {
      return items[0].record_id
    }
    return null
  } catch {
    // 查询失败时视为不存在，允许继续写入
    return null
  }
}

// ─── 写入/更新记录 ──────────────────────────────────────────────────

/**
 * 将内容素材记录写入飞书 Base。
 * 如果链接已存在则更新，否则创建新记录。
 */
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

    // 检查是否已存在
    const existingId = await findExistingRecord(record.原始链接, cfg)
    if (existingId) {
      // 更新现有记录
      const payload = await runCommand("+record-upsert", [
        "--base-token", cfg.baseToken,
        "--table-id", cfg.tableId,
        "--record-id", existingId,
        "--json", JSON.stringify(fields),
      ])
      return { ok: true, recordId: existingId }
    }

    // 创建新记录
    const payload = await runCommand("+record-upsert", [
      "--base-token", cfg.baseToken,
      "--table-id", cfg.tableId,
      "--json", JSON.stringify(fields),
    ])

    // 尝试从返回中提取 record_id
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

/**
 * 快速写入一条"待处理"状态的记录（用于先占位，后续异步处理完成后更新）。
 */
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

  // 兼容不同的返回结构
  const inner = data.data && typeof data.data === "object"
    ? data.data as Record<string, unknown>
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
