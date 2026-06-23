import { db } from '@/lib/db'
import { sql } from 'drizzle-orm'
import { NextResponse } from 'next/server'

export async function GET() {
  const start = Date.now()
  try {
    await Promise.race([
      db.execute(sql`SELECT 1`),
      new Promise((_, rej) => setTimeout(() => rej(new Error('DB timeout after 8s')), 8000)),
    ])
    return NextResponse.json({ db: 'ok', ms: Date.now() - start })
  } catch (e: unknown) {
    const err = e instanceof Error ? e : new Error(String(e))
    const cause = (err as { cause?: unknown }).cause
    return NextResponse.json({
      db: 'error',
      ms: Date.now() - start,
      cause: cause instanceof Error ? cause.message : String(cause ?? err.message),
    }, { status: 500 })
  }
}
