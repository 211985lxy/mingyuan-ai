#!/usr/bin/env node

import { execFileSync } from "node:child_process"
import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from "node:crypto"
import { chmod, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { dirname, join, resolve } from "node:path"

const SOURCES = new Set(["user", "admin", "aim", "agent_api", "repo_agent", "server"])
const CATEGORIES = new Set(["operation", "execution", "model_call", "repository_change", "deployment", "runtime"])
const SEVERITIES = new Set(["info", "warning", "error", "critical"])
const STATUSES = new Set(["started", "success", "failed"])
const DEFAULT_QUEUE_ROOT = join(homedir(), ".mingyuan-audit")
const INGEST_URL_FILE = join(DEFAULT_QUEUE_ROOT, "ingest.url")
const INGEST_SECRET_FILE = join(DEFAULT_QUEUE_ROOT, "ingest.secret")
const MAX_SUMMARY_LENGTH = 5000

function parseArgs(argv) {
  const [command, ...rest] = argv
  if (!command || !["start", "finish", "fail", "commit", "flush"].includes(command)) {
    throw new Error("用法：audit-event <start|finish|fail|commit|flush> [选项]")
  }
  const options = {}
  for (let index = 0; index < rest.length; index += 1) {
    const item = rest[index]
    if (!item.startsWith("--")) throw new Error(`未知参数：${item}`)
    const [rawKey, inlineValue] = item.slice(2).split("=", 2)
    const key = rawKey.replaceAll("-", "_")
    if (inlineValue !== undefined) {
      options[key] = inlineValue
      continue
    }
    const next = rest[index + 1]
    if (!next || next.startsWith("--")) {
      options[key] = true
      continue
    }
    options[key] = next
    index += 1
  }
  return { command, options }
}

function option(options, name, fallback = undefined) {
  const value = options[name]
  return value === undefined || value === true ? fallback : String(value)
}

function assertEnum(value, allowed, label) {
  if (!allowed.has(value)) throw new Error(`无效的 ${label}：${value}`)
  return value
}

function runGit(args, repoPath) {
  try {
    return execFileSync("git", ["-C", repoPath, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim()
  } catch {
    return ""
  }
}

function repositoryContext(options) {
  const requested = option(options, "repo_path")
  const cwd = requested ? resolve(requested) : process.cwd()
  const repositoryPath = runGit(["rev-parse", "--show-toplevel"], cwd)
  if (!repositoryPath) return { repositoryPath: cwd, gitSha: "" }
  return {
    repositoryPath,
    gitSha: option(options, "git_sha") || process.env.GIT_COMMIT || runGit(["rev-parse", "HEAD"], repositoryPath),
  }
}

function redactMetadata(value, depth = 0) {
  if (depth > 5) return "[truncated]"
  if (typeof value === "string") return value.length > 2000 ? `${value.slice(0, 1997)}...` : value
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => redactMetadata(item, depth + 1))
  if (!value || typeof value !== "object") return value
  const result = {}
  for (const [key, child] of Object.entries(value)) {
    if (/(?:token|secret|password|authorization|cookie|prompt|input|output|database.?url|api.?key|private.?key|email)/i.test(key)) continue
    if (child !== undefined && typeof child !== "function" && typeof child !== "symbol") result[key] = redactMetadata(child, depth + 1)
  }
  return result
}

function buildPayload(command, options) {
  const context = repositoryContext(options)
  const source = assertEnum(option(options, "source", process.env.AUDIT_SOURCE || "repo_agent"), SOURCES, "source")
  const commandDefaults = {
    start: { category: "execution", status: "started", severity: "info", action: "agent.start", summary: "Agent execution started" },
    finish: { category: "execution", status: "success", severity: "info", action: "agent.finish", summary: "Agent execution finished" },
    fail: { category: "execution", status: "failed", severity: "error", action: "agent.fail", summary: "Agent execution failed" },
    commit: { category: "repository_change", status: "success", severity: "info", action: "git.commit", summary: "Repository commit confirmed" },
  }[command]
  if (!commandDefaults) throw new Error("flush 不接收事件参数")

  const category = assertEnum(option(options, "category", commandDefaults.category), CATEGORIES, "category")
  const status = assertEnum(option(options, "status", commandDefaults.status), STATUSES, "status")
  const severity = assertEnum(option(options, "severity", commandDefaults.severity), SEVERITIES, "severity")
  const correlationId = option(options, "correlation_id") || process.env.AUDIT_CORRELATION_ID || randomUUID()
  const action = option(options, "action", commandDefaults.action).trim()
  const summary = option(options, "summary", commandDefaults.summary).trim()
  if (!action || action.length > 120) throw new Error("action 不能为空且不能超过 120 字符")
  if (!summary || summary.length > MAX_SUMMARY_LENGTH) throw new Error("summary 不能为空且不能超过 5000 字符")
  const idempotencyKey = option(options, "idempotency_key") || `${source}:${action}:${correlationId}:${context.gitSha || context.repositoryPath}`
  let metadata = {}
  const metadataJson = option(options, "metadata")
  if (metadataJson) {
    try {
      metadata = JSON.parse(metadataJson)
    } catch {
      throw new Error("metadata 必须是有效 JSON")
    }
  }
  metadata = redactMetadata({
    ...metadata,
    adapter: option(options, "tool") || process.env.AUDIT_TOOL_NAME || "shared-audit-cli",
    repositoryPath: context.repositoryPath,
    declaration: command !== "commit",
    confirmation: command === "commit" ? "git-sha" : "agent-declaration",
  })

  const payload = {
    source,
    category,
    severity,
    status,
    action,
    summary,
    actorType: option(options, "actor_type") || process.env.AUDIT_ACTOR_TYPE || "agent",
    targetType: option(options, "target_type") || "repository",
    targetId: option(options, "target_id"),
    projectId: option(options, "project_id") || process.env.AUDIT_PROJECT_ID,
    environment: option(options, "environment") || process.env.AUDIT_ENVIRONMENT || process.env.NODE_ENV || "development",
    correlationId,
    requestId: option(options, "request_id"),
    traceId: option(options, "trace_id"),
    gitSha: context.gitSha || undefined,
    idempotencyKey,
    metadata,
    externalLogUrl: option(options, "external_log_url"),
  }
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function queueDirectory() {
  return resolve(process.env.AUDIT_QUEUE_DIR || join(DEFAULT_QUEUE_ROOT, "queue"))
}

async function ensureQueueDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await chmod(directory, 0o700)
}

function parseQueueKey(raw) {
  if (!raw) return null
  if (/^[a-f0-9]{64}$/i.test(raw)) return Buffer.from(raw, "hex")
  const decoded = Buffer.from(raw, "base64")
  return decoded.length === 32 ? decoded : null
}

async function loadQueueKey(directory) {
  const configuredRaw = process.env.AUDIT_LOCAL_QUEUE_KEY
  const configured = parseQueueKey(configuredRaw)
  if (configuredRaw && !configured) throw new Error("AUDIT_LOCAL_QUEUE_KEY 必须是 32 字节 hex 或 base64")
  if (configured) return configured
  const keyPath = join(dirname(directory), "queue.key")
  try {
    const existing = await readFile(keyPath)
    if (existing.length !== 32) throw new Error("本地审计队列密钥长度无效")
    await chmod(keyPath, 0o600)
    return existing
  } catch (error) {
    if (error?.code !== "ENOENT") throw error
    const generated = randomBytes(32)
    await mkdir(dirname(keyPath), { recursive: true, mode: 0o700 })
    try {
      await writeFile(keyPath, generated, { flag: "wx", mode: 0o600 })
      await chmod(keyPath, 0o600)
      return generated
    } catch (writeError) {
      if (writeError?.code !== "EEXIST") throw writeError
      const existing = await readFile(keyPath)
      if (existing.length !== 32) throw new Error("本地审计队列密钥长度无效")
      return existing
    }
  }
}

function encryptPayload(payload, key) {
  const iv = randomBytes(12)
  const cipher = createCipheriv("aes-256-gcm", key, iv)
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()])
  return JSON.stringify({
    version: 1,
    algorithm: "aes-256-gcm",
    createdAt: new Date().toISOString(),
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  })
}

