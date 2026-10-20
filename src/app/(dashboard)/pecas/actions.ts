'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasCatalogo, vendasPecas, vendasPecasItens, lojas, usuarios, aprovacoesVenda, conciliacoesCartao, pixRecebimentosMcp } from '@/lib/db/schema'
import { eq, and, gte, lte, asc, desc, inArray, sql } from 'drizzle-orm'
import { inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'
import { validarDocumento, isTipoPessoa } from '@/lib/documento'
import { revalidatePath } from 'next/cache'
import { listarLojaIdsDoGrupoAtivo, podeAprovarPagamentoSensivelNaLoja, podeUsuarioVerGrupo } from '@/lib/grupo'
import { podeGerirPecas, podeVenderPeca } from './papeis'
import { avisosDaEdicao } from '@/lib/edicao-venda-peca'
import { editarVendaPecaTx } from '@/lib/editar-venda-peca'


async function verificarAcesso() {
  const usuario = await getUsuarioLogado()
  if (!podeGerirPecas(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  return usuario
}

async function verificarAcessoVenda() {
  const usuario = await getUsuarioLogado()
  if (!podeVenderPeca(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  return usuario
}

export type PecaInput = {
  nome: string
  valor: number
  quantidadeEstoque: number
}

export async function listarPecasAction(params?: { apenasAtivos?: boolean }) {
  await verificarAcessoVenda()
  const todas = await db.select().from(pecasCatalogo).orderBy(asc(pecasCatalogo.nome))
  return params?.apenasAtivos ? todas.filter(p => p.ativo) : todas
}

// Vendedor também cria: a peça nova aparece no balcão antes de alguém do escritório
// cadastrar, e sem isso a venda não sai. Editar preço/estoque e inativar seguem só
// com gestor — ver atualizarPecaAction abaixo.
export async function criarPecaAction(input: PecaInput) {
  await verificarAcessoVenda()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')
  if (input.quantidadeEstoque < 0) throw new Error('Estoque não pode ser negativo')

  const [nova] = await db.insert(pecasCatalogo).values({
    nome,
    valor: String(input.valor),
    quantidadeEstoque: input.quantidadeEstoque,
  }).returning({
    id: pecasCatalogo.id,
    nome: pecasCatalogo.nome,
    valor: pecasCatalogo.valor,
    quantidadeEstoque: pecasCatalogo.quantidadeEstoque,
  })

  revalidatePath('/pecas')
  return nova
}

export async function atualizarPecaAction(id: string, input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')
  if (input.quantidadeEstoque < 0) throw new Error('Estoque não pode ser negativo')

  await db.update(pecasCatalogo).set({
    nome,
    valor: String(input.valor),
    quantidadeEstoque: input.quantidadeEstoque,
    atualizadoEm: new Date(),
  }).where(eq(pecasCatalogo.id, id))

  revalidatePath('/pecas')
}

export async function inativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: false, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}

export async function reativarPecaAction(id: string) {
  await verificarAcesso()
  await db.update(pecasCatalogo)
    .set({ ativo: true, atualizadoEm: new Date() })
    .where(eq(pecasCatalogo.id, id))
  revalidatePath('/pecas')
}

// ─── Venda de Peças e Acessórios ──────────────────────────────────────────────
// Vendida junto com OS (via os_itens, já existente) ou avulsa no balcão (aqui).
// Não emite nota fiscal — só baixa estoque e registra o recebimento.

// `valorUnitario` sobrepõe o preço do catálogo só naquela venda (desconto/ajuste de
// balcão). Só gestor pode mandar — quem decide é o servidor, não o cliente; ver
// registrarVendaPecaAction.
export type ItemVendaPecaInput = { pecaId: string; quantidade: number; valorUnitario?: number }
export type PagamentoVendaPecaInput = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }
export type DadosVendaPeca = {
  lojaId: string
  clienteNome?: string
  /** 'fisica' (padrão) ou 'juridica'. Jurídica é o que faz o recibo sair no CNPJ. */
  clienteTipoPessoa?: string
  /** CPF/CNPJ só com dígitos. Obrigatório quando `clienteTipoPessoa` é 'juridica'. */
  clienteDocumento?: string | null
  itens: ItemVendaPecaInput[]
  pagamentos: PagamentoVendaPecaInput[]
}

// 'financiamento' precisa da mesma aprovação exigida em venda de moto/OS — só quem tem
// podeAprovarPagamentoSensivelNaLoja vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_PECA = new Set(['financiamento'])
function temPagamentoSensivelPeca(pagamentos: PagamentoVendaPecaInput[]): boolean {
  return pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL_PECA.has(p.tipo))
}

// 'bonificacao' = peça entregue sem cobrança (brinde junto com a moto, cortesia, troca
// em garantia). A venda existe — baixa estoque e guarda para quem foi —, mas não é
// receita: o valor vai zerado a ferro e fogo porque DRE, folha e financeiro somam
// vendas_pecas.valor_total. É também o único jeito de a venda fechar em R$ 0,00.
// Nada a conciliar: precisaConciliar() só olha cartão e PIX (src/lib/conciliacao-status.ts).
const TIPO_PAGAMENTO_BONIFICACAO = 'bonificacao'

function zerarBonificacoes(pagamentos: PagamentoVendaPecaInput[]): PagamentoVendaPecaInput[] {
  return pagamentos.map(p => p.tipo === TIPO_PAGAMENTO_BONIFICACAO ? { ...p, valor: 0 } : p)
}

/** Mesma regra de valor na criação e na edição. */
function sanearPagamentos(entrada: PagamentoVendaPecaInput[]) {
  const pagamentos = zerarBonificacoes(entrada)
  const valorTotal = pagamentos.reduce((s, p) => s + p.valor, 0)
  if (valorTotal < 0) throw new Error('Valor total inválido')
  if (valorTotal < 0.005 && !pagamentos.some(p => p.tipo === TIPO_PAGAMENTO_BONIFICACAO)) {
    throw new Error('Valor total inválido — para entregar sem cobrar, lance o pagamento como Bonificação')
  }
  return { pagamentos, valorTotal }
}

// Cria a venda de fato — sem checagem de permissão/sensibilidade, usada tanto pelo
// fechamento direto quanto pela aprovação de pagamento sensível. Recebe a transação de
// fora pra poder ficar atômico com o UPDATE de aprovação (ver aprovarVendaAction).
export async function aplicarVendaPeca(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  vendedorId: string,
  input: DadosVendaPeca,
) {
  const valorTotal = input.pagamentos.reduce((s, p) => s + p.valor, 0)

  const pecaIds = input.itens.map(i => i.pecaId)
  const pecas = await tx
    .select({ id: pecasCatalogo.id, nome: pecasCatalogo.nome, valor: pecasCatalogo.valor, quantidadeEstoque: pecasCatalogo.quantidadeEstoque })
    .from(pecasCatalogo)
    .where(inArray(pecasCatalogo.id, pecaIds))
    .for('update')
  const pecaById = new Map(pecas.map(p => [p.id, p]))

  // Estoque NÃO barra a venda (decisão do Cesar em 31/08/2026). O catálogo veio da
  // fábrica com 1.732 das 1.733 peças zeradas, então a trava reprovava toda venda de
  // balcão — nenhuma chegou a ser registrada. A contagem segue sendo atualizada e pode
  // ficar negativa: é indicador de que falta lançar entrada, não impedimento de vender.
  // A tela já mostra o saldo em vermelho quando está zerado ou negativo.
  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)
    if (!peca) throw new Error('Peça não encontrada')
    if (item.quantidade <= 0) throw new Error(`Quantidade inválida para ${peca.nome}`)
  }

  const formaPagamento = input.pagamentos.length === 1 ? input.pagamentos[0].tipo : 'multiplo'

  const [venda] = await tx.insert(vendasPecas).values({
    lojaId: input.lojaId,
    vendedorId,
    clienteNome: input.clienteNome?.trim() || null,
    // Já chega validado por registrarVendaPecaAction — aqui é só gravação.
    clienteTipoPessoa: input.clienteTipoPessoa === 'juridica' ? 'juridica' : 'fisica',
    clienteDocumento: input.clienteDocumento || null,
    formaPagamento,
    pagamentos: input.pagamentos,
    valorTotal: valorTotal.toFixed(2),
  }).returning({ id: vendasPecas.id })

  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)!
    // O `valorUnitario` já chega saneado por registrarVendaPecaAction: quem não pode
    // mexer no preço não tem esse campo aqui. Ausente = preço do catálogo.
    const valorUnitario = item.valorUnitario != null && item.valorUnitario >= 0
      ? item.valorUnitario.toFixed(2)
      : peca.valor
    await tx.insert(vendasPecasItens).values({
      vendaPecaId: venda.id,
      pecaId: item.pecaId,
      descricao: peca.nome,
      quantidade: String(item.quantidade),
      valorUnitario,
    })
    // Decremento relativo, não `lido - quantidade`: a mesma peça em duas linhas do
    // carrinho partia do mesmo valor lido e a segunda baixa apagava a primeira.
    await tx.update(pecasCatalogo)
      .set({
        quantidadeEstoque: sql`${pecasCatalogo.quantidadeEstoque} - ${item.quantidade}`,
        atualizadoEm: new Date(),
      })
      .where(eq(pecasCatalogo.id, item.pecaId))
  }

  return { id: venda.id }
}

