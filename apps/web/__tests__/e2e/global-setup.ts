const testDatabaseUrl = process.env.TEST_DATABASE_URL?.trim()
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required for E2E tests")
}

const databaseName = new URL(testDatabaseUrl).pathname.replace(/^\//, "")
if (!/(^|[_-])test([_-]|$)/i.test(databaseName)) {
  throw new Error(`E2E database name must contain a test segment, received: ${databaseName}`)
}

process.env.DATABASE_URL = testDatabaseUrl
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379"
process.env.ADMIN_JWT_SECRET = "test-e2e-admin-jwt-secret-at-least-32-bytes"
process.env.JWT_SECRET = "test-e2e-user-jwt-secret-at-least-32-bytes"
process.env.CRON_SECRET = "test-e2e-cron-secret-at-least-32-bytes"

// 数字人链路 E2E 环境：闪剪供应商（客户端在各文件内 vi.mock）。
// 回调路由 fail-closed，未配置密钥时直接 503，因此必须提供密钥。
process.env.DIGITAL_HUMAN_PROVIDER = "shanjian"
process.env.SHANJIAN_WEBHOOK_SECRET = "test-e2e-shanjian-webhook-secret"
process.env.SHANJIAN_AUTH_TEXT = "我是E2E测试用户，同意授权克隆我的数字人形象"

for (const key of [
  "APIMART_API_KEY",
  "ARK_API_KEY",
  "DEEPSEEK_API_KEY",
  "DOUBAO_API_KEY",
  "GLM_API_KEY",
  "JIEKOU_API_KEY",
  "LIHUO_API_KEY",
  "OPENAI_API_KEY",
  "OPENROUTER_API_KEY",
  "THEROUTER_API_KEY",
  "ZAI_API_KEY",
  "ZENMUX_API_KEY",
]) {
  delete process.env[key]
}
