// Importação da maquininha Mercado Pago (Point) de um grupo: cartão vai para conciliacoes_cartao
// (casado com a venda do grupo), Pix vai para pix_recebimentos_mcp, estorno marca as linhas que já
// existem. A credencial é do grupo (ADR 0010) e toda leitura e gravação leva o grupo_id.
import { and, asc, eq, isNotNull, ne, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { conciliacoesCartao, grupos, pixRecebimentosMcp } from '@/lib/db/schema'
import { decifrar } from '@/lib/cripto'
import { RecusaUsuario } from '@/lib/resultado-action'
import type { Operadora } from '@/lib/conciliacao-cartao'
import { casarPorAutorizacao, casarPorValor, lojaIdsDoGrupo, type Alvos } from '@/lib/conciliacao-casamento'
import { classificarPagamento, type Classificacao } from '@/lib/conciliacao-mercadopago'
import { buscarPagamentosAlterados } from './point'

export type ResultadoImportacaoMp = {
  importadas: number; duplicadas: number; conciliadas: number; pixNovos: number; estornos: number; ignorados: number
}

const OPERADORA: Operadora = 'mercadopago'
const JANELA_DIAS = 7

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0]
type Cartao = Extract<Classificacao, { tipo: 'cartao' }>['transacao']
type Pix = Extract<Classificacao, { tipo: 'pix' }>['pix']

/** Grupos com credencial do Mercado Pago cadastrada (para o cron diário). */
export async function gruposComMercadoPago(): Promise<{ id: string; nome: string }[]> {
  return db.select({ id: grupos.id, nome: grupos.nome }).from(grupos)
    .where(and(isNotNull(grupos.mpAccessToken), eq(grupos.ativo, true)))
    .orderBy(asc(grupos.nome))
}

export async function importarMercadoPagoDoGrupo(
  grupoId: string,
  opts: { agora?: Date; buscar?: typeof buscarPagamentosAlterados } = {},
): Promise<ResultadoImportacaoMp> {
  const [grupo] = await db.select({ token: grupos.mpAccessToken, mpUserId: grupos.mpUserId })
    .from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  // Grupo inexistente e grupo sem token recebem a mesma frase.
  if (!grupo?.token) throw new RecusaUsuario('Este grupo não tem credencial do Mercado Pago.')
  const token = decifrar(grupo.token).toString('utf8')

  const fim = opts.agora ?? new Date()
  const inicio = new Date(fim.getTime() - JANELA_DIAS * 24 * 60 * 60 * 1000)
  // Tudo da API antes de gravar: erro (401, rede) propaga e nada daquele grupo é gravado.
  const pagamentos = await (opts.buscar ?? buscarPagamentosAlterados)(token, { inicio, fim })

  const r: ResultadoImportacaoMp = { importadas: 0, duplicadas: 0, conciliadas: 0, pixNovos: 0, estornos: 0, ignorados: 0 }
  const motivos = new Map<string, number>()
  const contaId = grupo.mpUserId ?? 'mercadopago'

  await db.transaction(async tx => {
    const lojaIds = await lojaIdsDoGrupo(tx, grupoId)
    for (const p of pagamentos) {
      const c = classificarPagamento(p)
      if (c.tipo === 'ignorar') {
        r.ignorados++
        motivos.set(c.motivo, (motivos.get(c.motivo) ?? 0) + 1)
      } else if (c.tipo === 'cartao') {
        const res = await gravarCartao(tx, grupoId, lojaIds, c.transacao)
        if (res === 'duplicada') r.duplicadas++
        else { r.importadas++; if (res === 'conciliada') r.conciliadas++ }
      } else if (c.tipo === 'pix') {
        if (await gravarPix(tx, grupoId, contaId, c.pix)) r.pixNovos++
      } else {
        if (await marcarEstorno(tx, grupoId, c.meio, c.chave)) r.estornos++
      }
    }
  })

  // Só os motivos e as contagens: nada do pagamento nem do token vai para o log.
  if (motivos.size > 0) console.log('[mercadopago-importar]', `ignorados=${JSON.stringify(Object.fromEntries(motivos))}`)
  return r
}

const temAlvo = (a: Alvos) => (a.vendaId ?? a.pecaVendaId ?? a.osId) !== null