export async function registrarVendaPecaAction(input: DadosVendaPeca) {
  const usuario = await verificarAcessoVenda()
  if (input.itens.length === 0) throw new Error('Adicione ao menos um item')
  if (input.pagamentos.length === 0) throw new Error('Informe ao menos uma forma de pagamento')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(input.lojaId)) throw new Error('Loja fora do grupo ativo')

  // Venda para empresa: sem CNPJ o recibo não identifica o tomador, e é justamente
  // o recibo que a empresa leva pra lançar a compra.
  const tipoPessoa = input.clienteTipoPessoa && isTipoPessoa(input.clienteTipoPessoa)
    ? input.clienteTipoPessoa
    : 'fisica'
  const doc = validarDocumento(tipoPessoa, input.clienteDocumento)
  if (!doc.ok) throw new Error(doc.erro)
  if (tipoPessoa === 'juridica' && !input.clienteNome?.trim()) {
    throw new Error('Informe a razão social da empresa')
  }

  const { pagamentos, valorTotal } = sanearPagamentos(input.pagamentos)

  // Preço fora do catálogo é decisão de gestor. Descartar aqui (e não lá embaixo)
  // faz a venda que vai pra aprovação já ficar gravada com o preço certo — senão o
  // ajuste sumiria só quando alguém aprovasse, dias depois.
  const podeDefinirPreco = podeGerirPecas(usuario.papel)
  const comCliente = { ...input, pagamentos, clienteTipoPessoa: tipoPessoa, clienteDocumento: doc.documento }
  const saneado: DadosVendaPeca = podeDefinirPreco
    ? comCliente
    : { ...comCliente, itens: input.itens.map(({ pecaId, quantidade }) => ({ pecaId, quantidade })) }

  if (temPagamentoSensivelPeca(saneado.pagamentos) && !(await podeAprovarPagamentoSensivelNaLoja(usuario, saneado.lojaId))) {
    await db.insert(aprovacoesVenda).values({
      origem: 'peca',
      lojaId: saneado.lojaId,
      vendedorId: usuario.id,
      valor: valorTotal.toFixed(2),
      dadosVenda: saneado,
      motivo: 'Pagamento via Financiamento — venda de peças',
      tipo: 'pagamento_sensivel',
      status: 'pendente',
    })
    revalidatePath('/pecas')
    return { aguardandoAprovacao: true as const }
  }

  const resultado = await db.transaction(tx => aplicarVendaPeca(tx, usuario.id, saneado))
  revalidatePath('/pecas')
  return { aguardandoAprovacao: false as const, id: resultado.id }
}

