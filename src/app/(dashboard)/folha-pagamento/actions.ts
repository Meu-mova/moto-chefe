'use server'
import { db } from '@/lib/db'
import { funcionariosConfig, premiacaoFaixas, usuarios, folhaAjustesBase, folhaAdiantamentos, folhaRegrasComissao } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'
import { isBaseComissao, isTipoAjuste, isTipoRegra } from '@/lib/folha'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  const grupo = await getGrupoAtivo(u)
  return { usuario: u, grupo }
}

// Comissão saiu daqui na migração 0076: virou N regras por pessoa, em
// folhaRegrasComissao. As colunas antigas de funcionarios_config continuam no banco
// como registro do que foi migrado, mas ninguém mais escreve nelas.
export async function salvarConfigFuncionarioAction(usuarioId: string, dados: {
  salario: number
  ajudaCusto: number | null
  /** Vale fixo descontado todo mês. NULL = não tem. Ver migração 0075. */
  adiantamentoFixo?: number | null
  ativo: boolean
}) {
  const { usuario } = await checarAdmin()
  if (dados.salario < 0 || (dados.ajudaCusto ?? 0) < 0) {
    throw new Error('Valores não podem ser negativos')
  }
  // Adiantamento negativo viraria bônus escondido dentro do campo de desconto.
  if ((dados.adiantamentoFixo ?? 0) < 0) {
    throw new Error('Adiantamento fixo não pode ser negativo')
  }

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [alvo] = await db.select({ lojaId: usuarios.lojaId }).from(usuarios).where(eq(usuarios.id, usuarioId)).limit(1)
  if (!alvo || !alvo.lojaId || !lojaIdsGrupo.includes(alvo.lojaId)) {
    throw new Error('Funcionário não pertence ao grupo ativo')
  }

  await db.insert(funcionariosConfig).values({
    usuarioId,
    salario: String(dados.salario),
    ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
    adiantamentoFixo: dados.adiantamentoFixo != null ? String(dados.adiantamentoFixo) : null,
    ativo: dados.ativo,
  }).onConflictDoUpdate({
    target: funcionariosConfig.usuarioId,
    set: {
      salario: String(dados.salario),
      ajudaCusto: dados.ajudaCusto != null ? String(dados.ajudaCusto) : null,
      adiantamentoFixo: dados.adiantamentoFixo != null ? String(dados.adiantamentoFixo) : null,
      ativo: dados.ativo,
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

// ─── Regras de comissão e premiação ───────────────────────────────────────────
// Cada pessoa pode ter várias (migração 0076). O que existia em
// funcionarios_config virou uma regra de comissão sem vigência — ver folha.ts.

export async function criarRegraComissaoAction(dados: {
  usuarioId: string
  tipo: string
  base: string
  percentual: number
  vigenciaInicio: string | null
  vigenciaFim: string | null
  descricao: string
}) {
  const { usuario } = await checarAdmin()

  if (!isTipoRegra(dados.tipo)) throw new Error('Tipo de regra inválido')
  if (!isBaseComissao(dados.base)) throw new Error('Base de cálculo inválida')
  if (!(dados.percentual > 0)) throw new Error('Informe um percentual maior que zero')
  for (const mes of [dados.vigenciaInicio, dados.vigenciaFim]) {
    if (mes && !/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês de vigência inválido')
  }
  // Intervalo invertido não dá erro em lugar nenhum depois: a regra simplesmente
  // nunca vale, e ninguém descobre até a folha sair menor do que devia.
  if (dados.vigenciaInicio && dados.vigenciaFim && dados.vigenciaFim < dados.vigenciaInicio) {
    throw new Error('O fim da vigência não pode ser antes do início')
  }

  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [alvo] = await db
    .select({ lojaId: usuarios.lojaId })
    .from(usuarios)
    .where(eq(usuarios.id, dados.usuarioId))
    .limit(1)
  if (!alvo?.lojaId || !lojaIdsGrupo.includes(alvo.lojaId)) {
    throw new Error('Funcionário não pertence ao grupo ativo')
  }

  await db.insert(folhaRegrasComissao).values({
    usuarioId: dados.usuarioId,
    tipo: dados.tipo,
    base: dados.base,
    percentual: String(dados.percentual),
    vigenciaInicio: dados.vigenciaInicio || null,
    vigenciaFim: dados.vigenciaFim || null,
    descricao: dados.descricao.trim() || null,
    criadoPor: usuario.id,
  })
  revalidatePath('/folha-pagamento')
}

/**
 * Encerra a regra no mês informado em vez de apagar.
 *
 * Apagar reescreveria o passado: a folha é recalculada a cada abertura, então uma
 * regra removida some também dos meses em que ela valeu e foi paga.
 */
export async function encerrarRegraComissaoAction(id: string, vigenciaFim: string) {
  const { usuario } = await checarAdmin()
  if (!/^\d{4}-\d{2}$/.test(vigenciaFim)) throw new Error('Mês inválido')

  const regra = await regraDoGrupo(usuario, id)
  if (regra.vigenciaInicio && vigenciaFim < regra.vigenciaInicio) {
    throw new Error('O fim da vigência não pode ser antes do início')
  }

  await db.update(folhaRegrasComissao)
    .set({ vigenciaFim })
    .where(eq(folhaRegrasComissao.id, id))
  revalidatePath('/folha-pagamento')
}

/**
 * Apaga a regra de vez. Só para corrigir cadastro errado — para parar de valer a
 * partir de um mês, use encerrarRegraComissaoAction, que preserva o histórico.
 */
export async function excluirRegraComissaoAction(id: string) {
  const { usuario } = await checarAdmin()
  await regraDoGrupo(usuario, id)
  await db.delete(folhaRegrasComissao).where(eq(folhaRegrasComissao.id, id))
  revalidatePath('/folha-pagamento')
}

async function regraDoGrupo(usuario: { id: string; papel: string; lojaId: string | null }, id: string) {
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [regra] = await db
    .select({
      id: folhaRegrasComissao.id,
      vigenciaInicio: folhaRegrasComissao.vigenciaInicio,
      lojaId: usuarios.lojaId,
    })
    .from(folhaRegrasComissao)
    .innerJoin(usuarios, eq(folhaRegrasComissao.usuarioId, usuarios.id))
    .where(eq(folhaRegrasComissao.id, id))
    .limit(1)
  if (!regra?.lojaId || !lojaIdsGrupo.includes(regra.lojaId)) {
    throw new Error('Regra não encontrada no grupo ativo')
  }
  return regra
}
