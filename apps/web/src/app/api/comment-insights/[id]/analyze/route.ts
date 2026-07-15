import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest, authErrorResponse } from '@/lib/user-auth'
import { analyzeJobForUser } from '@/lib/comment-radar/pipeline'

export async function POST(request: NextRequest, { params }: { params: Promise<Record<string, string>> }) {
  let user: { id: string; email: string }
  try { user = await authenticateRequest(request) } catch (e) { const r = authErrorResponse(e); if (r) return r; return NextResponse.json({ error: 'Internal error' }, { status: 500 }) }
  const p = await params
  const result = await analyzeJobForUser(user.id, p.id)
  if (!result) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 })
  return NextResponse.json(result)
}
