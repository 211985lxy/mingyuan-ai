import { NextResponse } from 'next/server'
import { withUserAuth } from '@/lib/user-auth'
import { syncJobForUser } from '@/lib/comment-radar/pipeline'
export const POST = withUserAuth(async (_request, { user, params }) => { const id = (params as { id: string }).id; const result = await syncJobForUser(user.id, id); if (!result) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }); return NextResponse.json(result) })