function decryptPayload(serialized, key) {
  const envelope = JSON.parse(serialized)
  if (envelope?.version !== 1 || envelope.algorithm !== "aes-256-gcm") throw new Error("审计队列版本不受支持")
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(envelope.iv, "base64url"))
  decipher.setAuthTag(Buffer.from(envelope.tag, "base64url"))
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext, "base64url")), decipher.final()]).toString("utf8"))
}

async function enqueuePayload(payload, directory = queueDirectory()) {
  await ensureQueueDirectory(directory)
  const key = await loadQueueKey(directory)
  const fileName = `${Date.now()}-${randomUUID()}.json`
  const temporary = join(directory, `.${fileName}.tmp`)
  const destination = join(directory, fileName)
  await writeFile(temporary, encryptPayload(payload, key), { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, destination)
  return destination
}

function signature(body, timestamp, secret) {
  return createHmac("sha256", secret).update(`${timestamp}.${body}`).digest("hex")
}

async function readConfigValue(environmentName, filePath) {
  const configured = process.env[environmentName]?.trim()
  if (configured) return configured
  try {
    return (await readFile(filePath, "utf8")).trim()
  } catch (error) {
    if (error?.code === "ENOENT") return ""
    throw error
  }
}

async function postPayload(payload, url, secret) {
  const ingestUrl = url || await readConfigValue("AUDIT_INGEST_URL", INGEST_URL_FILE)
  const ingestSecret = secret || await readConfigValue("AUDIT_INGEST_SECRET", INGEST_SECRET_FILE)
  if (!ingestUrl || !ingestSecret) throw new Error("audit ingestion is not configured")
  const body = JSON.stringify(payload)
  const timestamp = Math.floor(Date.now() / 1000)
  const response = await fetch(ingestUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-audit-timestamp": String(timestamp),
      "x-audit-signature": signature(body, timestamp, ingestSecret),
    },
    body,
    signal: AbortSignal.timeout(Number(process.env.AUDIT_HTTP_TIMEOUT_MS || 5000)),
  })
  if (!response.ok) throw new Error(`audit ingestion returned ${response.status}`)
}

