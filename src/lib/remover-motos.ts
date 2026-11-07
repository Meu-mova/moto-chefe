/**
 * Remover moto (#692; ADR-0020 com o adendo de 07/11/2026): apaga de vez a moto que nunca devia ter
 * entrado, com o que depende dela, ou nada. Moto que passou pelo comercial ou pelo financeiro é
 * recusada pela regra pura. Conta e alcance no where, como no Arquivar (mesma frase para outra Conta,
 * fora do alcance e id inexistente). Ficam: NF de saída, histórico de veículos e Notas recebidas.
 */
import { and, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  agendamentos, aprovacoesVenda, conciliacoesCartao, cuponsRevisao, garantias, historicoEstoque, lancamentosCaixa,
  lojas, modelos, motos, ordensServico, osItens, pedidosVenda, pixRecebimentosMcp, reservas, transferencias, vendas,
} from '@/lib/db/schema'
import {
  alcance, dadosDaMoto, daMoto, NAO_ENCONTRADA, registrarNoLog, temLinha, travarDoAlcance, type Exec, type UsuarioQueArquiva,
} from '@/lib/arquivar-motos'
import { podeArquivarMotos } from '@/lib/arquivar-moto-regras'
import { motivoQueImpedeRemover, recusaDaRemocao, type ImpedimentosDeRemover } from '@/lib/remover-moto-regras'
import { RecusaUsuario } from '@/lib/resultado-action'
import { ehUuid } from '@/lib/uuid'

const LIMITE_DA_BUSCA = 50

// OS da moto (a de fora da subconsulta) com caixa, cartão ou PIX ligado a ela.
const osComDinheiro = sql`${ordensServico.motoId} = ${daMoto} and (
  exists (select 1 from ${lancamentosCaixa} where ${lancamentosCaixa.osId} = ${ordensServico.id})
  or exists (select 1 from ${conciliacoesCartao} where ${conciliacoesCartao.osId} = ${ordensServico.id})
  or exists (select 1 from ${pixRecebimentosMcp} where ${pixRecebimentosMcp.osId} = ${ordensServico.id}))`

function motosComImpedimentos(exec: Exec, onde: SQL | undefined) {
  return exec.select({
    ...dadosDaMoto(),
    temVenda: temLinha(exec, vendas),
    aprovacaoPendente: temLinha(exec, aprovacoesVenda, eq(aprovacoesVenda.status, 'pendente')),
    pedidoPendente: temLinha(exec, pedidosVenda, eq(pedidosVenda.status, 'pendente')),
    reservaAtiva: temLinha(exec, reservas, eq(reservas.status, 'ativa')),
    pedidoComPix: sql<boolean>`${exists(exec.select({ um: sql`1` }).from(pixRecebimentosMcp)
      .innerJoin(pedidosVenda, eq(pedidosVenda.id, pixRecebimentosMcp.pedidoId))
      .where(eq(pedidosVenda.motoId, daMoto)))}`,
    osComDinheiroExiste: sql<boolean>`exists (select 1 from ${ordensServico} where ${osComDinheiro})`,
    osComDinheiroNumero: sql<number | null>`(select min(${ordensServico.numero}) from ${ordensServico} where ${osComDinheiro})`,
  })
    .from(motos)
    .innerJoin(lojas, eq(lojas.id, motos.lojaId))
    .innerJoin(modelos, eq(modelos.id, motos.modeloId))
    .where(onde)
}

type LinhaDaMoto = Awaited<ReturnType<typeof motosComImpedimentos>>[number]

const impedimentosDa = (m: LinhaDaMoto): ImpedimentosDeRemover => ({
  temVenda: m.temVenda, aprovacaoPendente: m.aprovacaoPendente, pedidoPendente: m.pedidoPendente,
  reservaAtiva: m.reservaAtiva, pedidoComPix: m.pedidoComPix,
  osComDinheiro: m.osComDinheiroExiste ? { numero: m.osComDinheiroNumero } : null,
})

/** Motos para o passo "Escolher": qualquer situação, inclusive arquivada, com o motivo de não poder. */
export async function motosParaRemover(usuario: UsuarioQueArquiva, termo: string, exec: Exec = db) {
  const busca = termo.trim()
  if (!podeArquivarMotos(usuario.papel) || !busca) return []
  const onde = await alcance(usuario, exec)
  if (onde === null) return []
  const linhas = await motosComImpedimentos(exec, and(onde, or(ilike(motos.chassi, `%${busca}%`), ilike(motos.notaFiscalEntrada, `%${busca}%`))))
    .orderBy(motos.chassi)
    .limit(LIMITE_DA_BUSCA)
  return linhas.map(m => ({
    id: m.id, chassi: m.chassi, modelo: m.modelo, loja: m.loja, nfEntrada: m.nfEntrada,
    bloqueio: motivoQueImpedeRemover(impedimentosDa(m)),
  }))
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]

