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
  } catch (e) {
    return NextResponse.json({ db: 'error', error: String(e), ms: Date.now() - start }, { status: 500 })
  }
}
