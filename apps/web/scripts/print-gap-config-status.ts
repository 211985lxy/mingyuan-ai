/**
 * 打印缺口升级相关配置状态（不输出密钥内容）。
 *
 * Usage:
 *   pnpm --dir apps/web exec tsx scripts/print-gap-config-status.ts
 */

import { readFileSync, existsSync } from "node:fs"
import { resolve } from "node:path"

function loadEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {}
  const out: Record<string, string> = {}
  for (const raw of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith("#")) continue
    const eq = line.indexOf("=")
    if (eq < 0) continue
    const key = line.slice(0, eq).trim()
    let value = line.slice(eq + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

function present(value: string | undefined): boolean {
  return Boolean(value && value.trim())
}

function flag(value: string | undefined): string {
  if (!present(value)) return "未设置"
  return value!.trim()
}

function main() {
  const envPath = resolve(process.cwd(), ".env.local")
  const env = { ...process.env, ...loadEnvFile(envPath) } as Record<string, string>

  const rows: Array<[string, string, string]> = [
    ["销售Loop总开关", "AIM_BUSINESS_LOOPS_ENABLED", flag(env.AIM_BUSINESS_LOOPS_ENABLED)],
    ["销售Loop影子", "AIM_LOOP_SHADOW_MODE", flag(env.AIM_LOOP_SHADOW_MODE)],
    ["销售Loop模式", "AIM_LOOP_OPERATING_MODE", flag(env.AIM_LOOP_OPERATING_MODE)],
    ["试点项目", "AIM_LOOP_PILOT_PROJECT_IDS", present(env.AIM_LOOP_PILOT_PROJECT_IDS) ? "已填" : "缺"],
    ["监督通知", "AIM_LOOP_NOTIFICATIONS_ENABLED", flag(env.AIM_LOOP_NOTIFICATIONS_ENABLED)],
    ["监督群", "AIM_SUPERVISOR_CHAT_ID", present(env.AIM_SUPERVISOR_CHAT_ID) ? "已填" : "缺（正式自动建议填）"],
    ["负责人", "AIM_WORK_ITEM_OWNER_USER_ID", present(env.AIM_WORK_ITEM_OWNER_USER_ID) ? "已填" : "缺"],
    ["飞书表Token", "LARK_BASE_TOKEN", present(env.LARK_BASE_TOKEN) ? "已填" : "缺"],
    ["经营事项表", "LARK_WORK_ITEM_TABLE_ID", present(env.LARK_WORK_ITEM_TABLE_ID) ? "已填" : "缺"],
    ["经营归因表", "LARK_BUSINESS_ATTRIBUTION_TABLE_ID", present(env.LARK_BUSINESS_ATTRIBUTION_TABLE_ID) ? "已填" : "缺"],
    ["客户结果表", "LARK_CUSTOMER_OUTCOME_TABLE_ID", present(env.LARK_CUSTOMER_OUTCOME_TABLE_ID) ? "已填" : "缺"],
    ["先查再写", "AIM_BOUNDED_TOOL_LOOP_ENABLED", flag(env.AIM_BOUNDED_TOOL_LOOP_ENABLED)],
    ["Skill手册", "AIM_SKILL_LOADING_ENABLED", flag(env.AIM_SKILL_LOADING_ENABLED || "true(默认)")],
    ["群聊管道", "INSPIRATION_PIPELINE_ENABLED", flag(env.INSPIRATION_PIPELINE_ENABLED)],
    ["群聊影子", "INSPIRATION_PIPELINE_SHADOW_MODE", flag(env.INSPIRATION_PIPELINE_SHADOW_MODE)],
    ["群聊档位", "INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE", flag(env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE)],
    ["后台任务", "BACKGROUND_TASKS_ENABLED", flag(env.BACKGROUND_TASKS_ENABLED)],
    ["飞书群入口", "FEISHU_TOPIC_PIPELINE_ENABLED", flag(env.FEISHU_TOPIC_PIPELINE_ENABLED)],
    ["Cron密钥", "CRON_SECRET", present(env.CRON_SECRET) ? "已填" : "缺"],
  ]

  console.log(`配置文件: ${existsSync(envPath) ? envPath : "（无 .env.local，仅读进程环境）"}`)
  console.log("")
  for (const [label, key, value] of rows) {
    console.log(`${label.padEnd(12)} ${key.padEnd(42)} ${value}`)
  }

  const loopLive =
    env.AIM_BUSINESS_LOOPS_ENABLED === "true" &&
    env.AIM_LOOP_SHADOW_MODE === "false" &&
    (env.AIM_LOOP_OPERATING_MODE === "supervised_auto" || env.AIM_LOOP_OPERATING_MODE === "assisted")

  console.log("")
  console.log("当前解读：")
  console.log(
    `- 销售 Loop：${
      env.AIM_BUSINESS_LOOPS_ENABLED !== "true"
        ? "关闭"
        : env.AIM_LOOP_SHADOW_MODE !== "false"
          ? "已开但影子（不写飞书/不通知）"
          : loopLive
            ? `正式写入（${env.AIM_LOOP_OPERATING_MODE}）`
            : "配置异常"
    }`,
  )
  console.log(
    `- 先查再写：${env.AIM_BOUNDED_TOOL_LOOP_ENABLED === "true" ? "已开" : "关闭"}`,
  )
  console.log(
    `- 群聊选题：${
      env.INSPIRATION_PIPELINE_ENABLED === "false"
        ? "关闭"
        : env.INSPIRATION_PIPELINE_SHADOW_MODE === "true" ||
            !env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE ||
            env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE === "capture_only"
          ? "影子/采集（不回群）"
          : env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE === "live"
            ? "正式回群"
            : env.INSPIRATION_PIPELINE_EXECUTION_MODE_OVERRIDE
    }`,
  )
  console.log("")
  console.log("下一步手册：docs/runbooks/gap-config-howto.md")
}

main()
