import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withAdminAuth } from "@/lib/admin-auth"
import type { Prisma } from "@/generated/prisma/client"
import {
  TOPIC_ELEMENTS,
  OPENING_TYPES,
  COPY_STRUCTURES,
  ENDING_TYPES,
} from "../../../../../prisma/seed-topic-engine"

export const POST = withAdminAuth(async () => {
  const results: string[] = []

  for (const el of TOPIC_ELEMENTS) {
    await prisma.topicElement.upsert({
      where: { code: el.code },
      update: { name: el.name, typeLabel: el.typeLabel, description: el.description },
      create: { ...el, status: "published" },
    })
  }
  results.push(`TopicElements: ${TOPIC_ELEMENTS.length}`)

  for (const ot of OPENING_TYPES) {
    const formulas = ot.formulas as unknown as Prisma.InputJsonValue
    const examples = ot.examples as unknown as Prisma.InputJsonValue
    await prisma.openingType.upsert({
      where: { code: ot.code },
      update: { name: ot.name, description: ot.description, formulas, examples },
      create: { code: ot.code, name: ot.name, description: ot.description, formulas, examples, sortOrder: ot.sortOrder, status: "published" },
    })
  }
  results.push(`OpeningTypes: ${OPENING_TYPES.length}`)

  for (const cs of COPY_STRUCTURES) {
    const beats = cs.beats as unknown as Prisma.InputJsonValue
    await prisma.copyStructure.upsert({
      where: { code: cs.code },
      update: { name: cs.name, description: cs.description, beats, caseStudy: cs.caseStudy ?? null },
      create: { code: cs.code, name: cs.name, description: cs.description, beats, caseStudy: cs.caseStudy ?? null, sortOrder: cs.sortOrder, status: "published" },
    })
  }
  results.push(`CopyStructures: ${COPY_STRUCTURES.length}`)

  for (const et of ENDING_TYPES) {
    await prisma.endingType.upsert({
      where: { code: et.code },
      update: { name: et.name, description: et.description, guidance: et.guidance },
      create: { code: et.code, name: et.name, description: et.description, guidance: et.guidance, sortOrder: et.sortOrder, status: "published" },
    })
  }
  results.push(`EndingTypes: ${ENDING_TYPES.length}`)

  return NextResponse.json({ data: { results } })
})
