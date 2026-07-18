import { readFileSync } from "node:fs"
import { join } from "node:path"

/**
 * 发布事实（release facts）——回答「线上现在跑的到底是哪个 Git 提交」。
 *
 * 事实来源优先级：
 *   1. 发布包内的 release-manifest.json（standalone 构建产物，由发布脚本写入）
 *   2. 环境变量 RELEASE_SHA / RELEASE_BUILD_TIME / RELEASE_VERSION
 *   3. "unknown"（本地开发或未发布产物）
 *
 * /api/healthz 只暴露非敏感字段：releaseSha / buildTime / version /
 * feishuReady / proxyReady。绝不暴露密钥、Base Token、表 ID 或客户数据。
 */

export interface ReleaseFacts {
  releaseSha: string
  buildTime: string
  version: string
}

const UNKNOWN = "unknown"

/** 发布清单允许出现字段的超集；读取时只取这三个键。 */
export interface ReleaseManifest {
  releaseSha?: unknown
  buildTime?: unknown
  version?: unknown
  generatedAt?: unknown
}

/** 解析发布清单对象；非法输入返回 null（纯函数，便于测试）。 */
export function parseReleaseManifest(input: unknown): ReleaseManifest | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as ReleaseManifest
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

/** 合成发布事实：清单优先，环境变量兜底（纯函数，便于测试）。 */
export function resolveReleaseFacts(
  manifest: ReleaseManifest | null,
  env: Record<string, string | undefined>,
): ReleaseFacts {
  return {
    releaseSha: nonEmpty(manifest?.releaseSha) ?? nonEmpty(env.RELEASE_SHA) ?? UNKNOWN,
    buildTime: nonEmpty(manifest?.buildTime) ?? nonEmpty(env.RELEASE_BUILD_TIME) ?? UNKNOWN,
    version:
      nonEmpty(manifest?.version) ??
      nonEmpty(env.RELEASE_VERSION) ??
      nonEmpty(env.npm_package_version) ??
      UNKNOWN,
  }
}

/** 阶段 1.1：飞书经营事项在生产运行所需的全部环境变量。 */
export const FEISHU_WORK_ITEM_REQUIRED_ENV = [
  "LARK_BASE_TOKEN",
  "LARK_WORK_ITEM_TABLE_ID",
  "LARK_CLI_PATH",
  "AIM_WORK_ITEM_API_SECRET",
  "AIM_WORK_ITEM_OWNER_USER_ID",
] as const

/** 飞书经营事项执行环境是否就绪（只看存在性，不泄露取值）。 */
export function computeFeishuWorkItemReady(
  env: Record<string, string | undefined>,
): boolean {
  return FEISHU_WORK_ITEM_REQUIRED_ENV.every((name) => nonEmpty(env[name]) !== undefined)
}

/** 海外模型代理（Xray）是否已配置服务器端出口（只看存在性）。 */
export function computeProxyReady(env: Record<string, string | undefined>): boolean {
  return nonEmpty(env.APIMART_PROXY_URL) !== undefined
}

let cachedFacts: ReleaseFacts | null = null

function readManifestFromDisk(): ReleaseManifest | null {
  try {
    const raw = readFileSync(join(process.cwd(), "release-manifest.json"), "utf8")
    return parseReleaseManifest(JSON.parse(raw))
  } catch {
    return null
  }
}

/** 读取当前进程的发布事实（带缓存；本地开发返回 unknown）。 */
export function getReleaseFacts(): ReleaseFacts {
  if (!cachedFacts) {
    cachedFacts = resolveReleaseFacts(readManifestFromDisk(), process.env)
  }
  return cachedFacts
}