// ─── Edição de venda de peças (#242) ─────────────────────────────────────────
// Itens e pagamentos; cliente e vendedor não mudam aqui. Edita quem vende peças
// na loja da venda. Admin: qualquer loja do grupo da venda que ele enxerga, mesmo
// com outro grupo ativo na sessão (permissão vale no grupo do registro).

async function vendaEditavel(vendaId: string) {
  const usuario = await verificarAcessoVenda()
  const [venda] = await db
    .select({ id: vendasPecas.id, lojaId: vendasPecas.lojaId, dataVenda: vendasPecas.dataVenda, grupoId: lojas.grupoId })
    .from(vendasPecas)
    .innerJoin(lojas, eq(lojas.id, vendasPecas.lojaId))
    .where(eq(vendasPecas.id, vendaId))
    .limit(1)
  if (!venda) throw new Error('Venda não encontrada')
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const pode = isAdmin ? await podeUsuarioVerGrupo(usuario, venda.grupoId) : usuario.lojaId === venda.lojaId
  if (!pode) throw new Error('Sem permissão para editar esta venda')
  return { usuario, venda }
}

async function avisosDaVenda(venda: { id: string; dataVenda: Date }) {
  const [cartao, pix] = await Promise.all([
    db.select({ id: conciliacoesCartao.id }).from(conciliacoesCartao).where(eq(conciliacoesCartao.pecaVendaId, venda.id)).limit(1),
    db.select({ id: pixRecebimentosMcp.id }).from(pixRecebimentosMcp).where(eq(pixRecebimentosMcp.pecaVendaId, venda.id)).limit(1),
  ])
  return avisosDaEdicao({ conciliada: cartao.length + pix.length > 0, dataVenda: venda.dataVenda })
}