async function submitPayload(payload) {
  try {
    await postPayload(payload)
    return { transport: "remote" }
  } catch (error) {
    const path = await enqueuePayload(payload)
    return { transport: "queued", path, reason: error instanceof Error ? error.message : "send failed" }
  }
}

function backoffDelay(attempt, base) {
  return Math.min(10_000, base * 2 ** Math.max(0, attempt - 1))
}

async function flushQueue(options) {
  const directory = queueDirectory()
  await ensureQueueDirectory(directory)
  const key = await loadQueueKey(directory)
  const names = (await readdir(directory)).filter((name) => name.endsWith(".json")).sort()
  const limit = Math.min(100, Math.max(1, Number(option(options, "limit", "20"))))
  const maxAttempts = Math.min(5, Math.max(1, Number(option(options, "max_attempts", "3"))))
  const baseBackoff = Math.max(0, Number(option(options, "backoff_ms", process.env.AUDIT_RETRY_BACKOFF_MS || "500")))
  let sent = 0
  let failed = 0
  for (const name of names.slice(0, limit)) {
    const filePath = join(directory, name)
    let payload
    try {
      payload = decryptPayload(await readFile(filePath, "utf8"), key)
    } catch (error) {
      failed += 1
      console.error(`审计队列文件无法读取，已保留：${name}（${error instanceof Error ? error.message : "格式错误"}）`)
      continue
    }
    let delivered = false
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await postPayload(payload)
        delivered = true
        break
      } catch (error) {
        if (attempt < maxAttempts && baseBackoff > 0) await new Promise((resolvePromise) => setTimeout(resolvePromise, backoffDelay(attempt, baseBackoff)))
      }
    }
    if (delivered) {
      await rm(filePath)
      sent += 1
    } else {
      failed += 1
    }
  }
  return { sent, failed, pending: Math.max(0, names.length - sent) }
}

export { buildPayload, decryptPayload, enqueuePayload, encryptPayload, flushQueue, postPayload, queueDirectory, submitPayload }

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const { command, options } = parseArgs(process.argv.slice(2))
    if (command === "flush") {
      const result = await flushQueue(options)
      console.log(`audit queue flushed: sent=${result.sent} failed=${result.failed} pending=${result.pending}`)
    } else {
      const payload = buildPayload(command, options)
      const result = await submitPayload(payload)
      console.log(`audit event ${result.transport}: action=${payload.action} correlationId=${payload.correlationId}`)
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : "audit event failed")
    process.exitCode = 2
  }
}
