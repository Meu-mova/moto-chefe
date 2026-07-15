'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { pecasCatalogo, vendasPecas, vendasPecasItens, lojas, usuarios, aprovacoesVenda } from '@/lib/db/schema'
import { eq, asc, desc, inArray, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { listarLojaIdsDoGrupoAtivo, podeAprovarPagamentoSensivel } from '@/lib/grupo'

const GESTORES = ['admin_geral', 'admin_socio', 'aux_adm'] as const
const PAPEIS_VENDA = ['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'] as const

async function verificarAcesso() {
  const usuario = await getUsuarioLogado()
  if (!(GESTORES as readonly string[]).includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  return usuario
}

async function verificarAcessoVenda() {
  const usuario = await getUsuarioLogado()
  if (!(PAPEIS_VENDA as readonly string[]).includes(usuario.papel)) {
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

export async function criarPecaAction(input: PecaInput) {
  await verificarAcesso()
  const nome = input.nome.trim()
  if (!nome) throw new Error('Nome é obrigatório')
  if (input.valor < 0) throw new Error('Valor não pode ser negativo')
  if (input.quantidadeEstoque < 0) throw new Error('Estoque não pode ser negativo')

  const [nova] = await db.insert(pecasCatalogo).values({
    nome,
    valor: String(input.valor),
    quantidadeEstoque: input.quantidadeEstoque,
  }).returning({ id: pecasCatalogo.id })

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

export type ItemVendaPecaInput = { pecaId: string; quantidade: number }
export type PagamentoVendaPecaInput = { tipo: string; valor: number; operadora?: string; parcelas?: number; autorizacao?: string }
export type DadosVendaPeca = {
  lojaId: string
  clienteNome?: string
  itens: ItemVendaPecaInput[]
  pagamentos: PagamentoVendaPecaInput[]
}

// 'financiamento' precisa da mesma aprovação exigida em venda de moto/OS — só quem tem
// podeAprovarPagamentoSensivel vê esse dado. Ver src/lib/grupo.ts.
const TIPOS_PAGAMENTO_SENSIVEL_PECA = new Set(['financiamento'])
function temPagamentoSensivelPeca(pagamentos: PagamentoVendaPecaInput[]): boolean {
  return pagamentos.some(p => TIPOS_PAGAMENTO_SENSIVEL_PECA.has(p.tipo))
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

  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)
    if (!peca) throw new Error('Peça não encontrada')
    if (item.quantidade <= 0) throw new Error(`Quantidade inválida para ${peca.nome}`)
    if (peca.quantidadeEstoque < item.quantidade) {
      throw new Error(`Estoque insuficiente de ${peca.nome}: disponível ${peca.quantidadeEstoque}, pedido ${item.quantidade}`)
    }
  }

  const formaPagamento = input.pagamentos.length === 1 ? input.pagamentos[0].tipo : 'multiplo'

  const [venda] = await tx.insert(vendasPecas).values({
    lojaId: input.lojaId,
    vendedorId,
    clienteNome: input.clienteNome?.trim() || null,
    formaPagamento,
    pagamentos: input.pagamentos,
    valorTotal: valorTotal.toFixed(2),
  }).returning({ id: vendasPecas.id })

  for (const item of input.itens) {
    const peca = pecaById.get(item.pecaId)!
    await tx.insert(vendasPecasItens).values({
      vendaPecaId: venda.id,
      pecaId: item.pecaId,
      descricao: peca.nome,
      quantidade: String(item.quantidade),
      valorUnitario: peca.valor,
    })
    await tx.update(pecasCatalogo)
      .set({ quantidadeEstoque: peca.quantidadeEstoque - item.quantidade, atualizadoEm: new Date() })
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

  const valorTotal = input.pagamentos.reduce((s, p) => s + p.valor, 0)
  if (valorTotal <= 0) throw new Error('Valor total inválido')

  if (temPagamentoSensivelPeca(input.pagamentos) && !podeAprovarPagamentoSensivel(usuario)) {
    await db.insert(aprovacoesVenda).values({
      origem: 'peca',
      lojaId: input.lojaId,
      vendedorId: usuario.id,
      valor: valorTotal.toFixed(2),
      dadosVenda: input,
      motivo: 'Pagamento via Financiamento — venda de peças',
      tipo: 'pagamento_sensivel',
      status: 'pendente',
    })
    revalidatePath('/pecas')
    return { aguardandoAprovacao: true as const }
  }

  const resultado = await db.transaction(tx => aplicarVendaPeca(tx, usuario.id, input))
  revalidatePath('/pecas')
  return { aguardandoAprovacao: false as const, id: resultado.id }
}

export type VendaPecaResumo = Awaited<ReturnType<typeof listarVendasPecasAction>>[number]

export async function listarVendasPecasAction() {
  const usuario = await verificarAcessoVenda()
  const isAdmin = ['admin_geral', 'admin_socio'].includes(usuario.papel)
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const lojaFiltro = isAdmin ? lojaIdsGrupo : (usuario.lojaId ? [usuario.lojaId] : [])
  if (lojaFiltro.length === 0) return []

  return db
    .select({
      id: vendasPecas.id,
      numero: vendasPecas.numero,
      lojaNome: lojas.nome,
      vendedorNome: usuarios.nome,
      clienteNome: vendasPecas.clienteNome,
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
    .where(inArray(vendasPecas.lojaId, lojaFiltro))
    .orderBy(desc(vendasPecas.dataVenda))
    .limit(100)
}
