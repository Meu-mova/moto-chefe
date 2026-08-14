'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { lojas } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import {
  loginFabrica,
  listarPedidosCompraFabrica,
  buscarDetalheCompraFabrica,
  ehRetiradaNaLoja,
  STATUS_SEPARADO,
} from '@/lib/fabrica-scraper'

const PAPEIS_PERMITIDOS = ['admin_geral', 'admin_socio', 'aux_adm']

export type PecaSeparada = {
  peca: string
  quantidade: number | null
  categoria: string | null
  numeroPedido: string
  /** "29/07/2026 18:17" como vem do portal. */
  dataPedido: string | null
}

export type LojaPecasSeparadas = {
  lojaId: string
  loja: string
  status: 'ok' | 'sem_credencial' | 'erro'
  erro?: string
  pecas: PecaSeparada[]
}

/**
 * Lê no portal da fábrica, para cada loja do grupo do usuário, os pedidos de
 * compra com status "Separado" e devolve as peças que são de RETIRADA (as que
 * se pega no galpão — as de Correios a fábrica manda pelo malote).
 *
 * A lista de pedidos não traz o nome da peça nem o tipo de entrega, então abre
 * o detalhe de cada pedido separado. Leitura ao vivo, sem gravar nada.
 */
export async function listarPecasSeparadasAction(): Promise<LojaPecasSeparadas[]> {
  const u = await getUsuarioLogado()
  if (!PAPEIS_PERMITIDOS.includes(u.papel)) throw new Error('Sem permissão')

  const isAdmin = ['admin_geral', 'admin_socio'].includes(u.papel)
  const grupo = await getGrupoAtivo(u)

  // Admin vê o grupo inteiro; aux_adm vê só a própria loja (mesmo escopo das
  // garantias). Sem lojaId, um aux_adm não vê loja alguma.
  const escopo = isAdmin
    ? and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true))
    : and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true), eq(lojas.id, u.lojaId ?? ''))

  const lojasDoGrupo = await db
    .select({ id: lojas.id, nome: lojas.nome, email: lojas.fabricaEmail, senha: lojas.fabricaSenha })
    .from(lojas)
    .where(escopo)
    .orderBy(lojas.nome)

  const resultado: LojaPecasSeparadas[] = []

  // Sequencial de propósito: o portal da fábrica é frágil e paralelizar login na
  // mesma origem arrisca derrubar a sessão de outra loja (mesmo padrão do cron).
  for (const l of lojasDoGrupo) {
    const base = { lojaId: l.id, loja: l.nome }
    const email = l.email?.trim()
    const senha = l.senha?.trim()
    if (!email || !senha) {
      resultado.push({ ...base, status: 'sem_credencial', pecas: [] })
      continue
    }

    try {
      const session = await loginFabrica({ email, senha })
      const separados = await listarPedidosCompraFabrica(session, STATUS_SEPARADO)
      // O portal filtra por texto e já vem certo, mas uma mudança de rótulo lá
      // devolveria a lista inteira — conferimos o status exato de cada linha.
      const doStatus = separados.filter(p => (p.status ?? '').trim().toLowerCase() === 'separado')

      const pecas: PecaSeparada[] = []
      for (const p of doStatus) {
        const det = await buscarDetalheCompraFabrica(session, p.numeroPedido)
        if (!ehRetiradaNaLoja(det.tipoEntrega)) continue
        for (const item of det.itens) {
          pecas.push({
            peca: item.peca,
            quantidade: item.quantidade,
            categoria: item.categoria,
            numeroPedido: p.numeroPedido,
            dataPedido: p.dataPedido,
          })
        }
      }
      resultado.push({ ...base, status: 'ok', pecas })
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e)
      console.error(`peças separadas: falha ao ler ${l.nome}:`, erro)
      resultado.push({ ...base, status: 'erro', erro, pecas: [] })
    }
  }

  return resultado
}
