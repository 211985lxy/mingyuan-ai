#!/usr/bin/env node
/**
 * WP-0 飞书资源只读核对脚本。
 *
 * 用途：在实施飞书资产落地前，验证 Bot 身份、资源可达性和读写能力。
 * 所有操作均为只读或创建测试资产（验证后手动清理），不修改生产数据。
 *
 * 前置条件：
 *   - 环境变量 LARK_CLI_PATH 指向 lark-cli 可执行文件
 *   - 环境变量 LARK_BASE_TOKEN / LARK_WORK_ITEM_TABLE_ID 已配置
 *   - 可选：LARK_ASSET_ROOT_FOLDER_TOKEN（资产根目录）
 *
 * 用法：
 *   node scripts/verify-feishu-assets.mjs
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"
import { writeFileSync, mkdirSync } from "node:fs"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"

const execFileAsync = promisify(execFile)
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, "..")

const CLI_PATH = process.env.LARK_CLI_PATH?.trim()
if (!CLI_PATH) {
  console.error("❌ 缺少 LARK_CLI_PATH 环境变量")
  process.exit(1)
}

const results = []
const timestamp = new Date().toISOString()

async function run(description, args, { expectSuccess = true } = {}) {
  console.log(`\n▶ ${description}`)
  console.log(`  命令: lark-cli ${args.join(" ")}`)
  try {
    const { stdout, stderr } = await execFileAsync(CLI_PATH, args, {
      timeout: 30_000,
      maxBuffer: 10 * 1024 * 1024,
    })
    const text = stdout.trim()
    let parsed = null
    try {
      parsed = text ? JSON.parse(text) : {}
    } catch {
      parsed = { raw: text.slice(0, 500) }
    }
    const entry = { description, ok: true, args, parsed, stderr: stderr.slice(0, 200) }
    results.push(entry)
    console.log(`  ✅ 成功`)
    return parsed
  } catch (err) {
    const entry = {
      description,
      ok: false,
      args,
      error: err.message?.slice(0, 500),
      stderr: err.stderr?.slice(0, 200) || "",
    }
    results.push(entry)
    if (expectSuccess) {
      console.log(`  ❌ 失败: ${err.message?.slice(0, 120)}`)
    } else {
      console.log(`  ⚠️ 预期内失败: ${err.message?.slice(0, 120)}`)
    }
    return null
  }
}

async function main() {
  console.log("=== 飞书资产落地 WP-0 资源核对 ===")
  console.log(`时间: ${timestamp}`)
  console.log(`CLI: ${CLI_PATH}`)

  // 1. lark-cli 版本
  await run("lark-cli 版本", ["--version"])

  // 2. 经营事项表字段核对
  const baseToken = process.env.LARK_BASE_TOKEN?.trim()
  const workItemTableId = process.env.LARK_WORK_ITEM_TABLE_ID?.trim()
  if (baseToken && workItemTableId) {
    await run("经营事项表字段列表", [
      "base", "+field-list",
      "--base-token", baseToken,
      "--table-id", workItemTableId,
      "--limit", "100",
      "--format", "json",
    ])
  } else {
    console.log("\n⚠️ 跳过经营事项表核对（缺少 LARK_BASE_TOKEN 或 LARK_WORK_ITEM_TABLE_ID）")
  }

  // 3. 资产根目录
  const assetRoot = process.env.LARK_ASSET_ROOT_FOLDER_TOKEN?.trim()
  if (assetRoot) {
    await run("资产根目录文件列表", [
      "drive", "+list",
      "--folder-token", assetRoot,
      "--format", "json",
    ])
  } else {
    console.log("\n⚠️ 跳过资产根目录核对（缺少 LARK_ASSET_ROOT_FOLDER_TOKEN）")
  }

  // 4. 内容日历表
  const contentTableId = process.env.LARK_CONTENT_TABLE_ID?.trim()
  if (baseToken && contentTableId) {
    await run("内容日历表字段列表", [
      "base", "+field-list",
      "--base-token", baseToken,
      "--table-id", contentTableId,
      "--limit", "100",
      "--format", "json",
    ])
  }

  // 5. 竞品分析表
  const competitorTableId = process.env.LARK_COMPETITOR_TABLE_ID?.trim()
  if (baseToken && competitorTableId) {
    await run("竞品分析表字段列表", [
      "base", "+field-list",
      "--base-token", baseToken,
      "--table-id", competitorTableId,
      "--limit", "100",
      "--format", "json",
    ])
  }

  // 6. 交付任务表
  const deliveryTableId = process.env.LARK_DELIVERY_TABLE_ID?.trim()
  if (baseToken && deliveryTableId) {
    await run("交付任务表字段列表", [
      "base", "+field-list",
      "--base-token", baseToken,
      "--table-id", deliveryTableId,
      "--limit", "100",
      "--format", "json",
    ])
  }

  // 7. Bot 身份验证（创建测试文档 → 回读 → 记录 token）
  console.log("\n--- Bot 读写能力验证 ---")
  const testTitle = `AIM-WP0-验证-${Date.now()}`
  const createResult = await run("创建测试文档", [
    "docs", "+create",
    "--title", testTitle,
    "--content", "# WP-0 验证\n\n此文档由 verify-feishu-assets.mjs 自动创建，验证后可删除。",
    "--format", "json",
  ])

  if (createResult) {
    const docToken = createResult.token || createResult.document?.document_id || createResult.data?.token
    if (docToken) {
      await run("回读测试文档", [
        "docs", "+fetch",
        "--document-id", docToken,
        "--format", "json",
      ])
      console.log(`\n  📄 测试文档 token: ${docToken}（验证后请手动删除）`)
    }
  }

  // 输出结果
  const outputDir = join(ROOT, "output")
  mkdirSync(outputDir, { recursive: true })
  const dateStr = new Date().toISOString().slice(0, 10)
  const outputPath = join(outputDir, `feishu-verification-${dateStr}.json`)
  writeFileSync(outputPath, JSON.stringify({ timestamp, results }, null, 2), "utf-8")

  const passed = results.filter((r) => r.ok).length
  const failed = results.filter((r) => !r.ok).length
  console.log(`\n=== 核对完成 ===`)
  console.log(`通过: ${passed}  失败: ${failed}`)
  console.log(`证据已保存: ${outputPath}`)

  if (failed > 0) {
    console.log("\n⚠️ 存在失败项，请检查 Bot 权限和网络连通性。")
    process.exit(1)
  }
}

main().catch((err) => {
  console.error("脚本执行异常:", err)
  process.exit(1)
})
