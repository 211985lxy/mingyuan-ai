import { createHash } from "node:crypto"

import { prisma } from "@/lib/prisma"

export const DOUYIN_LOGIN_CHALLENGE_TTL_MS = 10 * 60 * 1000

export function hashDouyinLoginState(state: string): string {
  return createHash("sha256").update(`douyin-login:${state}`).digest("hex")
}

export async function createDouyinLoginChallenge(input: {
  state: string
  openId: string
  unionId?: string | null
  scope: string
}): Promise<string> {
  const challenge = await prisma.douyinLoginChallenge.create({
    data: {
      stateHash: hashDouyinLoginState(input.state),
      openId: input.openId,
      unionId: input.unionId ?? null,
      scope: input.scope,
      expiresAt: new Date(Date.now() + DOUYIN_LOGIN_CHALLENGE_TTL_MS),
    },
  })
  return challenge.id
}
