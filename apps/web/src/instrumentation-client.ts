import * as Sentry from "@sentry/nextjs"
import { buildSentryInitOptions } from "@/lib/observability/sentry-init"

Sentry.init(buildSentryInitOptions({ client: true }))
