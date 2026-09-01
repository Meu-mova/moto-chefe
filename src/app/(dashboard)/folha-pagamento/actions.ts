'use server'
import { db } from '@/lib/db'
import { funcionariosConfig, premiacaoFaixas, usuarios, folhaAjustesBase, folhaAdiantamentos } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { isBaseComissao, isTipoAjuste } from '@/lib/folha'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(u)
  return { usuario: u, grupo }
}

export async function salvarConfigFuncionarioAction(usuarioId: string, dados: {
  salario: number
  comissaoPercentual: number
  ajudaCusto: number | null
  ativo: boolean
  baseComissao: string
}) {
  const { usuario } = await checarAdmin()
  if (dados.salario < 0 || dados.comissaoPercentual < 0 || (dados.ajudaCusto ?? 0) < 0) {
    throw new Error('Valores não podem ser negativos')
  }
  if (!isBaseComissao(dados.baseComissao)) {
    throw new Error('Base de comissão inválida')
  }

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [alvo] = await db.select({ lojaId: usuarios.lojaId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1)
  if (!alvo || !alvo.lojaId || !lojaIdsGrupo.includes(alvo.lojaId)) {
    throw new Error('Funcionário não pertence ao grupo ativo')
  }

  await db.insert(funcionariosConfig).values({
    usuarioId,
    salario: String(dados.salario),
    comissaoPercentual: String(dados.comissaoPercentual),
    ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
    ativo: dados.ativo,
    baseComissao: dados.baseComissao,
  }).onConflictDoUpdate({
    target: funcionariosConfig.usuarioId,
    set: {
      salario: String(dados.salario),
      comissaoPercentual: String(dados.comissaoPercentual),
      ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
      ativo: dados.ativo,
      baseComissao: dados.baseComissao,
      atualizadoEm: new Date(),
    },
  })
  revalidatePath('/folha-pagamento')
}

// ─── Ajustes manuais de base ──────────────────────────────────────────────────
// Venda que aconteceu de verdade mas não foi lançada no sistema. Só afeta o
// cálculo da folha — não encosta em Financeiro, Despesas nem estoque.

export async function criarAjusteBaseAction(dados: {
  lojaId: string
  mes: string
  tipo: string
  usuarioId: string | null
  valor: number
  observacao: string
}) {
  const { usuario } = await checarAdmin()

  if (!/^\d{4}-\d{2}$/.test(dados.mes)) throw new Error('Mês inválido')
  if (!isTipoAjuste(dados.tipo)) throw new Error('Tipo de ajuste inválido')
  if (!dados.valor) throw new Error('Informe um valor diferente de zero')
  if (!dados.observacao.trim()) throw new Error('Descreva o motivo do ajuste')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(dados.lojaId)) {
    throw new Error('Loja não pertence ao grupo ativo')
  }

  // Funcionário opcional, mas se vier tem que ser da mesma loja do ajuste —
  // senão dá pra creditar a venda de uma loja na base de alguém de outra.
  if (dados.usuarioId) {
    const [alvo] = await db.select({ lojaId: usuarios.lojaId }).from(usuarios).where(eq(usuarios.id, dados.usuarioId)).limit(1)
    if (!alvo || alvo.lojaId !== dados.lojaId) {
      throw new Error('Funcionário não pertence à loja do ajuste')
    }
  }

  await db.insert(folhaAjustesBase).values({
    lojaId: dados.lojaId,
    mes: dados.mes,
    tipo: dados.tipo,
    usuarioId: dados.usuarioId,
    valor: String(dados.valor),
    observacao: dados.observacao.trim(),
    criadoPor: usuario.id,
  })
  revalidatePath('/folha-pagamento')
}

export async function excluirAjusteBaseAction(id: string) {
  const { usuario } = await checarAdmin()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [ajuste] = await db.select({ lojaId: folhaAjustesBase.lojaId })
    .from(folhaAjustesBase).where(eq(folhaAjustesBase.id, id)).limit(1)
  if (!ajuste || !lojaIdsGrupo.includes(ajuste.lojaId)) {
    throw new Error('Ajuste não encontrado no grupo ativo')
  }

  await db.delete(folhaAjustesBase).where(eq(folhaAjustesBase.id, id))
  revalidatePath('/folha-pagamento')
}

export async function criarFaixaPremiacaoAction(valorMinimoVendas: number, premiacao: number) {
  const { grupo } = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.insert(premiacaoFaixas).values({
    grupoId: grupo.id,
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  })
  revalidatePath('/folha-pagamento')
}

export async function editarFaixaPremiacaoAction(id: string, valorMinimoVendas: number, premiacao: number) {
  const { grupo } = await checarAdmin()
  if (valorMinimoVendas < 0 || premiacao < 0) throw new Error('Valores não podem ser negativos')
  await db.update(premiacaoFaixas).set({
    valorMinimoVendas: String(valorMinimoVendas),
    premiacao: String(premiacao),
  }).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}

export async function excluirFaixaPremiacaoAction(id: string) {
  const { grupo } = await checarAdmin()
  await db.delete(premiacaoFaixas).where(and(eq(premiacaoFaixas.id, id), eq(premiacaoFaixas.grupoId, grupo.id)))
  revalidatePath('/folha-pagamento')
}

// ─── Adiantamentos salariais ──────────────────────────────────────────────────
// Dinheiro entregue à pessoa antes do fechamento. SÓ desconta do total a pagar da
// folha do mês — não vira despesa nem saída de caixa (decisão do Cesar em
// 01/09/2026): o salário cheio já é contabilizado quando pago, e lançar os dois
// contaria o mesmo dinheiro duas vezes.

export async function criarAdiantamentoAction(dados: {
  usuarioId: string
  mes: string
  valor: number
  data: string | null
  observacao: string
}) {
  const { usuario } = await checarAdmin()

  if (!/^\d{4}-\d{2}$/.test(dados.mes)) throw new Error('Mês inválido')
  if (!(dados.valor > 0)) throw new Error('Informe um valor maior que zero')

  // A loja sai do cadastro do funcionário, não da tela: adiantamento é sempre da
  // loja de quem recebeu, e deixar escolher abriria espaço pra descontar na folha
  // de uma loja o dinheiro que saiu de outra.
  const [alvo] = await db
    .select({ lojaId: usuarios.lojaId })
    .from(usuarios)
    .where(eq(usuarios.id, dados.usuarioId))
    .limit(1)
  if (!alvo?.lojaId) throw new Error('Funcionário sem loja definida')

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (!lojaIdsGrupo.includes(alvo.lojaId)) {
    throw new Error('Funcionário não pertence ao grupo ativo')
  }

  await db.insert(folhaAdiantamentos).values({
    lojaId: alvo.lojaId,
    usuarioId: dados.usuarioId,
    mes: dados.mes,
    valor: String(dados.valor),
    data: dados.data || null,
    observacao: dados.observacao.trim() || null,
    criadoPor: usuario.id,
  })
  revalidatePath('/folha-pagamento')
}

export async function excluirAdiantamentoAction(id: string) {
  const { usuario } = await checarAdmin()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [adiantamento] = await db.select({ lojaId: folhaAdiantamentos.lojaId })
    .from(folhaAdiantamentos).where(eq(folhaAdiantamentos.id, id)).limit(1)
  if (!adiantamento || !lojaIdsGrupo.includes(adiantamento.lojaId)) {
    throw new Error('Adiantamento não encontrado no grupo ativo')
  }

  await db.delete(folhaAdiantamentos).where(eq(folhaAdiantamentos.id, id))
  revalidatePath('/folha-pagamento')
}