/** Avisos para a tela mostrar antes de salvar. Não bloqueiam. */
export async function avisosEdicaoVendaPecaAction(vendaId: string): Promise<string[]> {
  const { venda } = await vendaEditavel(vendaId)
  return avisosDaVenda(venda)
}

export async function editarVendaPecaAction(
  vendaId: string,
  input: { itens: ItemVendaPecaInput[]; pagamentos: PagamentoVendaPecaInput[] },
) {
  const { usuario, venda } = await vendaEditavel(vendaId)
  if (input.itens.length === 0) throw new Error('Adicione ao menos um item')
  if (input.pagamentos.length === 0) throw new Error('Informe ao menos uma forma de pagamento')

  const { pagamentos } = sanearPagamentos(input.pagamentos)
  // Financiamento sem permissão: na criação vai para aprovação; na edição, a
  // aprovação ainda não existe (vem num PR seguinte da #242), então recusa.
  if (temPagamentoSensivelPeca(pagamentos) && !(await podeAprovarPagamentoSensivelNaLoja(usuario, venda.lojaId))) {
    throw new Error('Financiamento precisa de aprovação — peça a um gestor para fazer esta edição')
  }
  const itens = podeGerirPecas(usuario.papel)
    ? input.itens
    : input.itens.map(({ pecaId, quantidade }) => ({ pecaId, quantidade }))

  const r = await db.transaction(tx => editarVendaPecaTx(tx, {
    vendaId, grupoId: venda.grupoId, usuarioId: usuario.id, itens, pagamentos,
  }))
  revalidatePath('/pecas')
  return { numero: r.numero, avisos: await avisosDaVenda(venda) }
}

export type VendaPecaResumo = Awaited<ReturnType<typeof listarVendasPecasAction>>[number]

export type FiltrosVendasPecas = {
  /** 'YYYY-MM-DD'. A página manda o mês corrente quando ninguém escolheu nada. */
  de?: string
  ate?: string
  lojaId?: string
  vendedorId?: string
  /** Tipo de pagamento ('pix', 'bonificacao', …). Casa também dentro de venda múltipla. */
  forma?: string
  /** Cliente, documento, número da venda ou descrição de um item. */
  q?: string
}

/**
 * Vendas de peça do recorte pedido.
 *
 * O teto de 500 linhas não é paginação: a tela sempre chega com um período (o mês
 * corrente, por padrão), e os cards da página são somados EM CIMA DESTA LISTA. Se a
 * lista fosse cortada, o card mostraria um total menor que o real sem avisar — por
 * isso o período é obrigatório na prática, e não um "todos os tempos" com limit.
 */
export async function listarVendasPecasAction(filtros: FiltrosVendasPecas = {}) {
  const usuario = await verificarAcessoVenda()
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaPermitida = isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : [])
  if (lojaPermitida.length === 0) return []

  // O filtro de loja só ESTREITA o que a pessoa já podia ver: id de fora do escopo
  // é ignorado, nunca amplia.
  const lojaFiltro = filtros.lojaId && lojaPermitida.includes(filtros.lojaId)
    ? [filtros.lojaId]
    : lojaPermitida

  const busca = filtros.q?.trim()
  const buscaLike = busca ? `%${busca}%` : null
  const numeroBusca = busca && /^d+$/.test(busca) ? Number(busca) : null

  const condicoes = [
    inArray(vendasPecas.lojaId, lojaFiltro),
    filtros.de  ? gte(vendasPecas.dataVenda, inicioDoDiaBrt(filtros.de))  : undefined,
    filtros.ate ? lte(vendasPecas.dataVenda, fimDoDiaBrt(filtros.ate))    : undefined,
    filtros.vendedorId ? eq(vendasPecas.vendedorId, filtros.vendedorId)   : undefined,
    // `formaPagamento` guarda 'multiplo' quando a venda tem mais de uma forma; nesses
    // casos o tipo só existe dentro do array `pagamentos`, daí o EXISTS.
    filtros.forma
      ? sql`(${vendasPecas.formaPagamento} = ${filtros.forma} OR EXISTS (
          SELECT 1 FROM jsonb_array_elements(COALESCE(${vendasPecas.pagamentos}, '[]'::jsonb)) pg
          WHERE pg->>'tipo' = ${filtros.forma}
        ))`
      : undefined,
    buscaLike
      ? sql`(
          ${vendasPecas.clienteNome} ILIKE ${buscaLike}
          OR ${vendasPecas.clienteDocumento} ILIKE ${buscaLike}
          ${numeroBusca !== null ? sql`OR ${vendasPecas.numero} = ${numeroBusca}` : sql``}
          OR EXISTS (
            SELECT 1 FROM vendas_pecas_itens i
            WHERE i.venda_peca_id = ${sql.raw('"vendas_pecas"."id"')} AND i.descricao ILIKE ${buscaLike}
          )
        )`
      : undefined,
  ]

  return db
    .select({
      id: vendasPecas.id,
      numero: vendasPecas.numero,
      lojaNome: lojas.nome,
      vendedorNome: usuarios.nome,
      clienteNome: vendasPecas.clienteNome,
      clienteDocumento: vendasPecas.clienteDocumento,
      clienteTipoPessoa: vendasPecas.clienteTipoPessoa,
      vendedorId: vendasPecas.vendedorId,
      formaPagamento: vendasPecas.formaPagamento,
      pagamentos: vendasPecas.pagamentos,
      valorTotal: vendasPecas.valorTotal,
      dataVenda: vendasPecas.dataVenda,
      conciliadoValor: sql<number>`COALESCE((
        SELECT SUM(valor_bruto::numeric)
        FROM conciliacoes_cartao
        WHERE peca_venda_id = ${vendasPecas.id}
        AND conciliado = true
      ), 0)`,
      pixConciliadoValor: sql<number>`COALESCE((
        SELECT SUM(valor::numeric)
        FROM pix_recebimentos_mcp
        WHERE peca_venda_id = ${vendasPecas.id}
      ), 0)`,
      itens: sql<string>`(
        SELECT string_agg(${vendasPecasItens.descricao} || ' x' || ${vendasPecasItens.quantidade}, ', ')
        FROM ${vendasPecasItens}
        WHERE ${vendasPecasItens.vendaPecaId} = ${vendasPecas.id}
      )`,
    })
    .from(vendasPecas)
    .innerJoin(lojas, eq(vendasPecas.lojaId, lojas.id))
    .innerJoin(usuarios, eq(vendasPecas.vendedorId, usuarios.id))
    .where(and(...condicoes))
    .orderBy(desc(vendasPecas.dataVenda))
    .limit(500)
}

