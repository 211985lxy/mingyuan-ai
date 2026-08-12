import { NextResponse } from "next/server"
import { withAdminOnly } from "@/lib/admin-auth"
import { getOperatingQualification } from "@/lib/aim/operating-qualification-store"

export const dynamic = "force-dynamic"

/** 只读经营资格闸门；证据缺失返回 qualified=false，不推测历史结果。 */
export const GET = withAdminOnly(async () => {
  try {
    return NextResponse.json(await getOperatingQualification())
  } catch (error) {
    return NextResponse.json({
      error:
        error instanceof Error
          ? error.message
          : "经营资格证据读取失败",
      qualified: false,
    }, { status: 409 })
  }
})
