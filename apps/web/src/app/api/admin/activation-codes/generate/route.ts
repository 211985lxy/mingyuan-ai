import { parseJsonRecord } from "@/lib/api-contract"
import { NextRequest, NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import crypto from "crypto"
import { recordAdminAudit } from "@/lib/admin-audit"

// Alphabet excluding ambiguous characters: 0, O, 1, I, L
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
const CODE_LENGTH = 16

function generateCode(): string {
  const bytes = crypto.randomBytes(CODE_LENGTH)
  let code = ""
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length]
  }
  return code
}

export const POST = withAdminOnly(async (request: NextRequest, { admin }) => {
  const { quantity, batchNote, durationDays } = await parseJsonRecord(request)

  const qty = parseInt(quantity)
  if (!qty || qty < 1 || qty > 500) {
    return NextResponse.json(
      { error: "Quantity must be between 1 and 500" },
      { status: 400 }
    )
  }

  const duration = parseInt(durationDays ?? "14")
  if (!duration || duration < 1 || duration > 3650) {
    return NextResponse.json(
      { error: "Duration days must be between 1 and 3650" },
      { status: 400 }
    )
  }

  const batchId = crypto.randomUUID()

  // Generate unique codes with collision retry
  const codes = new Set<string>()
  while (codes.size < qty) {
    codes.add(generateCode())
  }

  const data = Array.from(codes).map((code) => ({
    code,
    batchId,
    batchNote: batchNote || null,
    durationDays: duration,
    status: "unused",
    createdBy: admin.id,
  }))

  await prisma.activationCode.createMany({ data })
  const requestId = await recordAdminAudit({
    request,
    adminId: admin.id,
    action: "activation_codes.generate",
    targetType: "activation_code_batch",
    targetId: batchId,
    metadata: { quantity: qty, durationDays: duration },
  })

  return NextResponse.json({
    data: { count: qty, batchId, durationDays: duration },
  }, { headers: { "x-request-id": requestId } })
})
