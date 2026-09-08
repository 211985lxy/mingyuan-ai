import assert from "node:assert/strict"
import { execFile } from "node:child_process"
import { randomBytes } from "node:crypto"
import { mkdtemp, readdir, readFile, stat } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { fileURLToPath } from "node:url"
import { promisify } from "node:util"
import { afterEach, beforeEach, describe, test } from "node:test"

import { buildPayload, decryptPayload, enqueuePayload, flushQueue } from "./audit-event.mjs"

const originalEnv = {}
const execFileAsync = promisify(execFile)
const cliPath = fileURLToPath(new URL("./audit-event.mjs", import.meta.url))
let queueDir

beforeEach(async () => {
  queueDir = await mkdtemp(join(tmpdir(), "mingyuan-audit-test-"))
  for (const key of ["AUDIT_QUEUE_DIR", "AUDIT_LOCAL_QUEUE_KEY", "AUDIT_INGEST_URL", "AUDIT_INGEST_SECRET", "AUDIT_RETRY_BACKOFF_MS"]) {
    originalEnv[key] = process.env[key]
    delete process.env[key]
  }
  process.env.AUDIT_QUEUE_DIR = queueDir
  process.env.AUDIT_LOCAL_QUEUE_KEY = randomBytes(32).toString("hex")
})

afterEach(() => {
  for (const [key, value] of Object.entries(originalEnv)) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
  delete globalThis.fetch
})

describe("audit-event adapter", () => {
  test("runs the CLI entrypoint from a URL-encoded workspace path", async () => {
    const { stdout, stderr } = await execFileAsync(process.execPath, [cliPath, "flush"], {
      cwd: process.cwd(),
      env: { ...process.env },
    })

    assert.match(stdout, /audit queue flushed: sent=0 failed=0 pending=0/)
    assert.equal(stderr, "")
  })

  test("builds stable Git-confirmed payloads without raw prompt data", () => {
    const first = buildPayload("commit", { repo_path: process.cwd(), correlation_id: "corr-1" })
    const second = buildPayload("commit", { repo_path: process.cwd(), correlation_id: "corr-1" })

    assert.equal(first.category, "repository_change")
    assert.equal(first.status, "success")
    assert.match(first.gitSha, /^[a-f0-9]{40}$/)
    assert.equal(first.metadata.declaration, false)
    assert.deepEqual(first, second)
  })

  test("does not let callers override Git-confirmed SHA provenance", () => {
    const payload = buildPayload("commit", {
      repo_path: process.cwd(),
      correlation_id: "corr-forged",
      git_sha: "caller-chosen-sha",
    })

    assert.notEqual(payload.gitSha, "caller-chosen-sha")
    assert.match(payload.gitSha, /^[a-f0-9]{40}$/)
  })

  test("writes encrypted queue records atomically with owner-only permissions", async () => {
    const payload = buildPayload("start", { repo_path: process.cwd(), correlation_id: "corr-queue", summary: "safe event" })
    const filePath = await enqueuePayload(payload, queueDir)
    const fileStat = await stat(filePath)
    const serialized = await readFile(filePath, "utf8")

    assert.equal(fileStat.mode & 0o777, 0o600)
    assert.equal(serialized.includes("safe event"), false)
    assert.deepEqual(decryptPayload(serialized, Buffer.from(process.env.AUDIT_LOCAL_QUEUE_KEY, "hex")), payload)
  })

  test("retries queued delivery and removes only the confirmed event", async () => {
    const payload = buildPayload("finish", { repo_path: process.cwd(), correlation_id: "corr-retry", git_sha: "sha-2" })
    await enqueuePayload(payload, queueDir)
    process.env.AUDIT_INGEST_URL = "https://example.test/api/internal/audit-events"
    process.env.AUDIT_INGEST_SECRET = "a".repeat(32)
    let calls = 0
    globalThis.fetch = async () => {
      calls += 1
      return { ok: calls === 3, status: calls === 3 ? 202 : 503 }
    }

    const result = await flushQueue({ limit: "20", max_attempts: "3", backoff_ms: "0" })
    const remaining = (await readdir(queueDir)).filter((name) => name.endsWith(".json"))

    assert.deepEqual(result, { sent: 1, failed: 0, pending: 0 })
    assert.equal(calls, 3)
    assert.deepEqual(remaining, [])
  })
})
