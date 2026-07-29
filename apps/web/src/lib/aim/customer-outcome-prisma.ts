import { prisma } from "@/lib/prisma"
import type {
  CustomerOutcomeProjectionRecord,
  CustomerOutcomeProjectionStorePort,
} from "@/lib/aim/customer-outcome-projection"

function mapRow(row: {
  id: string
  projectId: string
  externalOutcomeId: string
  externalDealId: string | null
  externalRecordId: string | null
  externalTableId: string | null
  metricCode: string
  baseline: unknown
  target: unknown
  actual: unknown
  unit: string | null
  observedFrom: Date
  observedTo: Date
  evidenceRef: string
  reviewStatus: string
  reviewerRef: string | null
  reviewedAt: Date | null
}): CustomerOutcomeProjectionRecord {
  const decimal = (value: unknown): string | null =>
    value == null ? null : String(value)
  return {
    ...row,
    baseline: decimal(row.baseline),
    target: decimal(row.target),
    actual: decimal(row.actual),
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

export function createPrismaCustomerOutcomeProjectionStore():
CustomerOutcomeProjectionStorePort {
  return {
    async findByExternalOutcomeId(externalOutcomeId) {
      const row = await prisma.customerOutcomeProjection.findUnique({
        where: { externalOutcomeId },
      })
      return row ? mapRow(row) : null
    },
    async findByExternalRecordId(externalRecordId) {
      const row = await prisma.customerOutcomeProjection.findUnique({
        where: { externalRecordId },
      })
      return row ? mapRow(row) : null
    },
    async create(data) {
      try {
        return mapRow(await prisma.customerOutcomeProjection.create({ data }))
      } catch (error) {
        if (!isUniqueConflict(error)) throw error
        const row = await prisma.customerOutcomeProjection.findUnique({
          where: { externalOutcomeId: data.externalOutcomeId },
        })
        if (!row) throw error
        return mapRow(row)
      }
    },
    async update(id, data) {
      return mapRow(await prisma.customerOutcomeProjection.update({
        where: { id },
        data,
      }))
    },
  }
}
