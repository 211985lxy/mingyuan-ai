import { NextResponse } from 'next/server'
import { withUserAuth } from '@/lib/user-auth'
import { getJobForUser } from '@/lib/comment-radar/pipeline'
export const GET = withUserAuth(async (_request, { user, params }) => { const id = (params as { id: string }).id; const job = await getJobForUser(user.id, id); if (!job) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 }); return NextResponse.json(job) })