/** Quantas linhas de cada tipo saíram com a moto; tipo sem linha não aparece. */
const saiuDaMoto = (saidas: Record<string, (string | null)[]>, motoId: string): Record<string, number> =>
  Object.fromEntries(Object.entries(saidas)
    .map(([tipo, motoIds]) => [tipo, motoIds.filter(id => id === motoId).length] as const)
    .filter(([, n]) => n > 0))

/** Apaga o que depende das motos (já conferidas sem venda nem dinheiro). Devolve o id da moto de cada linha apagada. */
async function apagarDependentes(tx: Tx, ids: string[]): Promise<Record<string, (string | null)[]>> {
  const os = await tx.select({ id: ordensServico.id, motoId: ordensServico.motoId }).from(ordensServico).where(inArray(ordensServico.motoId, ids))
  const osIds = os.map(o => o.id)
  const motoDaOs = new Map(os.map(o => [o.id, o.motoId]))
  const itens = osIds.length === 0 ? [] : await tx.select({ osId: osItens.osId }).from(osItens).where(inArray(osItens.osId, osIds))
  if (osIds.length > 0) {
    // O agendamento que virou OS continua na agenda, sem a OS; garantia e cupom de outra moto, idem.
    await tx.update(agendamentos).set({ osId: null }).where(inArray(agendamentos.osId, osIds))
    await tx.update(aprovacoesVenda).set({ osId: null }).where(inArray(aprovacoesVenda.osId, osIds))
    await tx.update(garantias).set({ osId: null }).where(inArray(garantias.osId, osIds))
    await tx.update(cuponsRevisao).set({ osId: null }).where(inArray(cuponsRevisao.osId, osIds))
  }
  const motoIds = (linhas: { motoId: string | null }[]) => linhas.map(l => l.motoId)
  return {
    os: os.length === 0 ? [] : motoIds(await tx.delete(ordensServico).where(inArray(ordensServico.id, osIds)).returning({ motoId: ordensServico.motoId })),
    itensDeOs: itens.map(i => motoDaOs.get(i.osId) ?? null),
    transferencias: motoIds(await tx.delete(transferencias).where(inArray(transferencias.motoId, ids)).returning({ motoId: transferencias.motoId })),
    garantias: motoIds(await tx.delete(garantias).where(inArray(garantias.motoId, ids)).returning({ motoId: garantias.motoId })),
    cupons: motoIds(await tx.delete(cuponsRevisao).where(inArray(cuponsRevisao.motoId, ids)).returning({ motoId: cuponsRevisao.motoId })),
    reservas: motoIds(await tx.delete(reservas).where(inArray(reservas.motoId, ids)).returning({ motoId: reservas.motoId })),
    pedidos: motoIds(await tx.delete(pedidosVenda).where(inArray(pedidosVenda.motoId, ids)).returning({ motoId: pedidosVenda.motoId })),
    aprovacoes: motoIds(await tx.delete(aprovacoesVenda).where(inArray(aprovacoesVenda.motoId, ids)).returning({ motoId: aprovacoesVenda.motoId })),
    historico: motoIds(await tx.delete(historicoEstoque).where(inArray(historicoEstoque.motoId, ids)).returning({ motoId: historicoEstoque.motoId })),
  }
}

/** Remove o lote inteiro ou nada. Uma linha no log por moto, com a contagem do que saiu junto. */
export async function removerMotos(usuario: UsuarioQueArquiva, motoIds: string[], motivo: string, confirmacao: string, exec: Exec = db) {
  if (!podeArquivarMotos(usuario.papel)) throw new RecusaUsuario('Sem permissão para remover motos.')
  const ids = [...new Set(motoIds)]
  if (!ids.every(ehUuid)) throw new RecusaUsuario(NAO_ENCONTRADA)

  return exec.transaction(async tx => {
    const doLote = await travarDoAlcance(tx, usuario, ids)
    // Impedimentos num comando depois da trava: o snapshot dele já vê a venda ou o pedido que quem
    // segurava a moto gravou. Quem chegar depois espera a trava e encontra a moto apagada.
    const achadas = await motosComImpedimentos(tx, inArray(motos.id, ids))
    const recusa = recusaDaRemocao({ motivo, confirmacao, motos: achadas.map(m => ({ chassi: m.chassi, impedimentos: impedimentosDa(m) })) })
    if (recusa) throw new RecusaUsuario(recusa)

    const saidas = await apagarDependentes(tx, ids)
    // A gravação repete a Conta e o alcance no where (AGENTS.md, isolamento), e confere as linhas.
    const removidas = await tx.delete(motos).where(doLote).returning({ id: motos.id })
    if (removidas.length !== ids.length) throw new RecusaUsuario(NAO_ENCONTRADA)
    await registrarNoLog(tx, 'moto_removida', usuario.id, achadas, motivo.trim(), m => ({ saiu: saiuDaMoto(saidas, m.id) }))
    return { removidas: removidas.length }
  })
}
