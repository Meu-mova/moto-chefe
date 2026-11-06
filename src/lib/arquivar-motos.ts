/**
 * Arquivar moto (#677, #688): a moto sai de todas as telas e só o RADAR a acha.
 * Busca com a Conta e os grupos que a pessoa vê no where; moto de outra Conta, fora do
 * alcance, já arquivada ou inexistente recebe a mesma frase. As recusas vêm da regra pura.
 */
import { and, eq, exists, ilike, inArray, or, sql, type SQL } from 'drizzle-orm'
import { db } from '@/lib/db'
import { aprovacoesVenda, garantias, lojas, modelos, motos, ordensServico, pedidosVenda, reservas, transferencias, vendas } from '@/lib/db/schema'
import { lojasDoEscopo } from '@/lib/conta'
import { listarGruposVisiveis } from '@/lib/grupo'
import { nomeDoModeloNaLoja } from '@/lib/modelos-da-conta'
import { motoNaoArquivada } from '@/lib/queries/showroom'
import { STATUS_OS_ABERTA } from '@/lib/os-transicao'
import { registrarAcaoSensivel } from '@/lib/log-acoes'
import { RecusaUsuario } from '@/lib/resultado-action'
import { ehUuid } from '@/lib/uuid'
import { motivoQueImpedeArquivar, podeArquivarMotos, recusaDoLote, type PendenciasDaMoto } from '@/lib/arquivar-moto-regras'

type Exec = Pick<typeof db, 'select' | 'update' | 'insert' | 'transaction'>

export type UsuarioQueArquiva = Parameters<typeof listarGruposVisiveis>[0] & {
  id: string
  contaId: string | null
  grupoLiberado?: string | null
}

const NAO_ENCONTRADA = 'Moto não encontrada'
const LIMITE_DA_BUSCA = 50

// A query tem join: a coluna da moto precisa ir qualificada na subconsulta (AGENTS.md, Drizzle).
const daMoto = sql.raw('"motos"."id"')
type ComMoto = typeof reservas | typeof pedidosVenda | typeof aprovacoesVenda | typeof transferencias | typeof garantias | typeof vendas | typeof ordensServico
const temLinha = (exec: Exec, tabela: ComMoto, condicao?: SQL) =>
  sql<boolean>`${exists(exec.select({ um: sql`1` }).from(tabela).where(and(eq(tabela.motoId, daMoto), condicao)))}`

/** Grupos que a pessoa vê (o admin_geral vê todos), sempre dentro da Conta da sessão. null = nenhum. */
async function alcance(usuario: UsuarioQueArquiva, exec: Exec): Promise<SQL | undefined | null> {
  if (usuario.papel === 'admin_geral') return undefined
  if (!usuario.contaId) return null
  const grupoIds = (await listarGruposVisiveis(usuario, undefined, exec)).map(g => g.id)
  if (grupoIds.length === 0) return null
  return and(
    inArray(motos.lojaId, lojasDoEscopo(usuario)),
    inArray(motos.lojaId, exec.select({ id: lojas.id }).from(lojas).where(inArray(lojas.grupoId, grupoIds))),
  )
}

function motosComPendencias(exec: Exec, onde: SQL | undefined) {
  const osAberta = inArray(ordensServico.status, [...STATUS_OS_ABERTA])
  return exec.select({
    id: motos.id,
    chassi: motos.chassi,
    nfEntrada: motos.notaFiscalEntrada,
    lojaId: motos.lojaId,
    loja: lojas.nome,
    modelo: nomeDoModeloNaLoja(motos.lojaId),
    temVenda: temLinha(exec, vendas),
    reservaAtiva: temLinha(exec, reservas, eq(reservas.status, 'ativa')),
    pedidoPendente: temLinha(exec, pedidosVenda, eq(pedidosVenda.status, 'pendente')),
    aprovacaoPendente: temLinha(exec, aprovacoesVenda, eq(aprovacoesVenda.status, 'pendente')),
    transferenciaPendente: temLinha(exec, transferencias, eq(transferencias.status, 'pendente')),
    garantiaAtiva: temLinha(exec, garantias, eq(garantias.status, 'ativa')),
    osAbertaExiste: temLinha(exec, ordensServico, osAberta),
    // Número da primeira OS aberta, para a frase "Feche a OS nº X".
    osAbertaNumero: sql<number | null>`(select min(${ordensServico.numero}) from ${ordensServico} where ${ordensServico.motoId} = ${daMoto} and ${osAberta})`,
  })
    .from(motos)
    .innerJoin(lojas, eq(lojas.id, motos.lojaId))
    .innerJoin(modelos, eq(modelos.id, motos.modeloId))
    .where(and(motoNaoArquivada(), onde))
}

