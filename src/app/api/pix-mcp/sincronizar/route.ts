import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { cachePixValido, sincronizarPix, ultimaSincronizacaoPix, type ResultadoSyncPix } from '@/lib/pix-sync'

// Route Handler, não Server Action: o Next despacha as Server Actions uma por vez por
// cliente, então uma sincronização de 1 a 4 min travava na fila qualquer outra ação da
// tela (trocar de grupo, vincular PIX) até terminar.
export const maxDuration = 300
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 })
  }
  if (!usuarioPodeAcessar(usuario, '/pix-mcp')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const { forcar } = (await req.json().catch(() => ({}))) as { forcar?: boolean }
  const grupo = await getGrupoAtivo(usuario)

  // Reconfere aqui: outra aba pode ter acabado de sincronizar.
  if (!forcar && cachePixValido(await ultimaSincronizacaoPix(grupo.id))) {
    return NextResponse.json({ ok: true, contasPuladas: [] } satisfies ResultadoSyncPix)
  }

  return NextResponse.json(await sincronizarPix(grupo) satisfies ResultadoSyncPix)
}
