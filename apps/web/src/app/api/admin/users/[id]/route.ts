import { NextRequest, NextResponse } from "next/server"
import { withAdminAuth } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"

export const GET = withAdminAuth(async (_request: NextRequest, { params }) => {
  const id = params?.id
  if (!id) {
    return NextResponse.json({ error: "User ID required" }, { status: 400 })
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      email: true,
      name: true,
      plan: true,
      createdAt: true,
      updatedAt: true,
      ipProfile: {
        select: {
          displayName: true,
          industry: true,
          isComplete: true,
        },
      },
      aimGenerations: {
        select: {
          id: true,
          status: true,
          agentId: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      assets: {
        select: {
          id: true,
          name: true,
          assetType: true,
          createdAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
      _count: {
        select: {
          aimGenerations: true,
          assets: true,
          scripts: true,
        },
      },
    },
  })

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 })
  }

  return NextResponse.json({ data: user })
})