async function gravarCartao(tx: Tx, grupoId: string, lojaIds: string[], t: Cartao): Promise<'duplicada' | 'conciliada' | 'pendente'> {
  const nsu = t.nsu!
  // Já gravada neste grupo: não casa de novo nem mexe no vínculo.
  const [existente] = await tx.select({ id: conciliacoesCartao.id }).from(conciliacoesCartao)
    .where(and(eq(conciliacoesCartao.grupoId, grupoId), eq(conciliacoesCartao.operadora, OPERADORA), eq(conciliacoesCartao.nsu, nsu)))
    .limit(1)
  if (existente) return 'duplicada'

  const porAutorizacao = t.autorizacao ? await casarPorAutorizacao(tx, lojaIds, t.autorizacao) : null
  const alvos = porAutorizacao && temAlvo(porAutorizacao) ? porAutorizacao : await casarPorValor(tx, lojaIds, t)
  const casou = temAlvo(alvos)

  const inseridas = await tx.insert(conciliacoesCartao).values({
    grupoId,
    operadora: OPERADORA,
    dataTransacao: t.dataTransacao,
    nsu,
    autorizacao: t.autorizacao ?? null,
    valorBruto: String(t.valorBruto),
    valorLiquido: t.valorLiquido != null ? String(t.valorLiquido) : null,
    parcelas: t.parcelas,
    tipo: t.tipo,
    status: t.status,
    vendaId: alvos.vendaId,
    pecaVendaId: alvos.pecaVendaId,
    osId: alvos.osId,
    conciliado: casou,
    conciliadoEm: casou ? new Date() : null,
    rawData: t.rawData ?? null,
  })
    // Índice único parcial da migração 0182: (grupo_id, operadora, nsu) where nsu is not null.
    .onConflictDoNothing({
      target: [conciliacoesCartao.grupoId, conciliacoesCartao.operadora, conciliacoesCartao.nsu],
      where: sql`nsu is not null`,
    })
    .returning({ id: conciliacoesCartao.id })
  if (inseridas.length === 0) return 'duplicada'
  return casou ? 'conciliada' : 'pendente'
}

/** true só quando a linha entrou agora (xmax = 0); reescrita do mesmo grupo e linha de outro grupo não contam. */
async function gravarPix(tx: Tx, grupoId: string, contaId: string, pix: Pix): Promise<boolean> {
  const linhas = await tx.insert(pixRecebimentosMcp).values({
    grupoId,
    contaId,
    banco: 'Mercado Pago',
    transacaoId: pix.transacaoId,
    data: new Date(pix.data),
    valor: String(pix.valor),
    pagadorNome: pix.pagadorNome,
    tipoOperacao: 'PIX',
  })
    .onConflictDoUpdate({
      target: pixRecebimentosMcp.transacaoId,
      // Como o pix-sync: só o nome do pagador, e sem apagar o que já temos. Vínculos e status ficam.
      set: { pagadorNome: sql`coalesce(excluded.pagador_nome, ${pixRecebimentosMcp.pagadorNome})` },
      // transacao_id é único no sistema todo: a linha de outro grupo nunca é reescrita.
      setWhere: eq(pixRecebimentosMcp.grupoId, grupoId),
    })
    .returning({ novo: sql<boolean>`(xmax = 0)` })
  return linhas[0]?.novo === true
}

/**
 * Marca a linha do grupo como estornada, sem desfazer os vínculos. Sem linha: não faz nada. A linha já
 * estornada fica de fora para o estorno não ser contado de novo em cada rodada da janela de 7 dias.
 */
async function marcarEstorno(tx: Tx, grupoId: string, meio: 'cartao' | 'pix', chave: string): Promise<boolean> {
  if (meio === 'cartao') {
    const linhas = await tx.update(conciliacoesCartao)
      .set({ status: 'estornado', conciliado: false })
      .where(and(eq(conciliacoesCartao.grupoId, grupoId), eq(conciliacoesCartao.operadora, OPERADORA), eq(conciliacoesCartao.nsu, chave), ne(conciliacoesCartao.status, 'estornado')))
      .returning({ id: conciliacoesCartao.id })
    return linhas.length > 0
  }
  const linhas = await tx.update(pixRecebimentosMcp)
    .set({ status: 'estornado' })
    .where(and(eq(pixRecebimentosMcp.grupoId, grupoId), eq(pixRecebimentosMcp.transacaoId, chave), ne(pixRecebimentosMcp.status, 'estornado')))
    .returning({ id: pixRecebimentosMcp.id })
  return linhas.length > 0
}
