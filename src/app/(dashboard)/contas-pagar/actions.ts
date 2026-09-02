'use server'
import { db } from '@/lib/db'
import {
  contasPagar, contasPagarOcorrencias, lojas, usuarios,
  vendas, vendasPecas, ordensServico,
} from '@/lib/db/schema'
import { and, eq, gte, lte, lt, inArray, isNotNull, desc, asc, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { hojeBrt, inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'
import {
  isTipoConta, isBaseFormula, isMesReferencia, contaVigenteNoMes, vencimentoNoMes,
  mesApurado, ultimoDiaDoMes, valorAutomatico,
} from '@/lib/contas-pagar'
import { buscarDadosFolha, agregarFolha } from '@/lib/queries/folha'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(usuario)
  return { usuario, grupo }
}

// ─── Base das contas automáticas ──────────────────────────────────────────────

/**
 * Apura a base do mês informado (que é sempre o mês ANTERIOR ao da competência).
 *
 * Recorte por loja quando a conta é de uma loja; senão, todas as lojas do grupo.
 * Venda cancelada não entra porque cancelar APAGA a linha da venda — ver
 * cancelarVendaCompletaAction.
 */
async function apurarBase(base: string, mes: string, lojaIds: string[], grupoId: string): Promise<number> {
  if (lojaIds.length === 0) return 0
  const inicio = inicioDoDiaBrt(`${mes}-01`)
  const fim = fimDoDiaBrt(`${mes}-${String(ultimoDiaDoMes(mes)).padStart(2, '0')}`)

  const somaMotos = async (apenasComNf: boolean) => {
    const [r] = await db
      .select({ total: sql<string>`COALESCE(SUM(${vendas.valor}::numeric), 0)` })
      .from(vendas)
      .where(and(
        inArray(vendas.lojaId, lojaIds),
        gte(vendas.dataVenda, inicio),
        lte(vendas.dataVenda, fim),
        apenasComNf ? isNotNull(vendas.notaFiscalSaida) : undefined,
      ))
    return parseFloat(r?.total ?? '0')
  }

  const somaPecas = async () => {
    const [r] = await db
      .select({ total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)` })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIds),
        gte(vendasPecas.dataVenda, inicio),
        lte(vendasPecas.dataVenda, fim),
      ))
    return parseFloat(r?.total ?? '0')
  }

  const somaOS = async () => {
    const [r] = await db
      .select({ total: sql<string>`COALESCE(SUM(${ordensServico.valorTotal}::numeric), 0)` })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIds),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicio),
        lte(ordensServico.dataConclusao, fim),
      ))
    return parseFloat(r?.total ?? '0')
  }

  switch (base) {
    case 'venda_motos':        return somaMotos(false)
    case 'venda_motos_com_nf': return somaMotos(true)
    case 'venda_pecas':        return somaPecas()
    case 'faturamento_total': {
      const [motos, pecas, os] = await Promise.all([somaMotos(false), somaPecas(), somaOS()])
      return motos + pecas + os
    }
    // A folha é a única base que não é uma soma: sai do mesmo cálculo da tela de
    // folha (salário + comissão + premiação + ajuda de custo - adiantamentos), para
    // o compromisso não divergir do que a folha manda pagar. Custa ~13 consultas,
    // e é por isso que apurarBase é memoizada por chamada.
    //
    // `efetivo` e não `geral`: quando o valor real pago já foi informado na última
    // coluna da folha (migração 0086), é ele que vale; quem ainda está em branco
    // continua entrando pelo calculado. Assim o compromisso nunca encolhe só
    // porque a coluna está pela metade.
    case 'folha_pagamento': {
      const dados = await buscarDadosFolha({ mes, lojaIds, lojaIdsGrupo: lojaIds, grupoId })
      return agregarFolha(dados).totais.efetivo
    }
    // Mesma fonte da folha, e não uma soma direta de folha_adiantamentos: assim o
    // vale do dia 20 bate com o desconto que aparece na folha do dia 5. Só conta
    // funcionário ativo, e soma vale fixo com adiantamento avulso.
    case 'adiantamentos': {
      const dados = await buscarDadosFolha({ mes, lojaIds, lojaIdsGrupo: lojaIds, grupoId })
      return agregarFolha(dados).totais.adiantamentos
    }
    default: return 0
  }
}

// ─── Geração das ocorrências do mês ───────────────────────────────────────────

type ContaCadastro = typeof contasPagar.$inferSelect

/**
 * Garante que existe uma ocorrência de cada conta vigente no mês.
 *
 * Idempotente: o índice único (conta, competência) faz o insert repetido não
 * fazer nada. NUNCA sobrescreve uma ocorrência existente — ela pode já estar paga
 * ou ter tido o valor ajustado na mão.
 *
 * A exceção é a conta automática ainda NÃO paga: o valor é recalculado a cada
 * abertura, porque o mês anterior continua fechando (uma venda lançada com atraso
 * muda o imposto). Depois de paga, o valor congela — é o que foi efetivamente pago.
 */
async function garantirOcorrenciasDoMes(grupoId: string, lojaIdsGrupo: string[], mes: string) {
  const contas = await db
    .select()
    .from(contasPagar)
    .where(eq(contasPagar.grupoId, grupoId))

  const vigentes = contas.filter(c => contaVigenteNoMes(c, mes))
  if (vigentes.length === 0) return

  // Duas contas sobre a mesma base apuram uma vez só. Importa de verdade na base
  // 'folha_pagamento', que roda o cálculo inteiro da folha.
  const cache = new Map<string, Promise<number>>()

  for (const conta of vigentes) {
    const vencimento = vencimentoDaConta(conta, mes)
    if (!vencimento) continue

    const valor = await valorDaConta(conta, mes, lojaIdsGrupo, grupoId, cache)

    await db.insert(contasPagarOcorrencias).values({
      contaId: conta.id,
      competencia: mes,
      vencimento,
      valor: valor.toFixed(2),
    }).onConflictDoNothing({
      target: [contasPagarOcorrencias.contaId, contasPagarOcorrencias.competencia],
    })

    if (conta.tipo === 'automatica') {
      await db.update(contasPagarOcorrencias)
        .set({ valor: valor.toFixed(2) })
        .where(and(
          eq(contasPagarOcorrencias.contaId, conta.id),
          eq(contasPagarOcorrencias.competencia, mes),
          eq(contasPagarOcorrencias.pago, false),
        ))
    }
  }
}

/** Data de vencimento da conta naquele mês, ou null se ela não vence nesse mês. */
function vencimentoDaConta(conta: ContaCadastro, mes: string): string | null {
  if (conta.tipo === 'unica') {
    // A única só existe na competência da própria data.
    const data = conta.dataVencimento?.slice(0, 10)
    return data && data.startsWith(mes) ? data : null
  }
  if (!conta.diaVencimento) return null
  return vencimentoNoMes(mes, conta.diaVencimento)
}

async function valorDaConta(
  conta: ContaCadastro,
  mes: string,
  lojaIdsGrupo: string[],
  grupoId: string,
  cache: Map<string, Promise<number>>,
): Promise<number> {
  if (conta.tipo !== 'automatica') return parseFloat(conta.valor ?? '0')

  const lojaIds = conta.lojaId ? [conta.lojaId] : lojaIdsGrupo
  const mesBase = mesApurado(mes, conta.formulaMesRef)
  const chave = `${conta.formulaBase}|${mesBase}|${lojaIds.join(',')}`

  let apuracao = cache.get(chave)
  if (!apuracao) {
    apuracao = apurarBase(conta.formulaBase ?? '', mesBase, lojaIds, grupoId)
    cache.set(chave, apuracao)
  }

  return valorAutomatico(await apuracao, parseFloat(conta.formulaPercentual ?? '0'))
}

// ─── Leitura ──────────────────────────────────────────────────────────────────

export type OcorrenciaConta = {
  id: string
  contaId: string
  descricao: string
  categoria: string | null
  tipo: string
  lojaNome: string | null
  competencia: string
  vencimento: string
  valor: string
  pago: boolean
  pagoEm: string | null
  pagoPorNome: string | null
  observacao: string | null
  formulaBase: string | null
  formulaPercentual: string | null
  formulaMesRef: string
}

const CAMPOS_OCORRENCIA = {
  id: contasPagarOcorrencias.id,
  contaId: contasPagarOcorrencias.contaId,
  descricao: contasPagar.descricao,
  categoria: contasPagar.categoria,
  tipo: contasPagar.tipo,
  lojaNome: lojas.nome,
  competencia: contasPagarOcorrencias.competencia,
  vencimento: contasPagarOcorrencias.vencimento,
  valor: contasPagarOcorrencias.valor,
  pago: contasPagarOcorrencias.pago,
  pagoEm: contasPagarOcorrencias.pagoEm,
  pagoPorNome: usuarios.nome,
  observacao: contasPagarOcorrencias.observacao,
  formulaBase: contasPagar.formulaBase,
  formulaPercentual: contasPagar.formulaPercentual,
  formulaMesRef: contasPagar.formulaMesRef,
}

/**
 * Ocorrências do mês, mais TODAS as vencidas e não pagas de meses anteriores.
 *
 * As atrasadas vêm junto de propósito: o problema que originou o módulo é
 * justamente o compromisso sumir de vista quando a data passa. Elas seguem
 * aparecendo até alguém marcar como paga.
 */
export async function listarContasDoMesAction(mes: string) {
  const { grupo } = await checarAdmin()
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  await garantirOcorrenciasDoMes(grupo.id, lojaIdsGrupo, mes)

  const doMes = await db
    .select(CAMPOS_OCORRENCIA)
    .from(contasPagarOcorrencias)
    .innerJoin(contasPagar, eq(contasPagarOcorrencias.contaId, contasPagar.id))
    .leftJoin(lojas, eq(contasPagar.lojaId, lojas.id))
    .leftJoin(usuarios, eq(contasPagarOcorrencias.pagoPor, usuarios.id))
    .where(and(eq(contasPagar.grupoId, grupo.id), eq(contasPagarOcorrencias.competencia, mes)))
    .orderBy(asc(contasPagarOcorrencias.vencimento))

  const atrasadas = await db
    .select(CAMPOS_OCORRENCIA)
    .from(contasPagarOcorrencias)
    .innerJoin(contasPagar, eq(contasPagarOcorrencias.contaId, contasPagar.id))
    .leftJoin(lojas, eq(contasPagar.lojaId, lojas.id))
    .leftJoin(usuarios, eq(contasPagarOcorrencias.pagoPor, usuarios.id))
    .where(and(
      eq(contasPagar.grupoId, grupo.id),
      eq(contasPagarOcorrencias.pago, false),
      lt(contasPagarOcorrencias.competencia, mes),
    ))
    .orderBy(asc(contasPagarOcorrencias.vencimento))

  return { doMes: doMes as OcorrenciaConta[], atrasadas: atrasadas as OcorrenciaConta[] }
}

export type ContaRow = {
  id: string
  descricao: string
  categoria: string | null
  tipo: string
  valor: string | null
  dataVencimento: string | null
  diaVencimento: number | null
  formulaBase: string | null
  formulaPercentual: string | null
  formulaMesRef: string
  inicio: string | null
  fim: string | null
  ativo: boolean
  observacao: string | null
  lojaId: string | null
  lojaNome: string | null
}

export async function listarContasAction(): Promise<ContaRow[]> {
  const { grupo } = await checarAdmin()
  return db
    .select({
      id: contasPagar.id,
      descricao: contasPagar.descricao,
      categoria: contasPagar.categoria,
      tipo: contasPagar.tipo,
      valor: contasPagar.valor,
      dataVencimento: contasPagar.dataVencimento,
      diaVencimento: contasPagar.diaVencimento,
      formulaBase: contasPagar.formulaBase,
      formulaPercentual: contasPagar.formulaPercentual,
      formulaMesRef: contasPagar.formulaMesRef,
      inicio: contasPagar.inicio,
      fim: contasPagar.fim,
      ativo: contasPagar.ativo,
      observacao: contasPagar.observacao,
      lojaId: contasPagar.lojaId,
      lojaNome: lojas.nome,
    })
    .from(contasPagar)
    .leftJoin(lojas, eq(contasPagar.lojaId, lojas.id))
    .where(eq(contasPagar.grupoId, grupo.id))
    .orderBy(desc(contasPagar.ativo), asc(contasPagar.descricao))
}

// ─── Escrita ──────────────────────────────────────────────────────────────────

export type NovaContaInput = {
  descricao: string
  categoria: string
  lojaId: string | null
  tipo: string
  valor: number | null
  dataVencimento: string | null
  diaVencimento: number | null
  formulaBase: string | null
  formulaPercentual: number | null
  formulaMesRef: string
  inicio: string | null
  fim: string | null
  observacao: string
}

export async function criarContaAction(input: NovaContaInput) {
  const { usuario, grupo } = await checarAdmin()

  if (!input.descricao.trim()) throw new Error('Informe a descrição da conta')
  if (!isTipoConta(input.tipo)) throw new Error('Tipo de conta inválido')

  if (input.lojaId) {
    const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
    if (!lojaIdsGrupo.includes(input.lojaId)) throw new Error('Loja fora do grupo ativo')
  }

  if (input.tipo === 'unica') {
    if (!input.dataVencimento || !/^\d{4}-\d{2}-\d{2}$/.test(input.dataVencimento)) {
      throw new Error('Informe a data de vencimento')
    }
    if (!(Number(input.valor) > 0)) throw new Error('Informe um valor maior que zero')
  } else {
    const dia = Number(input.diaVencimento)
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) throw new Error('Dia de vencimento deve ser de 1 a 31')
  }

  if (input.tipo === 'recorrente' && !(Number(input.valor) > 0)) {
    throw new Error('Informe um valor maior que zero')
  }

  if (input.tipo === 'automatica') {
    if (!input.formulaBase || !isBaseFormula(input.formulaBase)) throw new Error('Escolha a base do cálculo')
    if (!(Number(input.formulaPercentual) > 0)) throw new Error('Informe o percentual do cálculo')
    if (!isMesReferencia(input.formulaMesRef)) throw new Error('Mês de referência inválido')
  }

  for (const mes of [input.inicio, input.fim]) {
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês de vigência inválido')
  }
  // Intervalo invertido não estoura em lugar nenhum: a conta só nunca vence, e
  // ninguém descobre até faltar um pagamento.
  if (input.inicio && input.fim && input.fim < input.inicio) {
    throw new Error('O fim da vigência não pode ser antes do início')
  }

  await db.insert(contasPagar).values({
    grupoId: grupo.id,
    lojaId: input.lojaId || null,
    descricao: input.descricao.trim(),
    categoria: input.categoria.trim() || null,
    tipo: input.tipo,
    valor: input.tipo === 'automatica' ? null : String(input.valor),
    dataVencimento: input.tipo === 'unica' ? input.dataVencimento : null,
    diaVencimento: input.tipo === 'unica' ? null : input.diaVencimento,
    formulaBase: input.tipo === 'automatica' ? input.formulaBase : null,
    formulaPercentual: input.tipo === 'automatica' ? String(input.formulaPercentual) : null,
    formulaMesRef: input.tipo === 'automatica' ? input.formulaMesRef : 'anterior',
    inicio: input.inicio || null,
    fim: input.fim || null,
    observacao: input.observacao.trim() || null,
    criadoPor: usuario.id,
  })

  revalidatePath('/contas-pagar')
  revalidatePath('/calendario')
}

async function contaDoGrupo(grupoId: string, contaId: string) {
  const [conta] = await db
    .select({ id: contasPagar.id })
    .from(contasPagar)
    .where(and(eq(contasPagar.id, contaId), eq(contasPagar.grupoId, grupoId)))
    .limit(1)
  if (!conta) throw new Error('Conta não encontrada no grupo ativo')
}

/** Desliga a conta sem apagar o histórico do que já venceu e foi pago. */
export async function alternarContaAtivaAction(contaId: string, ativo: boolean) {
  const { grupo } = await checarAdmin()
  await contaDoGrupo(grupo.id, contaId)
  await db.update(contasPagar).set({ ativo }).where(eq(contasPagar.id, contaId))
  revalidatePath('/contas-pagar')
  revalidatePath('/calendario')
}

/**
 * Apaga a conta e, em cascata, todas as ocorrências — inclusive as pagas.
 * Para parar de cobrar daqui pra frente sem perder o histórico, use
 * alternarContaAtivaAction.
 */
export async function excluirContaAction(contaId: string) {
  const { grupo } = await checarAdmin()
  await contaDoGrupo(grupo.id, contaId)
  await db.delete(contasPagar).where(eq(contasPagar.id, contaId))
  revalidatePath('/contas-pagar')
  revalidatePath('/calendario')
}

async function ocorrenciaDoGrupo(grupoId: string, ocorrenciaId: string) {
  const [row] = await db
    .select({ id: contasPagarOcorrencias.id, tipo: contasPagar.tipo })
    .from(contasPagarOcorrencias)
    .innerJoin(contasPagar, eq(contasPagarOcorrencias.contaId, contasPagar.id))
    .where(and(eq(contasPagarOcorrencias.id, ocorrenciaId), eq(contasPagar.grupoId, grupoId)))
    .limit(1)
  if (!row) throw new Error('Lançamento não encontrado no grupo ativo')
  return row
}

export async function marcarPagoAction(ocorrenciaId: string, pago: boolean) {
  const { usuario, grupo } = await checarAdmin()
  await ocorrenciaDoGrupo(grupo.id, ocorrenciaId)

  await db.update(contasPagarOcorrencias)
    .set(pago
      ? { pago: true, pagoEm: hojeBrt(), pagoPor: usuario.id }
      // Desmarcar limpa data e autor: deixar o carimbo de um pagamento desfeito
      // faria a tela dizer que alguém pagou algo que está em aberto.
      : { pago: false, pagoEm: null, pagoPor: null })
    .where(eq(contasPagarOcorrencias.id, ocorrenciaId))

  revalidatePath('/contas-pagar')
  revalidatePath('/calendario')
}

/**
 * Ajusta o valor de um mês específico (a conta de luz que veio diferente).
 *
 * Bloqueado nas automáticas: o valor delas é recalculado a cada abertura enquanto
 * não estão pagas, então a edição seria silenciosamente desfeita.
 */
export async function editarValorOcorrenciaAction(ocorrenciaId: string, valor: number) {
  const { grupo } = await checarAdmin()
  const row = await ocorrenciaDoGrupo(grupo.id, ocorrenciaId)

  if (row.tipo === 'automatica') {
    throw new Error('Conta automática tem o valor calculado — ajuste o percentual ou a base no cadastro')
  }
  if (!(valor > 0)) throw new Error('Informe um valor maior que zero')

  await db.update(contasPagarOcorrencias)
    .set({ valor: valor.toFixed(2) })
    .where(eq(contasPagarOcorrencias.id, ocorrenciaId))

  revalidatePath('/contas-pagar')
  revalidatePath('/calendario')
}

// ─── Camada do calendário ─────────────────────────────────────────────────────

export type ContaNoCalendario = {
  id: string
  descricao: string
  valor: string
  vencimento: string
  pago: boolean
}

/**
 * Contas que vencem no mês, para desenhar junto dos eventos.
 *
 * Materializa as ocorrências antes de ler, igual à tela de contas: sem isso um
 * compromisso recorrente só apareceria no calendário depois de alguém abrir
 * /contas-pagar naquele mês.
 *
 * Só quem tem acesso ao módulo enxerga — o calendário é de TODOS os papéis, e
 * valor de aluguel e imposto não é informação de balcão. Quem chama é a página do
 * calendário, que já checa a permissão antes.
 */
export async function listarContasDoCalendarioAction(mes: string): Promise<ContaNoCalendario[]> {
  const { grupo } = await checarAdmin()
  const usuario = await getUsuarioLogado()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  await garantirOcorrenciasDoMes(grupo.id, lojaIdsGrupo, mes)

  return db
    .select({
      id: contasPagarOcorrencias.id,
      descricao: contasPagar.descricao,
      valor: contasPagarOcorrencias.valor,
      vencimento: contasPagarOcorrencias.vencimento,
      pago: contasPagarOcorrencias.pago,
    })
    .from(contasPagarOcorrencias)
    .innerJoin(contasPagar, eq(contasPagarOcorrencias.contaId, contasPagar.id))
    .where(and(eq(contasPagar.grupoId, grupo.id), eq(contasPagarOcorrencias.competencia, mes)))
    .orderBy(asc(contasPagarOcorrencias.vencimento))
}
