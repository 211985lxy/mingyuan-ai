// Load test environment variables BEFORE anything else
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "mysql://mingyuan:changethis@127.0.0.1:3306/mingyuan"
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? "redis://localhost:6379"
process.env.ADMIN_JWT_SECRET = "test-e2e-jwt-secret"
process.env.JWT_SECRET = "test-e2e-jwt-secret"
process.env.CRON_SECRET = "test-e2e-cron-secret"