// Excluir venda de peças: lançamento errado no balcão não tem como ser editado, então
// o caminho é apagar e refazer. Devolve o estoque dos itens e SOLTA as transações que
// estavam casadas com essa venda — o dinheiro continua lá na conciliação, livre pra ser
// vinculado ao lançamento certo. Gestor da loja (inclui aux_adm) resolve sozinho.
export async function excluirVendaPecaAction(vendaId: string) {
  const usuario = await verificarAcesso()

  const [venda] = await db
    .select({ id: vendasPecas.id, numero: vendasPecas.numero, lojaId: vendasPecas.lojaId })
    .from(vendasPecas)
    .where(eq(vendasPecas.id, vendaId))
    .limit(1)
  if (!venda) throw new Error('Venda não encontrada')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(venda.lojaId)) throw new Error('Venda fora do grupo ativo')

  await db.transaction(async tx => {
    const itens = await tx
      .select({ pecaId: vendasPecasItens.pecaId, quantidade: vendasPecasItens.quantidade })
      .from(vendasPecasItens)
      .where(eq(vendasPecasItens.vendaPecaId, vendaId))

    // Devolve na mesma forma que a venda baixou (incremento relativo) — duas linhas da
    // mesma peça no carrinho têm que somar as duas de volta.
    for (const item of itens) {
      await tx.update(pecasCatalogo)
        .set({
          quantidadeEstoque: sql`${pecasCatalogo.quantidadeEstoque} + ${Number(item.quantidade)}`,
          atualizadoEm: new Date(),
        })
        .where(eq(pecasCatalogo.id, item.pecaId))
    }

    // Soltar antes do DELETE: as duas colunas são FK pra vendas_pecas e segurariam a
    // exclusão. Volta ao estado de transação não conciliada, como desvincular na mão.
    await tx.update(conciliacoesCartao)
      .set({ pecaVendaId: null, conciliado: false, conciliadoEm: null })
      .where(eq(conciliacoesCartao.pecaVendaId, vendaId))
    await tx.update(pixRecebimentosMcp)
      .set({ tipoCorrespondencia: null, pecaVendaId: null, lancadoPorId: null, lancadoEm: null })
      .where(eq(pixRecebimentosMcp.pecaVendaId, vendaId))

    await tx.delete(vendasPecasItens).where(eq(vendasPecasItens.vendaPecaId, vendaId))
    await tx.delete(vendasPecas).where(eq(vendasPecas.id, vendaId))
  })

  revalidatePath('/pecas')
  revalidatePath('/conciliacao')
  revalidatePath('/pix-mcp')
  return { numero: venda.numero }
}
