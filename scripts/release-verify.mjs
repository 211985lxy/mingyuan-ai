import { spawnSync } from "node:child_process"

const allowMissingServices = process.argv.includes("--allow-missing-services")
const skipDailyEval = process.argv.includes("--skip-daily-eval")
const signedOffBy = process.env.AIM_RELEASE_SKIP_DAILY_EVAL_SIGNED_OFF_BY?.trim() || ""

const steps = [
  ["Frozen dependency install", ["install", "--frozen-lockfile"]],
  ["Prisma schema validation", ["--dir", "apps/web", "exec", "prisma", "validate"]],
  ["Prisma client generation", ["--dir", "apps/web", "exec", "prisma", "generate"]],
  ["Environment contract", ["--dir", "apps/web", "run", "env:check"]],
  ["API contract inventory", ["--dir", "apps/web", "run", "api:contracts"]],
  ["Dependency audit", ["security:audit"]],
  ["Application typecheck", ["--dir", "apps/web", "run", "typecheck"]],
  ["Test typecheck", ["--dir", "apps/web", "run", "typecheck:tests"]],
  ["Lint", ["--dir", "apps/web", "exec", "eslint", "--quiet", "."]],
  ["Source size guard", ["--dir", "apps/web", "run", "arch:size"]],
  ["AIM architecture guard", ["--dir", "apps/web", "run", "arch:check"]],
  ["Domain boundary guard", ["--dir", "apps/web", "run", "arch:domains"]],
  ["Retired capability guard", ["--dir", "apps/web", "run", "arch:retired"]],
  ["Bounded Prisma query guard", ["--dir", "apps/web", "run", "db:bounds"]],
  ["Unit and evaluation tests", ["--dir", "apps/web", "test"]],
  ["Deterministic harness", ["--dir", "apps/web", "run", "test:harness"]],
  ["Production build", ["--dir", "apps/web", "build"]],
]

const databaseSteps = [
  ["Prepare isolated database", ["--dir", "apps/web", "run", "test:e2e:prepare"]],
  ["Migration status", ["--dir", "apps/web", "run", "schema:migration-status"]],
  ["Deterministic database E2E", ["--dir", "apps/web", "run", "test:e2e"]],
]

const dailyEvalStep = ["Real-model daily eval gate", ["--dir", "apps/web", "run", "eval:daily"]]

const hasDatabaseServices = Boolean(process.env.TEST_DATABASE_URL && process.env.DATABASE_URL)

if (!hasDatabaseServices && !allowMissingServices) {
  console.error("release:verify requires both TEST_DATABASE_URL and DATABASE_URL")
  process.exit(1)
}

if (skipDailyEval) {
  if (!signedOffBy) {
    console.error(
      "release:verify --skip-daily-eval requires AIM_RELEASE_SKIP_DAILY_EVAL_SIGNED_OFF_BY " +
        "(业务负责人书面签核姓名/工号)。禁止无签核跳过真实模型门禁。",
    )
    process.exit(1)
  }
  console.warn(
    `WARN: skipping real-model daily eval by written sign-off from ${signedOffBy}. ` +
      "This is NOT release evidence.",
  )
}

for (const [name, args] of hasDatabaseServices ? [...steps, ...databaseSteps] : steps) {
  console.log(`\n==> ${name}`)
  const startedAt = Date.now()
  const env = name === "Production build"
    ? { ...process.env, NODE_ENV: "production" }
    : process.env
  const result = spawnSync("pnpm", args, { stdio: "inherit", env })
  if (result.status !== 0) {
    console.error(`release verification failed: ${name}`)
    process.exit(result.status ?? 1)
  }
  console.log(`<== ${name} passed in ${Math.ceil((Date.now() - startedAt) / 1000)}s`)
}

if (!skipDailyEval) {
  const [name, args] = dailyEvalStep
  console.log(`\n==> ${name}`)
  const startedAt = Date.now()
  const result = spawnSync("pnpm", args, {
    stdio: "inherit",
    env: process.env,
  })
  if (result.status !== 0) {
    console.error(
      "release verification failed: Real-model daily eval gate " +
        "(缺少密钥、报告门槛不达标或评估失败时必须失败；仅书面签核可 --skip-daily-eval)",
    )
    process.exit(result.status ?? 1)
  }
  console.log(`<== ${name} passed in ${Math.ceil((Date.now() - startedAt) / 1000)}s`)
}

if (!hasDatabaseServices) {
  console.warn("SKIPPED Database E2E and migration status: isolated database services are unavailable.")
}
console.log("release-verification-ok")
