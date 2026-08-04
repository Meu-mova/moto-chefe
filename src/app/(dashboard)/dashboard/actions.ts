'use server'
import { db } from '@/lib/db'
import { importacoesCartao } from '@/lib/db/schema'
import { eq, and, inArray, desc } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { situacaoDoPedido, type SituacaoPedido } from '@/lib/importacao-cartao'

const PAPEIS_IMPORTACAO = ['admin_geral', 'admin_socio', 'aux_adm']

type ResumoOperadora = { importadas: number; duplicadas: number; conciliadas: number }

/**
 * Cria o pedido de importação. Se já existe um em aberto para o grupo,
 * devolve aquele: clicar duas vezes não coleta duas vezes.
 *
 * Só quem grava o status final é o POST do agente. Se o Chromium não subir, o
 * PC reiniciar no meio ou esse POST falhar, a linha fica `rodando` para sempre
 * — e reaproveitá-la devolveria um id morto a cada clique, sem saída pelo
 * aplicativo. Por isso o pedido em aberto que já passou do prazo
 * (`situacaoDoPedido` → `travado`) é encerrado como erro e um novo é criado.
 */
export async function solicitarImportacaoAction(): Promise<{ id: string } | { erro: string }> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_IMPORTACAO.includes(usuario.papel)) return { erro: 'Sem permissão' }

  const grupo = await getGrupoAtivo(usuario)

  const [emAberto] = await db
    .select({
      id: importacoesCartao.id,
      status: importacoesCartao.status,
      criadoEm: importacoesCartao.criadoEm,
      iniciadoEm: importacoesCartao.iniciadoEm,
    })
    .from(importacoesCartao)
    .where(and(
      eq(importacoesCartao.grupoId, grupo.id),
      inArray(importacoesCartao.status, ['pendente', 'rodando']),
    ))
    .orderBy(desc(importacoesCartao.criadoEm))
    .limit(1)

  if (emAberto) {
    if (situacaoDoPedido(emAberto, new Date()) !== 'travado') return { id: emAberto.id }

    // Encerra o pedido abandonado antes de enfileirar outro. O filtro de status
    // no UPDATE evita corrida com o agente que estivesse entregando o resultado
    // neste exato instante.
    await db
      .update(importacoesCartao)
      .set({
        status: 'erro',
        erro: 'Importação abandonada: o agente do PC da loja não respondeu dentro do prazo. Um novo pedido foi criado.',
        concluidoEm: new Date(),
      })
      .where(and(
        eq(importacoesCartao.id, emAberto.id),
        inArray(importacoesCartao.status, ['pendente', 'rodando']),
      ))
  }

  const [novo] = await db
    .insert(importacoesCartao)
    .values({ grupoId: grupo.id, solicitadoPor: usuario.id })
    .returning({ id: importacoesCartao.id })

  return { id: novo.id }
}

export async function consultarImportacaoAction(id: string): Promise<{
  situacao: SituacaoPedido
  resultado: Record<string, ResumoOperadora> | null
  erro: string | null
}> {
  const usuario = await getUsuarioLogado()
  if (!PAPEIS_IMPORTACAO.includes(usuario.papel)) return { situacao: 'erro', resultado: null, erro: 'Sem permissão' }

  const grupo = await getGrupoAtivo(usuario)

  const [pedido] = await db
    .select()
    .from(importacoesCartao)
    .where(and(eq(importacoesCartao.id, id), eq(importacoesCartao.grupoId, grupo.id)))
    .limit(1)

  if (!pedido) return { situacao: 'erro', resultado: null, erro: 'Pedido não encontrado' }

  return {
    situacao: situacaoDoPedido(pedido, new Date()),
    resultado: pedido.resultado as Record<string, ResumoOperadora> | null,
    erro: pedido.erro,
  }
}
