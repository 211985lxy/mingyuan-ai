import { withUserAuth } from '@/lib/user-auth'
import { exportJobCsv } from '@/lib/comment-radar/pipeline'
import { NextResponse } from 'next/server'

export const GET = withUserAuth(async (_request, { user, params }) => {
  const id = (params as { id: string }).id
  const csv = await exportJobCsv(user.id, id)
  if (!csv) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return new NextResponse(csv, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="comments-${id}.csv"` } })
})
