'use server'
import { getUsuarioLogado, podeCategorizarDespesaBanco } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { db } from '@/lib/db'
import { despesas, despesasOpenFinance, categoriasDespesa, beneficiariosDespesa } from '@/lib/db/schema'
import { eq, and, asc, isNull } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio'] as const

type DespesaInput = {
  lojaId: string | null
  categoria: string
  /** A quem se destinou. Obrigatório nas categorias marcadas com exigeBeneficiario. */
  beneficiario?: string | null
  descricao?: string
  valor: string
  data: string
  formaPagamento: string
  banco: string
}

function assertAdmin(papel: string) {
  if (!ADMINS.includes(papel as typeof ADMINS[number])) {
    throw new Error('Sem permissão')
  }
}

// A aba "Importar do Banco" é mais restrita que o resto da tela: todo sócio vê,
// mas só quem passa por aqui categoriza. Ver podeCategorizarDespesaBanco.
function assertPodeCategorizar(usuario: { papel: string; email: string }) {
  assertAdmin(usuario.papel)
  if (!podeCategorizarDespesaBanco(usuario)) {
    throw new Error('Sem permissão para categorizar saídas do banco')
  }
}

/**
 * Devolve o beneficiário a gravar, ou null quando a categoria não pede.
 *
 * A exigência sai da CATEGORIA (categorias_despesa.exige_beneficiario), não de uma
 * lista de nomes aqui: assim uma categoria nova passa a pedir sem deploy. O nome
 * precisa estar no catálogo do grupo — texto livre viraria "Cesar", "cesar" e
 * "César" na mesma coluna, e o relatório por sócio não fecharia.
 */
async function beneficiarioValido(
  grupoId: string,
  categoria: string,
  beneficiario: string | null | undefined,
): Promise<string | null> {
  const [cat] = await db
    .select({ exige: categoriasDespesa.exigeBeneficiario })
    .from(categoriasDespesa)
    .where(eq(categoriasDespesa.nome, categoria))
    .limit(1)
  if (!cat?.exige) return null

  const nome = beneficiario?.trim()
  if (!nome) throw new Error(`A categoria "${categoria}" exige informar a quem se destinou`)

  const [encontrado] = await db
    .select({ nome: beneficiariosDespesa.nome })
    .from(beneficiariosDespesa)
    .where(and(
      eq(beneficiariosDespesa.grupoId, grupoId),
      eq(beneficiariosDespesa.nome, nome),
      eq(beneficiariosDespesa.ativo, true),
    ))
    .limit(1)
  if (!encontrado) throw new Error('Beneficiário não encontrado no grupo ativo')

  return encontrado.nome
}

function parseValor(v: string) {
  const n = parseFloat(v)
  if (isNaN(n) || n <= 0) throw new Error('Valor inválido')
  return v
}

async function lojaIdValidaNoGrupo(usuario: { papel: string; lojaId: string | null }, lojaId: string | null) {
  if (!lojaId) return null
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  return lojaIdsGrupo.includes(lojaId) ? lojaId : null
}

