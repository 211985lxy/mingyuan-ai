import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  authReq,
  cleanDatabase,
  cleanRedis,
  createAdminUser,
  disconnectAll,
  json,
  prisma,
  req,
} from "./helpers"
import { POST as REGISTER } from "@/app/api/auth/register/route"
import { POST as ACTIVATE } from "@/app/api/auth/activate/route"
import { GET as ME } from "@/app/api/auth/me/route"
import { GET as PROJECTS } from "@/app/api/projects/route"
import { POST as GENERATE_CODES } from "@/app/api/admin/activation-codes/generate/route"

let admin: { id: string; email: string; role: string }
let sessionCookie: string

describe("Activation Flow E2E", () => {
  beforeAll(async () => {
    await cleanDatabase()
    await cleanRedis()

    const adminUser = await createAdminUser()
    admin = {
      id: adminUser.id,
      email: adminUser.email,
      role: adminUser.role,
    }
  })

  afterAll(async () => {
    await cleanDatabase()
    await disconnectAll()
  })

  it("blocks protected APIs until the user activates", async () => {
    const registerRes = await REGISTER(
      req("/api/auth/register", {
        method: "POST",
        body: {
          email: "activation@test.com",
          password: "Pass123!",
          name: "Activation User",
        },
      })
    )
    expect(registerRes.status).toBe(201)

    const registerBody = await json(registerRes)
    sessionCookie = (registerRes.headers.get("set-cookie") ?? "").split(";", 1)[0]
    expect(registerBody.user.subscriptionStatus).toBe("inactive")
    expect(registerBody.user.expiresAt).toBeNull()

    const protectedRes = await PROJECTS(
      req("/api/projects", {
        headers: { Cookie: sessionCookie },
      })
    )
    expect(protectedRes.status).toBe(403)

    const protectedBody = await json(protectedRes)
    expect(protectedBody.code).toBe("ACTIVATION_REQUIRED")

    const meRes = await ME(
      req("/api/auth/me", {
        headers: { Cookie: sessionCookie },
      }),
      undefined as never
    )
    expect(meRes.status).toBe(200)

    const meBody = await json(meRes)
    expect(meBody.user.subscriptionStatus).toBe("inactive")
    expect(meBody.user.isActivated).toBe(false)
  })

  it("lets admin generate activation codes with a bound duration", async () => {
    const res = await GENERATE_CODES(
      authReq("/api/admin/activation-codes/generate", admin, {
        method: "POST",
        body: {
          quantity: 2,
          durationDays: 30,
          batchNote: "Live stream March",
        },
      }),
      undefined as never
    )

    expect(res.status).toBe(200)
    const body = await json(res)
    expect(body.data.count).toBe(2)
    expect(body.data.durationDays).toBe(30)

    const codes = await prisma.activationCode.findMany({
      where: { batchId: body.data.batchId },
      orderBy: { createdAt: "asc" },
    })

    expect(codes).toHaveLength(2)
    expect(codes[0].durationDays).toBe(30)
  })

  it("activates the account and extends expiry when redeeming another code", async () => {
    const firstCode = await prisma.activationCode.findFirst({
      where: { status: "unused" },
      orderBy: { createdAt: "asc" },
    })
    expect(firstCode).not.toBeNull()

    const activateRes = await ACTIVATE(
      req("/api/auth/activate", {
        method: "POST",
        headers: { Cookie: sessionCookie, Origin: "http://localhost:3000" },
        body: {
          code: `${firstCode!.code.slice(0, 4)}-${firstCode!.code.slice(4, 8)}-${firstCode!.code.slice(8, 12)}-${firstCode!.code.slice(12, 16)}`,
        },
      }),
      undefined as never
    )

    expect(activateRes.status).toBe(200)
    const activateBody = await json(activateRes)
    expect(activateBody.user.subscriptionStatus).toBe("active")
    expect(activateBody.user.isActivated).toBe(true)

    const firstExpiry = new Date(activateBody.user.expiresAt).getTime()
    const diffDays = (firstExpiry - Date.now()) / 86400000
    expect(diffDays).toBeGreaterThan(29)
    expect(diffDays).toBeLessThan(31)

    const protectedRes = await PROJECTS(
      req("/api/projects", {
        headers: { Cookie: sessionCookie },
      })
    )
    expect(protectedRes.status).toBe(200)

    const generateSecondRes = await GENERATE_CODES(
      authReq("/api/admin/activation-codes/generate", admin, {
        method: "POST",
        body: {
          quantity: 1,
          durationDays: 10,
          batchNote: "Renewal",
        },
      }),
      undefined as never
    )
    expect(generateSecondRes.status).toBe(200)

    const renewalCode = await prisma.activationCode.findFirst({
      where: { batchNote: "Renewal" },
    })
    expect(renewalCode).not.toBeNull()

    const renewalRes = await ACTIVATE(
      req("/api/auth/activate", {
        method: "POST",
        headers: { Cookie: sessionCookie, Origin: "http://localhost:3000" },
        body: { code: renewalCode!.code },
      }),
      undefined as never
    )
    expect(renewalRes.status).toBe(200)

    const renewalBody = await json(renewalRes)
    const renewedExpiry = new Date(renewalBody.user.expiresAt).getTime()
    expect(renewedExpiry - firstExpiry).toBeGreaterThan(9 * 86400000)
    expect(renewedExpiry - firstExpiry).toBeLessThan(11 * 86400000)

    const meRes = await ME(
      req("/api/auth/me", {
        headers: { Cookie: sessionCookie },
      }),
      undefined as never
    )
    expect(meRes.status).toBe(200)

    const meBody = await json(meRes)
    expect(meBody.user.subscriptionStatus).toBe("active")

    const redeemedFirstCode = await prisma.activationCode.findUnique({
      where: { id: firstCode!.id },
    })
    expect(redeemedFirstCode?.status).toBe("used")
  })
})
