/**
 * daily Eval 资格制品。
 *
 * 制品由 eval:daily 使用独立服务端密钥签名。qualify_eval 只接受签名、
 * 新鲜度和 daily 门禁均通过的制品，不能信任调用方提交的布尔值或裸指标。
 */

import { createHmac, timingSafeEqual } from "node:crypto"
import type { LearningQualificationMetrics } from "@/lib/aim/learning-candidate"

const DAILY_RUBRIC_MIN = 0.8
const RUBRIC_SCORE_PASS = 70
const MAX_ARTIFACT_AGE_MS = 48 * 60 * 60 * 1000
const METRIC_KEYS = [
  "targetFailureRateBefore",
  "targetFailureRateAfter",
  "acceptanceRateBefore",
  "acceptanceRateAfter",
  "evidenceCompletenessRateBefore",
  "evidenceCompletenessRateAfter",
  "severeHallucinationRate",
] as const

type JsonRecord = Record<string, unknown>

export interface DailyEvalArtifactBody {
  schemaVersion: 1
  mode: "daily"
  generatedAt: string
  contractPassRate: number
  rubricPassRate: number
  repetitions: number
  results: unknown[]
  qualificationMetrics: LearningQualificationMetrics
  evidenceRef: string
}

export interface SignedDailyEvalArtifact extends DailyEvalArtifactBody {
  signature: string
}

function object(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : null
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize)
  const row = object(value)
  if (!row) return value
  return Object.fromEntries(
    Object.keys(row).sort().map((key) => [key, canonicalize(row[key])]),
  )
}

function signingText(body: JsonRecord): string {
  return JSON.stringify(canonicalize(body))
}

function validSecret(secret: string | undefined): secret is string {
  return typeof secret === "string" && secret.length >= 32
}

function signatureFor(body: JsonRecord, secret: string): string {
  return createHmac("sha256", secret).update(signingText(body)).digest("hex")
}

function bodyWithoutSignature(row: JsonRecord): JsonRecord {
  return Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== "signature"),
  )
}

function signatureMatches(
  row: JsonRecord,
  secret: string,
): boolean {
  if (typeof row.signature !== "string" || !/^[a-f0-9]{64}$/i.test(row.signature)) {
    return false
  }
  const expected = Buffer.from(signatureFor(bodyWithoutSignature(row), secret), "hex")
  const actual = Buffer.from(row.signature, "hex")
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

function parseMetrics(value: unknown): LearningQualificationMetrics | null {
  const row = object(value)
  if (!row) return null
  if (!METRIC_KEYS.every((key) =>
    typeof row[key] === "number"
    && Number.isFinite(row[key])
    && row[key] >= 0
    && row[key] <= 1)) return null
  return Object.fromEntries(
    METRIC_KEYS.map((key) => [key, row[key]]),
  ) as unknown as LearningQualificationMetrics
}

function dailyReportPassed(row: JsonRecord): string | null {
  if (
    typeof row.contractPassRate !== "number"
    || row.contractPassRate < 0.999
    || row.contractPassRate > 1
  ) return "daily Eval 契约通过率必须为 100%"
  if (
    typeof row.rubricPassRate !== "number"
    || row.rubricPassRate < DAILY_RUBRIC_MIN
    || row.rubricPassRate > 1
  ) return "daily Eval rubric 通过率必须 ≥ 80%"
  if (!Number.isInteger(row.repetitions) || row.repetitions < 1) {
    return "daily Eval repetitions 无效"
  }
  if (!Array.isArray(row.results) || row.results.length === 0) {
    return "daily Eval 制品缺少 results"
  }
  const results = row.results.map(object)
  if (results.some((result) =>
    !result
    || result.contractPassed !== true
    || typeof result.rubricScore !== "number"
    || !Number.isFinite(result.rubricScore)
    || result.fabricatedFact === true)) {
    return "daily Eval 结果存在契约失败、缺失评分或虚构"
  }
  if (row.repetitions > 1) {
    const fixtureIds = new Set(results.flatMap((result) =>
      typeof result?.fixtureId === "string" ? [result.fixtureId] : []))
    for (const fixtureId of fixtureIds) {
      const attempts = results.filter((result) => result?.fixtureId === fixtureId)
      if (
        attempts.length >= 2
        && attempts.every((result) => (result?.rubricScore as number) < RUBRIC_SCORE_PASS)
      ) return `daily Eval fixture ${fixtureId} 每次重复均失败`
    }
  }
  return null
}

export function signDailyEvalArtifact(input: {
  body: DailyEvalArtifactBody
  secret: string
}): SignedDailyEvalArtifact {
  if (!validSecret(input.secret)) {
    throw new Error("AIM_DAILY_EVAL_ARTIFACT_SECRET 至少需要 32 个字符")
  }
  const body = JSON.parse(JSON.stringify(input.body)) as DailyEvalArtifactBody
  return {
    ...body,
    signature: signatureFor(body as unknown as JsonRecord, input.secret),
  }
}

export function verifyDailyEvalArtifact(input: {
  artifact: unknown
  secret?: string
  now?: Date
}): {
  ok: true
  passedAt: Date
  metrics: LearningQualificationMetrics
  evidenceRef: string
} | { ok: false; reason: string } {
  const secret = input.secret ?? process.env.AIM_DAILY_EVAL_ARTIFACT_SECRET
  if (!validSecret(secret)) {
    return { ok: false, reason: "未配置可验证 daily Eval 制品签名密钥" }
  }
  const row = object(input.artifact)
  if (!row || !signatureMatches(row, secret)) {
    return { ok: false, reason: "daily Eval 制品签名缺失或无效" }
  }
  if (row.schemaVersion !== 1 || row.mode !== "daily") {
    return { ok: false, reason: "daily Eval 制品版本或 mode 无效" }
  }
  const generatedAt = typeof row.generatedAt === "string"
    ? new Date(row.generatedAt)
    : new Date(Number.NaN)
  if (!Number.isFinite(generatedAt.getTime())) {
    return { ok: false, reason: "daily Eval 制品 generatedAt 无效" }
  }
  const now = input.now ?? new Date()
  const ageMs = now.getTime() - generatedAt.getTime()
  if (ageMs < 0) return { ok: false, reason: "daily Eval 制品不能来自未来" }
  if (ageMs > MAX_ARTIFACT_AGE_MS) {
    return { ok: false, reason: "daily Eval 制品已过期" }
  }
  const reportError = dailyReportPassed(row)
  if (reportError) return { ok: false, reason: reportError }
  const metrics = parseMetrics(row.qualificationMetrics)
  if (!metrics) return { ok: false, reason: "daily Eval 制品资格指标无效" }
  const evidenceRef =
    typeof row.evidenceRef === "string" ? row.evidenceRef.trim() : ""
  if (!evidenceRef) return { ok: false, reason: "daily Eval 制品缺少证据引用" }
  return { ok: true, passedAt: generatedAt, metrics, evidenceRef }
}
