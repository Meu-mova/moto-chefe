import { NextRequest, NextResponse } from 'next/server'
import { getUsuarioLogado, podeCategorizarDespesaBanco } from '@/lib/auth'
import { usuarioPodeAcessar } from '@/lib/navegacao-servidor'
import { getGrupoAtivo } from '@/lib/grupo'
import { sincronizarSaidas, type ModoSync, type ResultadoSyncSaidas } from '@/app/(dashboard)/despesas/open-finance'

// Route Handler, não Server Action: o sync leva de segundos a mais de 2 min, e o Next despacha as Server
// Actions uma por vez por cliente (ver a mesma nota em /api/pix-mcp/sincronizar).
export const maxDuration = 300
export const dynamic = 'force-dynamic'

const MODOS: ModoSync[] = ['normal', 'forcado', 'completo']

export async function POST(req: NextRequest) {
  let usuario
  try {
    usuario = await getUsuarioLogado()
  } catch {
    return NextResponse.json({ error: 'Sessão expirada' }, { status: 401 })
  }
  if (!usuarioPodeAcessar(usuario, '/despesas')) {
    return NextResponse.json({ error: 'Sem permissão' }, { status: 403 })
  }

  const corpo = (await req.json().catch(() => null)) as { modo?: unknown } | null
  const pedido = MODOS.find(m => m === corpo?.modo) ?? 'normal'
  // O sync completo (histórico inteiro) é o mais pesado: só quem categoriza; para os demais vale o cache.
  const modo: ModoSync = pedido === 'completo' && !podeCategorizarDespesaBanco(usuario) ? 'normal' : pedido

  try {
    const grupo = await getGrupoAtivo(usuario)
    return NextResponse.json(await sincronizarSaidas({ id: grupo.id, cnpj: grupo.cnpj }, modo) satisfies ResultadoSyncSaidas)
  } catch (e) {
    // Sem a mensagem: pode trazer detalhe de conexão. O cliente só precisa saber que falhou.
    console.error('[despesas-sync] falhou', e instanceof Error ? e.name : 'desconhecido')
    return NextResponse.json({ ok: false, erro: 'erro ao sincronizar' } satisfies ResultadoSyncSaidas, { status: 500 })
  }
}
