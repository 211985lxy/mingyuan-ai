/**
 * preflight:env —— 演示/开发前环境门禁。
 *
 *   1. pnpm dev:sanity   迁移账本 + 关键列 + 绑定三查（失败阻断）
 *   2. pnpm llm:probe -- --route business_diagnosis --task generation
 *      （失败不阻断：第三方瞬态故障常见，只打黄字警告）
 *
 * Usage: pnpm --dir apps/web preflight:env
 */
import { spawnSync } from "node:child_process"

import { resolvePreflightEnvExit } from "../src/lib/preflight-env-policy"

function runPnpm(args: string[]) {
  const result = spawnSync("pnpm", args, { stdio: "inherit", cwd: process.cwd() })
  return result.status === 0
}

const sanityOk = runPnpm(["dev:sanity"])
const probeOk = sanityOk
  ? runPnpm(["llm:probe", "--", "--route", "business_diagnosis", "--task", "generation"])
  : true
const verdict = resolvePreflightEnvExit({ sanityOk, probeOk })

if (!sanityOk) {
  console.error("[preflight:env] sanity 失败，已中止。先修迁移账本/关键列/项目绑定。")
} else if (verdict.warnProbe) {
  console.warn("[preflight:env] generation 探针失败（不阻断）。第三方瞬态故障常见，演示前请再跑一次 pnpm llm:probe。")
} else {
  console.info("[preflight:env] 环境检查通过。")
}

process.exit(verdict.exitCode)
