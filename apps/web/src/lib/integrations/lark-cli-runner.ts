/**
 * 统一飞书 CLI 能力网关（WP-1）。
 *
 * 将现有 Base 调用能力扩展为统一、受控的飞书能力网关：
 * - domain + command 双重白名单
 * - 底层统一 execFile（不用 exec/shell）
 * - 统一超时、最大输出、JSON 解析和错误分类
 * - 日志自动脱敏
 * - 支持注入 runner 做单测
 * - 禁止向前端暴露 CLI
 * - 禁止把任意用户输入直接拼成 CLI 参数
 */
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

// ─── 类型 ────────────────────────────────────────────────────────────────────

/** 飞书 CLI 域（一级命令）。 */
export type LarkDomain = "base" | "docs" | "sheets" | "drive" | "calendar" | "task"

/** CLI 执行原始结果。 */
export type LarkCliRawResult = { stdout: string; stderr: string }

/** 可注入的 CLI 执行器（测试替身端口）。 */
export type LarkCliRunner = (file: string, args: string[]) => Promise<LarkCliRawResult>

/** 错误分类码。 */
export type LarkCliErrorCode =
  | "COMMAND_NOT_ALLOWED"
  | "DOMAIN_NOT_ALLOWED"
  | "CLI_PATH_MISSING"
  | "TIMEOUT"
  | "INVALID_JSON"
  | "PERMISSION_DENIED"
  | "EXECUTION_FAILED"

/** 结构化 CLI 错误。 */
export class LarkCliError extends Error {
  readonly code: LarkCliErrorCode
  readonly domain?: LarkDomain
  readonly command?: string
  readonly stderr?: string

  constructor(opts: {
    code: LarkCliErrorCode
    message: string
    domain?: LarkDomain
    command?: string
    stderr?: string
  }) {
    super(opts.message)
    this.name = "LarkCliError"
    this.code = opts.code
    this.domain = opts.domain
    this.command = opts.command
    this.stderr = opts.stderr
  }
}

// ─── 白名单 ──────────────────────────────────────────────────────────────────

const DOMAIN_WHITELIST: Set<LarkDomain> = new Set(["base", "docs", "sheets", "drive", "calendar", "task"])

const COMMAND_WHITELIST: Record<LarkDomain, Set<string>> = {
  base: new Set([
    "+table-get",
    "+field-list",
    "+record-list",
    "+record-get",
    "+record-upsert",
    "+record-upload-attachment",
  ]),
  docs: new Set([
    "+create",
    "+update",
    "+fetch",
    "+search",
  ]),
  sheets: new Set([
    "+create",
    "+write",
    "+append",
    "+read",
  ]),
  drive: new Set([
    "+upload",
    "+list",
    "+metadata",
    "+permission-add",
  ]),
  calendar: new Set([
    "+create",
    "+agenda",
    "+freebusy",
    "+suggestion",
  ]),
  task: new Set([
    "+create",
    "+get-my-tasks",
    "+update",
    "+assign",
    "+comment",
    "+complete",
    "+reminder",
  ]),
}

// ─── 脱敏 ────────────────────────────────────────────────────────────────────

/**
 * 日志脱敏：移除密钥、token、Authorization 头等敏感信息。
 * 对齐 feishu-supervisor-notifier.ts 的 sanitizeSupervisorText 模式。
 */
export function sanitizeCliLog(value: string): string {
  return value
    .replace(/authorization\s*[:=]\s*bearer\s+\S+/gi, "Authorization: [REDACTED]")
    .replace(/\b(api[_-]?key|token|secret|password|app_secret)\s*[:=]\s*\S+/gi, "$1=[REDACTED]")
    .replace(/\bsk-[a-z0-9_-]{8,}\b/gi, "[REDACTED]")
    .replace(/\bt-[a-zA-Z0-9]{20,}\b/g, "[TOKEN_REDACTED]")
    .slice(0, 1000)
}

// ─── 配置 ────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 30_000
const DEFAULT_MAX_BUFFER = 10 * 1024 * 1024 // 10MB

export interface RunLarkCliCommandOptions {
  /** 飞书 CLI 域。 */
  domain: LarkDomain
  /** Shortcut 命令（如 +create、+record-list）。 */
  command: string
  /** 命令参数列表（已经过调用方校验，不含任意用户输入）。 */
  args: string[]
  /** 飞书身份：user 或 bot。 */
  identity?: "user" | "bot"
  /** 超时毫秒数，默认 30s。 */
  timeoutMs?: number
  /** 最大输出缓冲，默认 10MB。 */
  maxBuffer?: number
  /** 可注入的 CLI 执行器（测试用）。 */
  runner?: LarkCliRunner
  /** lark-cli 可执行文件路径（不传则从环境变量读取）。 */
  cliPath?: string
  /** 环境变量来源（默认 process.env）。 */
  env?: Record<string, string | undefined>
}

