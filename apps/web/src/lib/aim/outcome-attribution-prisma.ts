import { prisma } from "@/lib/prisma"
import {
  normalizeAttributionMethod,
  type AttributionConfidence,
  type OutcomeAttributionRecord,
  type OutcomeAttributionStorePort,
} from "@/lib/aim/outcome-attribution"

function mapRow(row: {
  id: string
  userId: string
  generationId: string
  externalLeadId: string
  externalAppointmentId: string | null
  externalDealId: string | null
  externalPaymentId: string | null
  externalRecordId: string | null
  externalTableId: string | null
  externalSourceContentId: string | null
  externalAttributionConfirmer: string | null
  attributionMethod: string
  attributionConfidence: string
  occurredAt: Date
}): OutcomeAttributionRecord {
  const confidence: AttributionConfidence =
    row.attributionConfidence === "high" || row.attributionConfidence === "medium"
      ? row.attributionConfidence
      : "low"
  return {
    ...row,
    attributionMethod: normalizeAttributionMethod(row.attributionMethod),
    attributionConfidence: confidence,
  }
}

function isUniqueConflict(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "P2002",
  )
}

export function createPrismaOutcomeAttributionStore(): OutcomeAttributionStorePort {
  return {
    async findByExternalRecordId(externalRecordId) {
      const row = await prisma.outcomeAttribution.findUnique({
        where: { externalRecordId },
      })
      return row ? mapRow(row) : null
    },
    async findByExternalLeadId(externalLeadId) {
      const row = await prisma.outcomeAttribution.findUnique({
        where: { externalLeadId },
      })
      return row ? mapRow(row) : null
    },
    async findByExternalDealId(externalDealId) {
      const row = await prisma.outcomeAttribution.findUnique({
        where: { externalDealId },
      })
      return row ? mapRow(row) : null
    },
    async findByExternalPaymentId(externalPaymentId) {
      const row = await prisma.outcomeAttribution.findUnique({
        where: { externalPaymentId },
      })
      return row ? mapRow(row) : null
    },
    async create(data) {
      try {
        return mapRow(await prisma.outcomeAttribution.create({ data }))
      } catch (error) {
        if (!isUniqueConflict(error)) throw error
        const existing = await prisma.outcomeAttribution.findUnique({
          where: { externalLeadId: data.externalLeadId },
        })
        if (!existing) throw error
        return mapRow(existing)
      }
    },
    async update(id, data) {
      return mapRow(await prisma.outcomeAttribution.update({
        where: { id },
        data,
      }))
    },
  }
}