type LinhaDaMoto = Awaited<ReturnType<typeof motosComPendencias>>[number]

const pendenciasDa = (m: LinhaDaMoto): PendenciasDaMoto => ({
  temVenda: m.temVenda, reservaAtiva: m.reservaAtiva, pedidoPendente: m.pedidoPendente,
  aprovacaoPendente: m.aprovacaoPendente, transferenciaPendente: m.transferenciaPendente,
  garantiaAtiva: m.garantiaAtiva, osAberta: m.osAbertaExiste ? { numero: m.osAbertaNumero } : null,
})

/** Motos para o passo "Escolher": chassi ou NF de entrada, não arquivadas, com o motivo de não poder. */
export async function motosParaArquivar(usuario: UsuarioQueArquiva, termo: string, exec: Exec = db) {
  const busca = termo.trim()
  if (!podeArquivarMotos(usuario.papel) || !busca) return []
  const onde = await alcance(usuario, exec)
  if (onde === null) return []
  const linhas = await motosComPendencias(exec, and(onde, or(ilike(motos.chassi, `%${busca}%`), ilike(motos.notaFiscalEntrada, `%${busca}%`))))
    .orderBy(motos.chassi)
    .limit(LIMITE_DA_BUSCA)
  return linhas.map(m => ({
    id: m.id, chassi: m.chassi, modelo: m.modelo, loja: m.loja, nfEntrada: m.nfEntrada,
    bloqueio: motivoQueImpedeArquivar(pendenciasDa(m)),
  }))
}

/** Arquiva o lote inteiro ou nada. Uma linha no log por moto. */
export async function arquivarMotos(usuario: UsuarioQueArquiva, motoIds: string[], motivo: string, exec: Exec = db) {
  if (!podeArquivarMotos(usuario.papel)) throw new RecusaUsuario('Sem permissão para arquivar motos.')
  const ids = [...new Set(motoIds)]
  if (!ids.every(ehUuid)) throw new RecusaUsuario(NAO_ENCONTRADA)

  return exec.transaction(async tx => {
    const onde = await alcance(usuario, tx)
    const travadas = onde === null || ids.length === 0 ? [] : await tx.select({ id: motos.id }).from(motos)
      .where(and(motoNaoArquivada(), onde, inArray(motos.id, ids))).for('update')
    if (travadas.length !== ids.length) throw new RecusaUsuario(NAO_ENCONTRADA)
    // Pendências num comando depois da trava: o snapshot dele já vê a reserva ou o pedido que
    // quem segurava a moto gravou (no mesmo comando do lock, a subconsulta ficaria no snapshot antigo).
    const achadas = await motosComPendencias(tx, inArray(motos.id, ids))

    const recusa = recusaDoLote({ motivo, motos: achadas.map(m => ({ chassi: m.chassi, pendencias: pendenciasDa(m) })) })
    if (recusa) throw new RecusaUsuario(recusa)

    const texto = motivo.trim()
    await tx.update(motos)
      .set({ arquivadaEm: new Date(), arquivadaPor: usuario.id, motivoArquivo: texto })
      .where(inArray(motos.id, ids))
    for (const m of achadas) {
      await registrarAcaoSensivel({
        tipo: 'moto_arquivada', usuarioId: usuario.id, lojaId: m.lojaId,
        detalhe: { motoId: m.id, chassi: m.chassi, modelo: m.modelo, loja: m.loja, nfEntrada: m.nfEntrada, motivo: texto },
      }, tx)
    }
    return { arquivadas: achadas.length }
  })
}
