import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { POST as SEED_SETTINGS } from "@/app/api/admin/settings/seed/route"
import { PUT as UPDATE_SETTING } from "@/app/api/admin/settings/[key]/route"
import { getBrandingConfig } from "@/lib/branding"
import {
  ACTIVE_BRANDING_SEED,
  BRANDING_SETTING_KEYS,
  DEFAULT_BRANDING_BASELINE,
} from "@/lib/branding-config"
import {
  authReq,
  cleanDatabase,
  cleanRedis,
  createAdminUser,
  disconnectAll,
  json,
  prisma,
  redis,
} from "./helpers"

const BRANDING_CACHE_KEY = "system:branding:v3"

let admin: { id: string; email: string; role: string }

describe("Branding Settings E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()
    const seededAdmin = await createAdminUser()
    admin = {
      id: seededAdmin.id,
      email: seededAdmin.email,
      role: seededAdmin.role,
    }
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("returns the latest OEM branding and preserves legacy defaults", async () => {
    const branding = await getBrandingConfig()

    expect(branding.name).toBe(ACTIVE_BRANDING_SEED.name)
    expect(branding.logoUrl).toBe(ACTIVE_BRANDING_SEED.logoUrl)
    expect(branding.defaultName).toBe(DEFAULT_BRANDING_BASELINE.name)
    expect(branding.defaultLogoUrl).toBe(DEFAULT_BRANDING_BASELINE.logoUrl)
  })

  it("seeds branding settings into real system settings storage", async () => {
    const res = await SEED_SETTINGS(
      authReq("/api/admin/settings/seed", admin, { method: "POST" }),
      undefined as never
    )

    expect(res.status).toBe(200)

    const body = await json(res)
    expect(body.data.total).toBeGreaterThanOrEqual(8)

    const settings = await prisma.systemSetting.findMany({
      where: { category: "branding" },
      orderBy: { key: "asc" },
    })

    const entries = new Map(settings.map((setting) => [setting.key, setting.value]))

    expect(entries.get(BRANDING_SETTING_KEYS.defaultName)).toBe(DEFAULT_BRANDING_BASELINE.name)
    expect(entries.get(BRANDING_SETTING_KEYS.defaultLogoUrl)).toBe(DEFAULT_BRANDING_BASELINE.logoUrl)
    expect(entries.get(BRANDING_SETTING_KEYS.name)).toBe(ACTIVE_BRANDING_SEED.name)
    expect(entries.get(BRANDING_SETTING_KEYS.logoUrl)).toBe(ACTIVE_BRANDING_SEED.logoUrl)
  })

  it("invalidates cached branding when admin updates active branding", async () => {
    await getBrandingConfig()
    expect(await redis.get(BRANDING_CACHE_KEY)).not.toBeNull()

    const nextName = "测试 OEM 品牌"
    const res = await UPDATE_SETTING(
      authReq(`/api/admin/settings/${BRANDING_SETTING_KEYS.name}`, admin, {
        method: "PUT",
        body: { value: nextName },
      }),
      { params: Promise.resolve({ key: BRANDING_SETTING_KEYS.name }) }
    )

    expect(res.status).toBe(200)
    expect(await redis.get(BRANDING_CACHE_KEY)).toBeNull()

    const branding = await getBrandingConfig()
    expect(branding.name).toBe(nextName)
    expect(await redis.get(BRANDING_CACHE_KEY)).not.toBeNull()
  })
})
