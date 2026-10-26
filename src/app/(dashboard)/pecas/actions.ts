'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { db } from '@/lib/db'
import { pecasCatalogo, vendasPecas, vendasPecasItens, lojas, usuarios, aprovacoesVenda, conciliacoesCartao, pixRecebimentosMcp } from '@/lib/db/schema'
import { eq, and, gte, lte, desc, inArray, sql } from 'drizzle-orm'
import { inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'
import { validarDocumento, isTipoPessoa } from '@/lib/documento'
import { revalidatePath } from 'next/cache'
import { acao, RecusaUsuario } from '@/lib/resultado-action'
import { contaDoGrupoAtivo, listarLojaIdsDoGrupoAtivo, podeAprovarPagamentoSensivelNaLoja } from '@/lib/grupo'
import { podeGerirPecas, podeVenderPeca } from './papeis'
import { avisosDaEdicao } from '@/lib/edicao-venda-peca'
import { vendaPecaEditavel } from '@/lib/venda-peca-editavel'
import { editarClienteVendaPecaTx } from '@/lib/editar-cliente-venda-peca'
import { editarVendaPecaTx, type EdicaoPendente } from '@/lib/editar-venda-peca'
import { excluirVendaPecaTx } from '@/lib/excluir-venda-peca'
import { alterarPeca, inserirPeca, listarPecas, type QuemVePecas } from '@/lib/pecas-da-conta'
import { aplicarVendaPeca, type DadosVendaPeca, type ItemVendaPecaInput, type PagamentoVendaPecaInput } from '@/lib/venda-peca'


async function verificarAcesso() {
  const usuario = await getUsuarioLogado()
  if (!podeGerirPecas(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão')
  }
  return usuario
}

async function quemVePecas(usuario: Awaited<ReturnType<typeof getUsuarioLogado>>): Promise<QuemVePecas> {
  return { papel: usuario.papel, contaId: await contaDoGrupoAtivo(usuario) }
}

async function verificarAcessoVenda() {
  const usuario = await getUsuarioLogado()
  if (!podeVenderPeca(usuario.papel)) {
    throw new RecusaUsuario('Sem permissão')
  }
  return usuario
}

export type PecaInput = {
  nome: string
  valor: number
  quantidadeEstoque: number
}

export async function listarPecasAction(params?: { apenasAtivos?: boolean }) {
  const usuario = await verificarAcessoVenda()
  return listarPecas(db, await quemVePecas(usuario), { apenasAtivos: params?.apenasAtivos })
}

// Vendedor também cria: a peça nova aparece no balcão antes de alguém do escritório
// cadastrar, e sem isso a venda não sai. Editar preço/estoque e inativar seguem só
// com gestor — ver atualizarPecaAction abaixo.
export async function criarPecaAction(...a: Parameters<typeof criarPeca>) {
  return acao(() => criarPeca(...a))
}
async function criarPeca(input: PecaInput) {
  const usuario = await verificarAcessoVenda()
  const nome = input.nome.trim()
  if (!nome) throw new RecusaUsuario('Nome é obrigatório')
  if (input.valor < 0) throw new RecusaUsuario('Valor não pode ser negativo')
  if (input.quantidadeEstoque < 0) throw new RecusaUsuario('Estoque não pode ser negativo')

  const nova = await inserirPeca(db, await contaDoGrupoAtivo(usuario), { ...input, nome })

  revalidatePath('/pecas')
  return nova
}

export async function atualizarPecaAction(...a: Parameters<typeof atualizarPeca>) {
  return acao(() => atualizarPeca(...a))
}
async function atualizarPeca(id: string, input: PecaInput) {
  const usuario = await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new RecusaUsuario('Nome é obrigatório')
  if (input.valor < 0) throw new RecusaUsuario('Valor não pode ser negativo')
  if (input.quantidadeEstoque < 0) throw new RecusaUsuario('Estoque não pode ser negativo')

  const campos = { nome, valor: String(input.valor), quantidadeEstoque: input.quantidadeEstoque }
  if (!(await alterarPeca(db, await quemVePecas(usuario), id, campos))) throw new RecusaUsuario('Peça não encontrada')

  revalidatePath('/pecas')
}

export async function inativarPecaAction(...a: Parameters<typeof inativarPeca>) {
  return acao(() => inativarPeca(...a))
}
async function inativarPeca(id: string) {
  const usuario = await verificarAcesso()
  if (!(await alterarPeca(db, await quemVePecas(usuario), id, { ativo: false }))) throw new RecusaUsuario('Peça não encontrada')
  revalidatePath('/pecas')
}

export async function reativarPecaAction(...a: Parameters<typeof reativarPeca>) {
  return acao(() => reativarPeca(...a))
}
async function reativarPeca(id: string) {
  const usuario = await verificarAcesso()
  if (!(await alterarPeca(db, await quemVePecas(usuario), id, { ativo: true }))) throw new RecusaUsuario('Peça não encontrada')
  revalidatePath('/pecas')
}

// ─── Venda de Peças e Acessórios ──────────────────────────────────────────────
// Vendida junto com OS (via os_itens, já existente) ou avulsa no balcão (aqui).
// Não emite nota fiscal — só baixa estoque e registra o recebimento.

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
  if (valorTotal < 0) throw new RecusaUsuario('Valor total inválido')
  if (valorTotal < 0.005 && !pagamentos.some(p => p.tipo === TIPO_PAGAMENTO_BONIFICACAO)) {
    throw new RecusaUsuario('Valor total inválido. Para entregar sem cobrar, lance o pagamento como Bonificação')
  }
  return { pagamentos, valorTotal }
}

export async function registrarVendaPecaAction(...a: Parameters<typeof registrarVendaPeca>) {
  return acao(() => registrarVendaPeca(...a))
}
async function registrarVendaPeca(input: DadosVendaPeca) {
  const usuario = await verificarAcessoVenda()
  if (input.itens.length === 0) throw new RecusaUsuario('Adicione ao menos um item')
  if (input.pagamentos.length === 0) throw new RecusaUsuario('Informe ao menos uma forma de pagamento')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(input.lojaId)) throw new RecusaUsuario('Sem permissão para esta loja')
  // Como na tela: quem não é admin vende peça só pela própria loja.
  if (!(await podeAgirNaLoja(usuario, input.lojaId))) throw new RecusaUsuario('Sem permissão para esta loja')

  // Venda para empresa: sem CNPJ o recibo não identifica o tomador, e é justamente
  // o recibo que a empresa leva pra lançar a compra.
  const tipoPessoa = input.clienteTipoPessoa && isTipoPessoa(input.clienteTipoPessoa)
    ? input.clienteTipoPessoa
    : 'fisica'
  const doc = validarDocumento(tipoPessoa, input.clienteDocumento)
  if (!doc.ok) throw new RecusaUsuario(doc.erro)
  if (tipoPessoa === 'juridica' && !input.clienteNome?.trim()) {
    throw new RecusaUsuario('Informe a razão social da empresa')
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
  // Venda de outra Conta responde como inexistente (regra de isolamento).
  const venda = await vendaPecaEditavel(db, usuario, vendaId)
  if (!venda) throw new RecusaUsuario('Venda não encontrada')
  return { usuario, venda }
}

async function avisosDaVenda(venda: { id: string; dataVenda: Date }) {
  const [cartao, pix] = await Promise.all([
    db.select({ id: conciliacoesCartao.id }).from(conciliacoesCartao).where(eq(conciliacoesCartao.pecaVendaId, venda.id)).limit(1),
    db.select({ id: pixRecebimentosMcp.id }).from(pixRecebimentosMcp).where(eq(pixRecebimentosMcp.pecaVendaId, venda.id)).limit(1),
  ])
  return avisosDaEdicao({ conciliada: cartao.length + pix.length > 0, dataVenda: venda.dataVenda })
}

/**
 * O que o diálogo de edição precisa ao abrir: itens, pagamentos e os avisos,
 * que aparecem antes de salvar. `pecas` traz as peças da venda mesmo inativas,
 * para a busca mostrar o nome.
 */
export async function carregarVendaPecaParaEdicaoAction(...a: Parameters<typeof carregarVendaPecaParaEdicao>) {
  return acao(() => carregarVendaPecaParaEdicao(...a))
}
async function carregarVendaPecaParaEdicao(vendaId: string) {
  const { venda } = await vendaEditavel(vendaId)
  const [[cab], itens, avisos] = await Promise.all([
    db.select({ clienteNome: vendasPecas.clienteNome, pagamentos: vendasPecas.pagamentos }).from(vendasPecas).where(eq(vendasPecas.id, vendaId)),
    db.select({
      pecaId: vendasPecasItens.pecaId, quantidade: vendasPecasItens.quantidade, valorUnitario: vendasPecasItens.valorUnitario,
      nome: pecasCatalogo.nome, valor: pecasCatalogo.valor, quantidadeEstoque: pecasCatalogo.quantidadeEstoque,
    })
      .from(vendasPecasItens)
      .innerJoin(pecasCatalogo, eq(pecasCatalogo.id, vendasPecasItens.pecaId))
      .where(eq(vendasPecasItens.vendaPecaId, vendaId)),
    avisosDaVenda(venda),
  ])
  return {
    clienteNome: cab.clienteNome,
    itens: itens.map(i => ({ pecaId: i.pecaId, quantidade: Number(i.quantidade), valorUnitario: Number(i.valorUnitario) })),
    pecas: itens.map(i => ({ id: i.pecaId, nome: i.nome, valor: i.valor, quantidadeEstoque: i.quantidadeEstoque })),
    pagamentos: (cab.pagamentos ?? []) as PagamentoVendaPecaInput[],
    avisos,
  }
}

export async function editarVendaPecaAction(...a: Parameters<typeof editarVendaPeca>) {
  return acao(() => editarVendaPeca(...a))
}
async function editarVendaPeca(
  vendaId: string,
  input: { itens: ItemVendaPecaInput[]; pagamentos: PagamentoVendaPecaInput[] },
) {
  const { usuario, venda } = await vendaEditavel(vendaId)
  if (input.itens.length === 0) throw new RecusaUsuario('Adicione ao menos um item')
  if (input.pagamentos.length === 0) throw new RecusaUsuario('Informe ao menos uma forma de pagamento')

  const { pagamentos, valorTotal } = sanearPagamentos(input.pagamentos)
  const itens = podeGerirPecas(usuario.papel)
    ? input.itens
    : input.itens.map(({ pecaId, quantidade }) => ({ pecaId, quantidade }))

  // Financiamento sem permissão: igual à criação, vira pedido de aprovação e a venda
  // não muda até um gestor aprovar (aprovarVendaAction, origem 'peca_edicao').
  const exigeAprovacao = temPagamentoSensivelPeca(pagamentos) && !(await podeAprovarPagamentoSensivelNaLoja(usuario, venda.lojaId))

  // Trava a linha da venda: a checagem de pedido pendente e o que vem depois (pedir aprovação
  // ou editar) não podem intercalar com outro clique ao mesmo tempo.
  const r = await db.transaction(async tx => {
    const [atual] = await tx.select({ numero: vendasPecas.numero, clienteNome: vendasPecas.clienteNome })
      .from(vendasPecas).where(eq(vendasPecas.id, vendaId)).for('update')
    if (!atual) throw new RecusaUsuario('Venda não encontrada')

    // Uma edição esperando aprovação por vez: duas na fila se sobreporiam na hora de aprovar.
    // Vale também para o gestor, senão a aprovação depois desfaria a edição dele.
    const [pendente] = await tx.select({ id: aprovacoesVenda.id }).from(aprovacoesVenda).where(and(
      eq(aprovacoesVenda.origem, 'peca_edicao'),
      eq(aprovacoesVenda.status, 'pendente'),
      sql`${aprovacoesVenda.dadosVenda}->>'vendaId' = ${vendaId}`,
    )).limit(1)
    if (pendente) throw new RecusaUsuario('Esta venda já tem uma edição aguardando aprovação. Aprove ou recuse o pedido em Vendas antes de editar de novo')

    // Financiamento sem permissão: igual à criação, vira pedido de aprovação e a venda
    // não muda até um gestor aprovar (aprovarVendaAction, origem 'peca_edicao').
    if (exigeAprovacao) {
      const pedido: EdicaoPendente & { clienteNome: string | null } = {
        vendaId, numero: atual.numero, itens, pagamentos, clienteNome: atual.clienteNome,
      }
      await tx.insert(aprovacoesVenda).values({
        origem: 'peca_edicao',
        lojaId: venda.lojaId,
        vendedorId: usuario.id,
        valor: valorTotal.toFixed(2),
        dadosVenda: pedido,
        motivo: `Pagamento via Financiamento — edição da venda de peças #${atual.numero}`,
        tipo: 'pagamento_sensivel',
        status: 'pendente',
      })
      return { aguardandoAprovacao: true as const, numero: atual.numero }
    }

    const e = await editarVendaPecaTx(tx, { vendaId, grupoId: venda.grupoId, usuarioId: usuario.id, itens, pagamentos })
    return { aguardandoAprovacao: false as const, numero: e.numero }
  })
  if (r.aguardandoAprovacao) {
    revalidatePath('/pecas')
    revalidatePath('/vendas')
    return { aguardandoAprovacao: true as const, numero: r.numero, avisos: [] as string[] }
  }
  revalidatePath('/pecas')
  return { aguardandoAprovacao: false as const, numero: r.numero, avisos: await avisosDaVenda(venda) }
}

// ─── Correção do cliente da venda de peças ───────────────────────────────────
// Nome digitado errado no balcão: antes o único jeito era excluir e refazer, o que
// solta a conciliação e mexe no estoque. Aqui só muda o tomador (nome, documento,
// tipo de pessoa); itens, pagamentos e conciliação ficam como estão. Mesma permissão
// e mesmas regras de documento da criação. Fica no histórico de edições da venda.
export async function editarClienteVendaPecaAction(...a: Parameters<typeof editarClienteVendaPeca>) {
  return acao(() => editarClienteVendaPeca(...a))
}
async function editarClienteVendaPeca(
  vendaId: string,
  input: { clienteNome: string | null; clienteTipoPessoa: string; clienteDocumento: string | null },
) {
  const usuario = await verificarAcessoVenda()
  const { numero } = await db.transaction(tx => editarClienteVendaPecaTx(tx, usuario, vendaId, input))
  revalidatePath('/pecas')
  return { numero }
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

// Excluir venda de peças: para a venda que não devia existir (itens e pagamentos se
// corrigem pelo editar, #242). Devolve o estoque dos itens e SOLTA as transações que
// estavam casadas com essa venda — o dinheiro continua lá na conciliação, livre pra ser
// vinculado ao lançamento certo. Gestor da loja (inclui aux_adm) resolve sozinho.
export async function excluirVendaPecaAction(...a: Parameters<typeof excluirVendaPeca>) {
  return acao(() => excluirVendaPeca(...a))
}
async function excluirVendaPeca(vendaId: string) {
  const usuario = await verificarAcesso()
  const { numero } = await db.transaction(tx => excluirVendaPecaTx(tx, usuario, vendaId))

  revalidatePath('/pecas')
  revalidatePath('/conciliacao')
  revalidatePath('/pix-mcp')
  revalidatePath('/vendas')
  return { numero }
}
