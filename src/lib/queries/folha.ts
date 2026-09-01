// Cálculo da folha de pagamento — única fonte da verdade.
//
// Vive aqui, e não dentro da página, porque a folha é lida em dois lugares: a
// tela /folha-pagamento e a versão imprimível que vai para a contabilidade. Se
// cada uma tivesse sua cópia do cálculo, as duas envelheceriam separadas e um
// dia o papel deixaria de bater com a tela.
//
// A divisão em duas funções é o que torna a regra testável: `buscarDadosFolha`
// faz I/O e `agregarFolha` é pura, então dá para provar as regras de comissão
// sem banco (ver folha.test.ts).

import { db } from '@/lib/db'
import {
  usuarios, lojas, funcionariosConfig, premiacaoFaixas,
  vendas, vendasPecas, ordensServico, conciliacoesCartao, folhaAjustesBase, folhaAdiantamentos,
} from '@/lib/db/schema'
import { eq, ne, inArray, and, gte, lte, sql } from 'drizzle-orm'
import { inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'
import { calcularPremiacao } from '@/lib/premiacao'
import { resolverBaseComissao, type TotaisBase } from '@/lib/folha'
import { temPapel } from '@/lib/auth'

export type DadosFolha = {
  funcionarios: { id: string; nome: string; papel: string; papeisExtras: string[] | null; lojaId: string | null; lojaNome: string }[]
  configs: { usuarioId: string; salario: string; comissaoPercentual: string; ajudaCusto: string | null; ativo: boolean; baseComissao: string }[]
  faixas: { id: string; valorMinimoVendas: string; premiacao: string }[]
  vendasPorVendedor: { vendedorId: string; total: string }[]
  pecasPorVendedor: { vendedorId: string; total: string }[]
  osPorMecanico: { mecanicoId: string | null; total: string }[]
  osPecasPorAbertaPor: { abertaPor: string; total: string }[]
  motosPorLoja: { lojaId: string; total: string }[]
  pecasPorLoja: { lojaId: string; total: string }[]
  osPecasPorLoja: { lojaId: string; total: string }[]
  ajustes: { id: string; lojaId: string; lojaNome: string; tipo: string; usuarioId: string | null; usuarioNome: string | null; valor: string; observacao: string | null }[]
  /** Adiantamento salarial do mês. Desconta do total a pagar — não entra em caixa nem despesa. */
  adiantamentos: { id: string; lojaId: string; lojaNome: string; usuarioId: string; usuarioNome: string | null; valor: string; data: string | null; observacao: string | null }[]
  lojas: { id: string; nome: string }[]
  /** Todos os funcionários do GRUPO, ignorando o filtro de loja. Só a aba Ajustes usa. */
  funcionariosGrupo: { id: string; nome: string; lojaId: string | null }[]
}

export type FuncionarioFolha = {
  id: string
  nome: string
  papel: string
  lojaNome: string
  salario: number
  comissaoPercentual: number
  ajudaCusto: number
  ativo: boolean
  baseComissao: number
  comissao: number
  premiacao: number
  /** Já adiantado no mês. Sai do totalPagar; não é clamped em zero de propósito —
   *  adiantamento maior que a folha é erro de lançamento e tem que aparecer. */
  adiantamento: number
  totalPagar: number
}

export type FolhaDoMes = {
  todos: FuncionarioFolha[]
  ativos: FuncionarioFolha[]
  totais: { salarios: number; comissoes: number; premiacoes: number; ajudaCusto: number; adiantamentos: number; geral: number }
}

// Valor líquido por venda: parte não paga em cartão fica como está; a parte paga em cartão e já
// conciliada é trocada pelo valor líquido (descontada a taxa da operadora). Comissão e premiação
// OTE de vendedor são calculadas sobre esse valor, não sobre o bruto da venda.
function valorLiquidoExpr() {
  return sql`(
    ${vendas.valor}::numeric
    - COALESCE((SELECT SUM(${conciliacoesCartao.valorBruto}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
    + COALESCE((SELECT SUM(${conciliacoesCartao.valorLiquido}::numeric)
                FROM ${conciliacoesCartao}
                WHERE ${conciliacoesCartao.vendaId} = ${vendas.id}
                  AND ${conciliacoesCartao.conciliado} = true), 0)
  )`
}

/**
 * Busca tudo que a folha do mês precisa.
 *
 * `lojaIds` é o recorte do CÁLCULO (a loja filtrada, ou todas as do grupo).
 * `lojaIdsGrupo` é o grupo inteiro e serve só ao que não é cálculo: a lista de
 * lojas do seletor e a lista de ajustes da aba Ajustes. Sem essa separação,
 * filtrar uma loja apagaria as outras opções do próprio seletor — não haveria
 * como voltar — e encolheria silenciosamente a aba Ajustes.
 */
export async function buscarDadosFolha({
  mes,
  lojaIds,
  lojaIdsGrupo = lojaIds,
  grupoId,
}: {
  mes: string
  lojaIds: string[]
  lojaIdsGrupo?: string[]
  grupoId: string
}): Promise<DadosFolha> {
  const [ano, mesNum] = mes.split('-').map(Number)
  // Bordas do mês no calendário de Brasília, não em UTC. Montar a janela com
  // Date.UTC fazia "julho" valer de 30/06 21:00 a 31/07 20:59 daqui — e o limite
  // superior inclusivo ainda deixava o primeiro instante do mês seguinte contar
  // duas vezes. Ver inicioDoDiaBrt/fimDoDiaBrt em @/lib/data-venda.
  const ultimoDia = new Date(Date.UTC(ano, mesNum, 0)).getUTCDate()
  const inicioTs = inicioDoDiaBrt(`${mes}-01`)
  const fimTs = fimDoDiaBrt(`${mes}-${String(ultimoDia).padStart(2, '0')}`)

  const [
    funcionarios, configs, faixas, vendasPorVendedor, pecasPorVendedor, osPorMecanico, osPecasPorAbertaPor,
    motosPorLoja, pecasPorLoja, osPecasPorLoja, ajustes, adiantamentos, lojasDoGrupo, funcionariosGrupo,
  ] = await Promise.all([
    db
      .select({
        id: usuarios.id,
        nome: usuarios.nome,
        papel: usuarios.papel,
        papeisExtras: usuarios.papeisExtras,
        lojaId: usuarios.lojaId,
        lojaNome: lojas.nome,
      })
      .from(usuarios)
      .innerJoin(lojas, eq(usuarios.lojaId, lojas.id))
      .where(inArray(usuarios.lojaId, lojaIds)),

    db.select().from(funcionariosConfig),

    db.select().from(premiacaoFaixas).where(eq(premiacaoFaixas.grupoId, grupoId)),

    db
      .select({
        vendedorId: vendas.vendedorId,
        total: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
      })
      .from(vendas)
      .where(and(
        inArray(vendas.lojaId, lojaIds),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
      ))
      .groupBy(vendas.vendedorId),

    db
      .select({
        vendedorId: vendasPecas.vendedorId,
        total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .where(and(
        inArray(vendasPecas.lojaId, lojaIds),
        gte(vendasPecas.dataVenda, inicioTs),
        lte(vendasPecas.dataVenda, fimTs),
      ))
      .groupBy(vendasPecas.vendedorId),

    // Só a mão de obra (valorServicos) entra na comissão do mecânico — peças usadas na OS
    // vão pra base do aux_adm (ver osPecasPorAbertaPor), não pra dele.
    db
      .select({
        mecanicoId: ordensServico.mecanicoId,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIds),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.mecanicoId),

    // Peças usadas dentro de OS (os_itens tipo=peca) creditadas a quem abriu a OS — não há
    // "vendedor" de peça em OS, e só GESTORES (que inclui aux_adm) abrem OS.
    db
      .select({
        abertaPor: ordensServico.abertaPor,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIds),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.abertaPor),

    // ─── Totais por loja ──────────────────────────────────────────────────────
    // Existem porque vários aux_adm recebem percentual sobre o que a LOJA vendeu,
    // não sobre o que eles mesmos venderam.
    //
    // Venda dos donos (admin_geral) fica de fora: é moto particular passando pela
    // loja, não faturamento dela, e não pode virar comissão de ninguém. Isso é
    // consistente com o resto do módulo, onde admin_geral nem entra na folha
    // (lojaId nulo). Não afeta base individual — dono não tem comissão.
    db
      .select({
        lojaId: vendas.lojaId,
        total: sql<string>`COALESCE(SUM(${valorLiquidoExpr()}), 0)`,
      })
      .from(vendas)
      .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
      .where(and(
        inArray(vendas.lojaId, lojaIds),
        gte(vendas.dataVenda, inicioTs),
        lte(vendas.dataVenda, fimTs),
        ne(usuarios.papel, 'admin_geral'),
      ))
      .groupBy(vendas.lojaId),

    db
      .select({
        lojaId: vendasPecas.lojaId,
        total: sql<string>`COALESCE(SUM(${vendasPecas.valorTotal}::numeric), 0)`,
      })
      .from(vendasPecas)
      .innerJoin(usuarios, eq(vendasPecas.vendedorId, usuarios.id))
      .where(and(
        inArray(vendasPecas.lojaId, lojaIds),
        gte(vendasPecas.dataVenda, inicioTs),
        lte(vendasPecas.dataVenda, fimTs),
        ne(usuarios.papel, 'admin_geral'),
      ))
      .groupBy(vendasPecas.lojaId),

    db
      .select({
        lojaId: ordensServico.lojaId,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorPecas}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIds),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.lojaId),

    // Escopo de GRUPO de propósito: a aba Ajustes não muda com o filtro de loja.
    // Ajuste de outra loja não contamina o cálculo da loja filtrada — os
    // funcionários também estão filtrados, então essas chaves de mapa nunca são lidas.
    db
      .select({
        id: folhaAjustesBase.id,
        lojaId: folhaAjustesBase.lojaId,
        lojaNome: lojas.nome,
        tipo: folhaAjustesBase.tipo,
        usuarioId: folhaAjustesBase.usuarioId,
        usuarioNome: usuarios.nome,
        valor: folhaAjustesBase.valor,
        observacao: folhaAjustesBase.observacao,
      })
      .from(folhaAjustesBase)
      .innerJoin(lojas, eq(folhaAjustesBase.lojaId, lojas.id))
      .leftJoin(usuarios, eq(folhaAjustesBase.usuarioId, usuarios.id))
      .where(and(
        inArray(folhaAjustesBase.lojaId, lojaIdsGrupo),
        eq(folhaAjustesBase.mes, mes),
      )),

    // Escopo de GRUPO pelo mesmo motivo dos ajustes: a aba de adiantamentos não
    // encolhe com o filtro de loja. O desconto em si é por pessoa, e as pessoas já
    // estão filtradas — adiantamento de outra loja nunca é lido no cálculo.
    db
      .select({
        id: folhaAdiantamentos.id,
        lojaId: folhaAdiantamentos.lojaId,
        lojaNome: lojas.nome,
        usuarioId: folhaAdiantamentos.usuarioId,
        usuarioNome: usuarios.nome,
        valor: folhaAdiantamentos.valor,
        data: folhaAdiantamentos.data,
        observacao: folhaAdiantamentos.observacao,
      })
      .from(folhaAdiantamentos)
      .innerJoin(lojas, eq(folhaAdiantamentos.lojaId, lojas.id))
      .leftJoin(usuarios, eq(folhaAdiantamentos.usuarioId, usuarios.id))
      .where(and(
        inArray(folhaAdiantamentos.lojaId, lojaIdsGrupo),
        eq(folhaAdiantamentos.mes, mes),
      )),

    // Idem: o seletor precisa de todas as lojas do grupo, senão filtrar uma
    // loja tira as outras da lista e prende o usuário nela.
    db.select({ id: lojas.id, nome: lojas.nome }).from(lojas).where(inArray(lojas.id, lojaIdsGrupo)).orderBy(lojas.nome),

    // Idem: lançar um ajuste de outra loja tem que continuar possível com o
    // filtro ligado, então o seletor de funcionário da aba Ajustes vê o grupo todo.
    db
      .select({ id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId })
      .from(usuarios)
      .where(inArray(usuarios.lojaId, lojaIdsGrupo)),
  ])

  return {
    funcionarios, configs, faixas, vendasPorVendedor, pecasPorVendedor, osPorMecanico, osPecasPorAbertaPor,
    motosPorLoja, pecasPorLoja, osPecasPorLoja, ajustes, adiantamentos, lojas: lojasDoGrupo, funcionariosGrupo,
  }
}

/** Aplica as regras de comissão, premiação e totais. Pura: não toca no banco. */
export function agregarFolha(dados: DadosFolha): FolhaDoMes {
  const configPorUsuario = new Map(dados.configs.map(c => [c.usuarioId, c]))
  const vendasPorId = new Map(dados.vendasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total)]))
  const osPorId = new Map(dados.osPorMecanico.filter(o => o.mecanicoId).map(o => [o.mecanicoId as string, parseFloat(o.total)]))
  const osPecasPorId = new Map(dados.osPecasPorAbertaPor.map(o => [o.abertaPor, parseFloat(o.total)]))
  const pecasPorId = new Map(
    dados.pecasPorVendedor.map(v => [v.vendedorId, parseFloat(v.total) + (osPecasPorId.get(v.vendedorId) ?? 0)]),
  )
  // Cobre quem abriu OS com peça mas não tem venda de peça avulsa no período
  for (const [usuarioId, valor] of osPecasPorId) {
    if (!pecasPorId.has(usuarioId)) pecasPorId.set(usuarioId, valor)
  }

  const motosPorLojaId = new Map(dados.motosPorLoja.map(l => [l.lojaId, parseFloat(l.total)]))
  const pecasPorLojaId = new Map(dados.pecasPorLoja.map(l => [l.lojaId, parseFloat(l.total)]))
  for (const l of dados.osPecasPorLoja) {
    pecasPorLojaId.set(l.lojaId, (pecasPorLojaId.get(l.lojaId) ?? 0) + parseFloat(l.total))
  }

  // Um ajuste representa uma venda real da loja: soma sempre à base da LOJA e,
  // quando aponta um funcionário, também à base individual dele. Não é ou-um-ou-outro
  // — se estivesse lançado no sistema, contaria nos dois lugares.
  const somar = (mapa: Map<string, number>, chave: string | null, valor: number) => {
    if (!chave) return
    mapa.set(chave, (mapa.get(chave) ?? 0) + valor)
  }
  for (const a of dados.ajustes) {
    const valor = parseFloat(a.valor)
    if (a.tipo === 'motos') {
      somar(motosPorLojaId, a.lojaId, valor)
      somar(vendasPorId, a.usuarioId, valor)
    } else if (a.tipo === 'pecas') {
      somar(pecasPorLojaId, a.lojaId, valor)
      somar(pecasPorId, a.usuarioId, valor)
    } else if (a.tipo === 'servicos') {
      somar(osPorId, a.usuarioId, valor)
    }
  }

  // Vários adiantamentos no mesmo mês somam para a mesma pessoa.
  const adiantadoPorId = new Map<string, number>()
  for (const a of dados.adiantamentos) {
    adiantadoPorId.set(a.usuarioId, (adiantadoPorId.get(a.usuarioId) ?? 0) + parseFloat(a.valor))
  }

  const todos = dados.funcionarios.map(f => {
    const config = configPorUsuario.get(f.id)
    const salario = config ? parseFloat(config.salario) : 0
    const comissaoPercentual = config ? parseFloat(config.comissaoPercentual) : 0
    const ajudaCusto = config?.ajudaCusto ? parseFloat(config.ajudaCusto) : 0
    const ativo = config?.ativo ?? true

    const totais: TotaisBase = {
      propriasMotos:    vendasPorId.get(f.id) ?? 0,
      propriasPecas:    pecasPorId.get(f.id) ?? 0,
      propriosServicos: osPorId.get(f.id) ?? 0,
      lojaMotos:        f.lojaId ? (motosPorLojaId.get(f.lojaId) ?? 0) : 0,
      lojaPecas:        f.lojaId ? (pecasPorLojaId.get(f.lojaId) ?? 0) : 0,
    }
    const baseComissao = resolverBaseComissao(config?.baseComissao ?? 'padrao', f.papel, totais)

    const comissao = baseComissao * (comissaoPercentual / 100)
    // OTE sempre sobre as motos que a própria pessoa vendeu, nunca sobre a base de
    // comissão — senão quem tem base de loja tiraria prêmio sobre o faturamento inteiro.
    const premiacao = temPapel(f, 'vendedor') ? calcularPremiacao(totais.propriasMotos, dados.faixas) : 0
    const adiantamento = adiantadoPorId.get(f.id) ?? 0
    const totalPagar = salario + comissao + premiacao + ajudaCusto - adiantamento

    return {
      id: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario,
      comissaoPercentual,
      ajudaCusto,
      ativo,
      baseComissao,
      comissao,
      premiacao,
      adiantamento,
      totalPagar,
    }
  })

  const ativos = todos.filter(f => f.ativo)
  const salarios = ativos.reduce((s, f) => s + f.salario, 0)
  const comissoes = ativos.reduce((s, f) => s + f.comissao, 0)
  const premiacoes = ativos.reduce((s, f) => s + f.premiacao, 0)
  const ajudaCusto = ativos.reduce((s, f) => s + f.ajudaCusto, 0)
  const adiantamentos = ativos.reduce((s, f) => s + f.adiantamento, 0)

  return {
    todos,
    ativos,
    totais: {
      salarios,
      comissoes,
      premiacoes,
      ajudaCusto,
      adiantamentos,
      geral: salarios + comissoes + premiacoes + ajudaCusto - adiantamentos,
    },
  }
}
