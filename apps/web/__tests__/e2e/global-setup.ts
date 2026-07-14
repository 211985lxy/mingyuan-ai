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
