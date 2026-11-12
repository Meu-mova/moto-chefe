import type { NextRequest } from 'next/server'

// O cron da Vercel manda "Authorization: Bearer <CRON_SECRET>"; o header x-cron-secret serve
// para chamada manual. Sem CRON_SECRET configurado, ninguém passa.
export function cronAutorizado(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const bearer = req.headers.get('authorization')
  return bearer === `Bearer ${secret}` || req.headers.get('x-cron-secret') === secret
}
