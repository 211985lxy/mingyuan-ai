import { z } from "zod"

export const clientSchema = {
    NEXT_PUBLIC_APP_URL: z.string().optional(),
    NEXT_PUBLIC_SITE_URL: z.string().optional(),
    NEXT_PUBLIC_ADMIN_EMAIL: z.string().optional(),
    NEXT_PUBLIC_AIM_LANDING_DEFAULT: z.enum(["entry", "conversation"]).optional(),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
}
