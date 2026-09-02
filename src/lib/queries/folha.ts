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
  folhaRegrasComissao, folhaValoresReais,
} from '@/lib/db/schema'
import { eq, ne, inArray, and, gte, lte, sql } from 'drizzle-orm'
import { inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'
import { calcularPremiacao } from '@/lib/premiacao'
import { calcularRegrasFolha, type TotaisBase, type RegraFolha, type RegraCalculada } from '@/lib/folha'
import { temPapel } from '@/lib/auth'

export type DadosFolha = {
  /** 'YYYY-MM' do recorte. A vigência das regras é resolvida contra ele. */
  mes: string
  funcionarios: { id: string; nome: string; papel: string; papeisExtras: string[] | null; lojaId: string | null; lojaNome: string }[]
  configs: { usuarioId: string; salario: string; ajudaCusto: string | null; adiantamentoFixo: string | null; ativo: boolean }[]
  /** Regras de comissão/premiação de todo o grupo. A vigência é filtrada no cálculo. */
  regras: RegraFolha[]
  faixas: { id: string; valorMinimoVendas: string; premiacao: string }[]
  vendasPorVendedor: { vendedorId: string; total: string }[]
  pecasPorVendedor: { vendedorId: string; total: string }[]
  osPorMecanico: { mecanicoId: string | null; total: string }[]
  osPecasPorAbertaPor: { abertaPor: string; total: string }[]
  motosPorLoja: { lojaId: string; total: string }[]
  pecasPorLoja: { lojaId: string; total: string }[]
  osPecasPorLoja: { lojaId: string; total: string }[]
  /** Mão de obra das OS concluídas, por loja. Base 'loja_servicos'. */
  servicosPorLoja: { lojaId: string; total: string }[]
  ajustes: { id: string; lojaId: string; lojaNome: string; tipo: string; usuarioId: string | null; usuarioNome: string | null; valor: string; observacao: string | null }[]
  /** Adiantamento salarial do mês. Desconta do total a pagar — não entra em caixa nem despesa. */
  adiantamentos: { id: string; lojaId: string; lojaNome: string; usuarioId: string; usuarioNome: string | null; valor: string; data: string | null; observacao: string | null }[]
  /** Valor efetivamente pago no mês, digitado na folha. Ausente = ninguém informou. */
  valoresReais: { usuarioId: string; valor: string }[]
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
  ajudaCusto: number
  ativo: boolean
  /** Uma linha por regra vigente no mês — é o que a tela e o impresso detalham. */
  regras: RegraCalculada[]
  comissao: number
  /** Premiação por faixa OTE (só vendedor). Somada às regras de premiação. */
  premiacaoFaixa: number
  premiacao: number
  /** Vale fixo do cadastro, descontado todo mês. */
  adiantamentoFixo: number
  /** Adiantamento avulso lançado neste mês (aba Adiantamentos). */
  adiantamentoEventual: number
  /** Fixo + eventual. Sai do totalPagar; não é clamped em zero de propósito —
   *  adiantamento maior que a folha é erro de lançamento e tem que aparecer. */
  adiantamento: number
  totalPagar: number
  /** O que foi realmente pago, digitado na última coluna. null = ainda em branco. */
  valorReal: number | null
  /** valorReal quando informado, senão totalPagar. É o que o compromisso de
   *  Contas a Pagar usa, para o calendário não zerar antes de alguém digitar. */
  valorEfetivo: number
}

export type FolhaDoMes = {
  todos: FuncionarioFolha[]
  ativos: FuncionarioFolha[]
  totais: {
    salarios: number; comissoes: number; premiacoes: number; ajudaCusto: number
    adiantamentos: number
    /** Soma do cálculo da folha. */
    geral: number
    /** Soma dos valorEfetivo — o que sai do caixa de verdade. */
    efetivo: number
    /** Quantos ativos já tiveram o valor real informado (para a legenda do card). */
    reaisInformados: number
  }
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
    motosPorLoja, pecasPorLoja, osPecasPorLoja, servicosPorLoja, regras, ajustes, adiantamentos,
    valoresReais, lojasDoGrupo, funcionariosGrupo,
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

    // Mão de obra das OS concluídas por loja — base 'loja_servicos'. Separada de
    // osPecasPorLoja, que é a PEÇA usada na OS: quem comissiona sobre serviço não
    // pode levar a peça junto.
    db
      .select({
        lojaId: ordensServico.lojaId,
        total: sql<string>`COALESCE(SUM(${ordensServico.valorServicos}::numeric), 0)`,
      })
      .from(ordensServico)
      .where(and(
        inArray(ordensServico.lojaId, lojaIds),
        eq(ordensServico.status, 'concluida'),
        gte(ordensServico.dataConclusao, inicioTs),
        lte(ordensServico.dataConclusao, fimTs),
      ))
      .groupBy(ordensServico.lojaId),

    // Regras de comissão/premiação do grupo inteiro. Não filtra por vigência aqui:
    // a mesma lista alimenta o cálculo (que filtra pelo mês) e a aba de cadastro,
    // que precisa mostrar inclusive regra futura e regra encerrada.
    db
      .select({
        id: folhaRegrasComissao.id,
        usuarioId: folhaRegrasComissao.usuarioId,
        tipo: folhaRegrasComissao.tipo,
        base: folhaRegrasComissao.base,
        percentual: folhaRegrasComissao.percentual,
        vigenciaInicio: folhaRegrasComissao.vigenciaInicio,
        vigenciaFim: folhaRegrasComissao.vigenciaFim,
        descricao: folhaRegrasComissao.descricao,
      })
      .from(folhaRegrasComissao)
      .innerJoin(usuarios, eq(folhaRegrasComissao.usuarioId, usuarios.id))
      .where(inArray(usuarios.lojaId, lojaIdsGrupo)),

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

    // Escopo de GRUPO como os ajustes e os adiantamentos: só é lido pela chave do
    // funcionário, e os funcionários já vêm filtrados pelo recorte do cálculo.
    db
      .select({ usuarioId: folhaValoresReais.usuarioId, valor: folhaValoresReais.valor })
      .from(folhaValoresReais)
      .innerJoin(usuarios, eq(folhaValoresReais.usuarioId, usuarios.id))
      .where(and(
        inArray(usuarios.lojaId, lojaIdsGrupo),
        eq(folhaValoresReais.mes, mes),
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
    mes,
    funcionarios, configs, faixas, vendasPorVendedor, pecasPorVendedor, osPorMecanico, osPecasPorAbertaPor,
    motosPorLoja, pecasPorLoja, osPecasPorLoja, servicosPorLoja, regras, ajustes, adiantamentos,
    valoresReais,
    lojas: lojasDoGrupo, funcionariosGrupo,
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
  const servicosPorLojaId = new Map(dados.servicosPorLoja.map(l => [l.lojaId, parseFloat(l.total)]))
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
      somar(servicosPorLojaId, a.lojaId, valor)
      somar(osPorId, a.usuarioId, valor)
    }
  }

  // Regras de comissão/premiação por pessoa. A vigência é resolvida dentro de
  // calcularRegrasFolha, contra o mês do recorte.
  const regrasPorUsuario = new Map<string, RegraFolha[]>()
  for (const r of dados.regras) {
    const lista = regrasPorUsuario.get(r.usuarioId)
    if (lista) lista.push(r)
    else regrasPorUsuario.set(r.usuarioId, [r])
  }

  // Um valor real por pessoa (índice único em folha_valores_reais).
  const valorRealPorId = new Map(dados.valoresReais.map(v => [v.usuarioId, parseFloat(v.valor)]))

  // Vários adiantamentos no mesmo mês somam para a mesma pessoa.
  const adiantadoPorId = new Map<string, number>()
  for (const a of dados.adiantamentos) {
    adiantadoPorId.set(a.usuarioId, (adiantadoPorId.get(a.usuarioId) ?? 0) + parseFloat(a.valor))
  }

  const todos = dados.funcionarios.map(f => {
    const config = configPorUsuario.get(f.id)
    const salario = config ? parseFloat(config.salario) : 0
    const ajudaCusto = config?.ajudaCusto ? parseFloat(config.ajudaCusto) : 0
    const adiantamentoFixo = config?.adiantamentoFixo ? parseFloat(config.adiantamentoFixo) : 0
    const ativo = config?.ativo ?? true

    const totais: TotaisBase = {
      propriasMotos:    vendasPorId.get(f.id) ?? 0,
      propriasPecas:    pecasPorId.get(f.id) ?? 0,
      propriosServicos: osPorId.get(f.id) ?? 0,
      lojaMotos:        f.lojaId ? (motosPorLojaId.get(f.lojaId) ?? 0) : 0,
      lojaPecas:        f.lojaId ? (pecasPorLojaId.get(f.lojaId) ?? 0) : 0,
      lojaServicos:     f.lojaId ? (servicosPorLojaId.get(f.lojaId) ?? 0) : 0,
    }

    // Uma pessoa pode ter várias regras, de comissão e de premiação (migração 0076).
    const aplicadas = calcularRegrasFolha(regrasPorUsuario.get(f.id) ?? [], f.papel, totais, dados.mes)
    const comissao = aplicadas.comissao

    // Faixa OTE é outro mecanismo: valor fixo em R$ por faixa atingida, só para
    // vendedor, e sempre sobre as motos que a própria pessoa vendeu — nunca sobre a
    // base das regras, senão quem tem base de loja tiraria prêmio sobre o
    // faturamento inteiro. As duas premiações se somam.
    const premiacaoFaixa = temPapel(f, 'vendedor') ? calcularPremiacao(totais.propriasMotos, dados.faixas) : 0
    const premiacao = premiacaoFaixa + aplicadas.premiacao
    // Vale fixo e adiantamento avulso se somam: quem tem vale de R$ 500 e pegou
    // mais R$ 300 num mês desconta R$ 800 naquele mês.
    const adiantamentoEventual = adiantadoPorId.get(f.id) ?? 0
    const adiantamento = adiantamentoFixo + adiantamentoEventual
    const totalPagar = salario + comissao + premiacao + ajudaCusto - adiantamento

    // ?? e não ||: zero é um valor informado (funcionário que não recebeu nada
    // naquele mês), e com || ele voltaria a valer o calculado.
    const valorReal = valorRealPorId.has(f.id) ? (valorRealPorId.get(f.id) as number) : null
    const valorEfetivo = valorReal ?? totalPagar

    return {
      id: f.id,
      nome: f.nome,
      papel: f.papel,
      lojaNome: f.lojaNome,
      salario,
      ajudaCusto,
      ativo,
      regras: aplicadas.detalhes,
      comissao,
      premiacaoFaixa,
      premiacao,
      adiantamentoFixo,
      adiantamentoEventual,
      adiantamento,
      totalPagar,
      valorReal,
      valorEfetivo,
    }
  })

  const ativos = todos.filter(f => f.ativo)
  const salarios = ativos.reduce((s, f) => s + f.salario, 0)
  const comissoes = ativos.reduce((s, f) => s + f.comissao, 0)
  const premiacoes = ativos.reduce((s, f) => s + f.premiacao, 0)
  const ajudaCusto = ativos.reduce((s, f) => s + f.ajudaCusto, 0)
  const adiantamentos = ativos.reduce((s, f) => s + f.adiantamento, 0)
  // Soma dos efetivos, e não `geral` corrigido pelos informados: cada pessoa cai
  // no real ou no calculado por conta própria, então a folha meio preenchida
  // continua fechando.
  const efetivo = ativos.reduce((s, f) => s + f.valorEfetivo, 0)
  const reaisInformados = ativos.filter(f => f.valorReal !== null).length

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
      efetivo,
      reaisInformados,
    },
  }
}