// ─── 核心执行 ────────────────────────────────────────────────────────────────

function requireCliPath(opts: RunLarkCliCommandOptions): string {
  if (opts.cliPath?.trim()) return opts.cliPath.trim()
  if (opts.runner) return "/mock/lark-cli"
  const envPath = (opts.env ?? process.env).LARK_CLI_PATH?.trim()
  if (!envPath) {
    throw new LarkCliError({
      code: "CLI_PATH_MISSING",
      message: "缺少 LARK_CLI_PATH：请在环境变量中配置 lark-cli 可执行文件的绝对路径",
    })
  }
  return envPath
}

/**
 * 执行飞书 CLI 命令（统一网关入口）。
 *
 * 安全约束：
 * - domain 和 command 双重白名单，非白名单 fail-closed
 * - 底层 execFile，不经过 shell
 * - 超时和输出限制
 * - JSON 解析失败分类报错
 * - 日志自动脱敏
 */
export async function runLarkCliCommand(opts: RunLarkCliCommandOptions): Promise<unknown> {
  // 1. 域白名单校验
  if (!DOMAIN_WHITELIST.has(opts.domain)) {
    throw new LarkCliError({
      code: "DOMAIN_NOT_ALLOWED",
      message: `不允许执行飞书 CLI 域：${opts.domain}`,
      domain: opts.domain,
    })
  }

  // 2. 命令白名单校验
  const allowedCommands = COMMAND_WHITELIST[opts.domain]
  if (!allowedCommands.has(opts.command)) {
    throw new LarkCliError({
      code: "COMMAND_NOT_ALLOWED",
      message: `不允许执行飞书 ${opts.domain} 命令：${opts.command}`,
      domain: opts.domain,
      command: opts.command,
    })
  }

  // 3. CLI 路径
  const cliPath = requireCliPath(opts)

  // 4. 构造参数
  const identityArgs = opts.identity ? ["--as", opts.identity] : []
  const fullArgs = [opts.domain, opts.command, ...opts.args, ...identityArgs, "--format", "json"]

  // 5. 执行
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBuffer = opts.maxBuffer ?? DEFAULT_MAX_BUFFER
  const runner: LarkCliRunner = opts.runner ??
    ((file, argv) => execFileAsync(file, argv, { timeout: timeoutMs, maxBuffer }))

  let raw: LarkCliRawResult
  try {
    raw = await runner(cliPath, fullArgs)
  } catch (err: unknown) {
    const error = err as { killed?: boolean; code?: string; message?: string; stderr?: string }
    // 超时判定
    if (error.killed || error.code === "ERR_CHILD_PROCESS_TIMEOUT") {
      throw new LarkCliError({
        code: "TIMEOUT",
        message: `飞书 ${opts.domain} ${opts.command} 执行超时（${timeoutMs}ms）`,
        domain: opts.domain,
        command: opts.command,
        stderr: sanitizeCliLog(error.stderr ?? ""),
      })
    }
    // 权限失败
    const stderr = error.stderr ?? ""
    if (/permission denied|forbidden|403/i.test(stderr) || /permission denied|forbidden|403/i.test(error.message ?? "")) {
      throw new LarkCliError({
        code: "PERMISSION_DENIED",
        message: `飞书 ${opts.domain} ${opts.command} 权限不足：${sanitizeCliLog(stderr || error.message || "")}`,
        domain: opts.domain,
        command: opts.command,
        stderr: sanitizeCliLog(stderr),
      })
    }
    // 通用执行失败
    throw new LarkCliError({
      code: "EXECUTION_FAILED",
      message: `飞书 ${opts.domain} ${opts.command} 执行失败：${sanitizeCliLog(error.message ?? String(err))}`,
      domain: opts.domain,
      command: opts.command,
      stderr: sanitizeCliLog(stderr),
    })
  }

  // 6. JSON 解析
  const text = raw.stdout.trim()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw new LarkCliError({
      code: "INVALID_JSON",
      message: `飞书 ${opts.domain} ${opts.command} 返回非法 JSON（前 200 字符）：${sanitizeCliLog(text.slice(0, 200))}`,
      domain: opts.domain,
      command: opts.command,
      stderr: sanitizeCliLog(raw.stderr),
    })
  }
}

// ─── 辅助：白名单查询（供外部校验或文档生成） ─────────────────────────────────

export function isDomainAllowed(domain: string): domain is LarkDomain {
  return DOMAIN_WHITELIST.has(domain as LarkDomain)
}

export function isCommandAllowed(domain: LarkDomain, command: string): boolean {
  return COMMAND_WHITELIST[domain]?.has(command) ?? false
}

export function getAllowedCommands(domain: LarkDomain): string[] {
  return [...(COMMAND_WHITELIST[domain] ?? [])]
}