export async function criarDespesaAction(dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)
  const grupo = await getGrupoAtivo(usuario)
  const lojaId = await lojaIdValidaNoGrupo(usuario, dados.lojaId)

  const beneficiario = await beneficiarioValido(grupo.id, dados.categoria, dados.beneficiario)

  await db.insert(despesas).values({
    grupoId:        grupo.id,
    lojaId,
    usuarioId:      usuario.id,
    categoria:      dados.categoria,
    beneficiario,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function editarDespesaAction(id: string, dados: DespesaInput) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  parseValor(dados.valor)
  const grupo = await getGrupoAtivo(usuario)
  const lojaId = await lojaIdValidaNoGrupo(usuario, dados.lojaId)

  const beneficiario = await beneficiarioValido(grupo.id, dados.categoria, dados.beneficiario)

  const res = await db.update(despesas).set({
    lojaId,
    categoria:      dados.categoria,
    beneficiario,
    descricao:      dados.descricao?.trim() || null,
    valor:          dados.valor,
    data:           dados.data,
    formaPagamento: dados.formaPagamento,
    banco:          dados.banco,
  }).where(and(eq(despesas.id, id), eq(despesas.grupoId, grupo.id)))
    .returning({ id: despesas.id })

  if (!res.length) throw new Error('Despesa não encontrada')

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function excluirDespesaAction(id: string) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  const grupo = await getGrupoAtivo(usuario)

  const res = await db.delete(despesas)
    .where(and(eq(despesas.id, id), eq(despesas.grupoId, grupo.id)))
    .returning({ id: despesas.id })

  if (!res.length) throw new Error('Despesa não encontrada')

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function lancarDespesaOpenFinanceAction(
  id: string,
  categoria: string,
  lojaId: string | null,
  beneficiario?: string | null,
) {
  const usuario = await getUsuarioLogado()
  assertPodeCategorizar(usuario)
  if (!categoria.trim()) throw new Error('Categoria é obrigatória')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdValida = await lojaIdValidaNoGrupo(usuario, lojaId)
  const beneficiarioValidado = await beneficiarioValido(grupo.id, categoria, beneficiario)

  const [linha] = await db.select().from(despesasOpenFinance)
    .where(and(eq(despesasOpenFinance.id, id), eq(despesasOpenFinance.grupoId, grupo.id)))
    .limit(1)
  if (!linha) throw new Error('Saída não encontrada')
  if (linha.despesaId) throw new Error('Essa saída já foi lançada')

  await db.transaction(async (tx) => {
    const [despesaCriada] = await tx.insert(despesas).values({
      grupoId:        grupo.id,
      lojaId:         lojaIdValida,
      usuarioId:      usuario.id,
      categoria,
      beneficiario:   beneficiarioValidado,
      descricao:      linha.descricao,
      valor:          linha.valor,
      data:           linha.data.toISOString().split('T')[0],
      formaPagamento: linha.tipoOperacao ?? 'Outro',
      banco:          linha.banco,
    }).returning({ id: despesas.id })

    const atualizados = await tx.update(despesasOpenFinance).set({
      categoria,
      lojaId: lojaIdValida,
      despesaId: despesaCriada.id,
      lancadoPorId: usuario.id,
      lancadoEm: new Date(),
    }).where(and(
      eq(despesasOpenFinance.id, id),
      isNull(despesasOpenFinance.despesaId),
    )).returning({ id: despesasOpenFinance.id })

    if (atualizados.length === 0) {
      throw new Error('Essa saída já foi lançada')
    }
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function editarCategorizacaoOpenFinanceAction(
  id: string,
  categoria: string,
  lojaId: string | null,
  beneficiario?: string | null,
) {
  const usuario = await getUsuarioLogado()
  assertPodeCategorizar(usuario)
  if (!categoria.trim()) throw new Error('Categoria é obrigatória')

  const grupo = await getGrupoAtivo(usuario)
  const lojaIdValida = await lojaIdValidaNoGrupo(usuario, lojaId)
  const beneficiarioValidado = await beneficiarioValido(grupo.id, categoria, beneficiario)

  const [linha] = await db.select().from(despesasOpenFinance)
    .where(and(eq(despesasOpenFinance.id, id), eq(despesasOpenFinance.grupoId, grupo.id)))
    .limit(1)
  if (!linha) throw new Error('Saída não encontrada')
  if (!linha.despesaId) throw new Error('Essa saída ainda não foi lançada')

  await db.transaction(async (tx) => {
    await tx.update(despesas).set({
      lojaId: lojaIdValida,
      categoria,
      beneficiario: beneficiarioValidado,
    }).where(eq(despesas.id, linha.despesaId!))

    await tx.update(despesasOpenFinance).set({
      categoria,
      lojaId: lojaIdValida,
    }).where(eq(despesasOpenFinance.id, id))
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

export async function cancelarCategorizacaoOpenFinanceAction(id: string) {
  const usuario = await getUsuarioLogado()
  assertPodeCategorizar(usuario)
  const grupo = await getGrupoAtivo(usuario)

  const [linha] = await db.select().from(despesasOpenFinance)
    .where(and(eq(despesasOpenFinance.id, id), eq(despesasOpenFinance.grupoId, grupo.id)))
    .limit(1)
  if (!linha) throw new Error('Saída não encontrada')
  if (!linha.despesaId) throw new Error('Essa saída ainda não foi lançada')

  await db.transaction(async (tx) => {
    // Limpa a referência antes de excluir a despesa, pra não violar a FK.
    await tx.update(despesasOpenFinance).set({
      categoria: null,
      lojaId: null,
      despesaId: null,
      lancadoPorId: null,
      lancadoEm: null,
    }).where(eq(despesasOpenFinance.id, id))

    await tx.delete(despesas).where(eq(despesas.id, linha.despesaId!))
  })

  revalidatePath('/despesas')
  revalidatePath('/financeiro')
}

// ─── Beneficiários (a quem se destinou) ───────────────────────────────────────
// Catálogo por grupo, editável em /admin/categorias-caixa.

export async function listarBeneficiariosAction() {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  const grupo = await getGrupoAtivo(usuario)
  return db
    .select({ id: beneficiariosDespesa.id, nome: beneficiariosDespesa.nome, ativo: beneficiariosDespesa.ativo })
    .from(beneficiariosDespesa)
    .where(eq(beneficiariosDespesa.grupoId, grupo.id))
    .orderBy(asc(beneficiariosDespesa.ordem), asc(beneficiariosDespesa.nome))
}

export async function criarBeneficiarioAction(nome: string) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  const limpo = nome.trim()
  if (!limpo) throw new Error('Informe o nome')
  const grupo = await getGrupoAtivo(usuario)

  await db.insert(beneficiariosDespesa)
    .values({ grupoId: grupo.id, nome: limpo })
    // Índice único por (grupo, nome): recadastrar um nome existente não duplica.
    .onConflictDoNothing({ target: [beneficiariosDespesa.grupoId, beneficiariosDespesa.nome] })

  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}

/**
 * Liga e desliga em vez de apagar: as despesas guardam o NOME, e sumir com o
 * beneficiário do catálogo deixaria lançamentos antigos apontando para alguém que
 * a tela não sabe mais listar.
 */
export async function alternarBeneficiarioAtivoAction(id: string, ativo: boolean) {
  const usuario = await getUsuarioLogado()
  assertAdmin(usuario.papel)
  const grupo = await getGrupoAtivo(usuario)

  const res = await db.update(beneficiariosDespesa)
    .set({ ativo })
    .where(and(eq(beneficiariosDespesa.id, id), eq(beneficiariosDespesa.grupoId, grupo.id)))
    .returning({ id: beneficiariosDespesa.id })
  if (!res.length) throw new Error('Beneficiário não encontrado no grupo ativo')

  revalidatePath('/admin/categorias-caixa')
  revalidatePath('/despesas')
}
