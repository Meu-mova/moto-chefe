// Sair por POST numa rota, não Server Action: o login da fábrica não chama action nenhuma
// (@/lib/painel-fabrica). Usada pela área /fabrica e por /conta-desativada (#869). POST para
// um link externo não derrubar a sessão.
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 })
}
