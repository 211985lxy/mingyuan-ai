import { prisma } from "@/lib/prisma"

import type {
  FeishuOperatorCredentialRecord,
  FeishuOperatorCredentialStore,
} from "./feishu-knowledge-credentials"

export const FEISHU_KNOWLEDGE_OPERATOR_LABEL = "operator"

export function createPrismaFeishuOperatorCredentialStore(): FeishuOperatorCredentialStore {
  return {
    async loadActive() {
      const row = await prisma.feishuKnowledgeOperatorCredential.findUnique({
        where: { label: FEISHU_KNOWLEDGE_OPERATOR_LABEL },
      })
      if (!row || row.status !== "active") return null
      return {
        encryptedAccessToken: row.encryptedAccessToken,
        encryptedRefreshToken: row.encryptedRefreshToken,
        accessTokenExpiresAt: row.accessTokenExpiresAt,
        refreshTokenExpiresAt: row.refreshTokenExpiresAt,
        scope: row.scope,
        status: row.status,
      }
    },
    async save(record: FeishuOperatorCredentialRecord) {
      const data = {
        encryptedAccessToken: record.encryptedAccessToken,
        encryptedRefreshToken: record.encryptedRefreshToken,
        accessTokenExpiresAt: record.accessTokenExpiresAt,
        refreshTokenExpiresAt: record.refreshTokenExpiresAt ?? null,
        scope: record.scope,
        status: "active" as const,
      }
      await prisma.feishuKnowledgeOperatorCredential.upsert({
        where: { label: FEISHU_KNOWLEDGE_OPERATOR_LABEL },
        create: { label: FEISHU_KNOWLEDGE_OPERATOR_LABEL, ...data },
        update: data,
      })
    },
    async markRevoked() {
      await prisma.feishuKnowledgeOperatorCredential.updateMany({
        where: { label: FEISHU_KNOWLEDGE_OPERATOR_LABEL, status: "active" },
        data: { status: "revoked" },
      })
    },
  }
}
