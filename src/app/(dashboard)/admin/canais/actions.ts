'use server'
import { db } from '@/lib/db'
import { kommoSources, kommoPipelineGrupo, marketingInvestimento } from '@/lib/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, podeUsuarioVerGrupo } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

// aux_adm entra junto: é quem opera a loja e vai lançar a verba na prática.
const PAPEIS = ['admin_geral', 'admin_socio', 'aux_adm']

async function exigirGestor() {
  const u = await getUsuarioLogado()
  if (!PAPEIS.includes(u.papel)) throw new Error('Sem permissão')
  return u
}

// Nome do canal e funil da Kommo são da integração inteira, não de uma Conta: só o
// admin_geral mexe. Um gestor ligava ao próprio grupo o funil de outra Conta e passava
// a ver os leads dela (#328). A Kommo vai sair (#59).
async function exigirAdminGeral() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

function revalidar() {
  revalidatePath('/admin/canais')
  revalidatePath('/marketing')
}

export async function salvarNomeCanalAction(sourceId: number, nome: string) {
  await exigirAdminGeral()
  const limpo = nome.trim()
  // Nome vazio volta ao rótulo automático (canal · perfil) em vez de virar ''.
  await db.update(kommoSources)
    .set({ nome: limpo || null, atualizadoEm: new Date() })
    .where(eq(kommoSources.sourceId, sourceId))
  revalidar()
}

export async function definirGrupoFunilAction(pipelineId: string, grupoId: string | null) {
  const usuario = await exigirAdminGeral()
  // kommo_pipeline_grupo é a prova de tenant do /marketing inteiro (ver
  // src/lib/queries/marketing.ts) — sem esta checagem, um aux_adm reatribuía o
  // funil de outro lojista pro próprio grupo e passava a ver os leads do
  // concorrente, só mandando outro grupoId pra esta action. `null` (remover o
  // vínculo) continua liberado: não expõe dado de nenhum grupo.
  if (grupoId && !(await podeUsuarioVerGrupo(usuario, grupoId))) {
    throw new Error('Você não tem acesso a este grupo')
  }
  await db.insert(kommoPipelineGrupo)
    .values({ pipelineId, grupoId, atualizadoEm: new Date() })
    .onConflictDoUpdate({
      target: kommoPipelineGrupo.pipelineId,
      set: { grupoId, atualizadoEm: new Date() },
    })
  revalidar()
}

export async function salvarInvestimentoAction(dados: {
  id?: string
  mes: string            // "YYYY-MM"
  pipelineId: string | null
  plataforma: string
  valor: number
  observacao?: string | null
}) {
  const usuario = await exigirGestor()
  const grupo = await getGrupoAtivo(usuario)

  const plataforma = dados.plataforma.trim()
  if (!plataforma) throw new Error('Informe a plataforma (ex.: Meta Ads)')
  if (!/^\d{4}-\d{2}$/.test(dados.mes)) throw new Error('Mês inválido')
  if (!(dados.valor >= 0)) throw new Error('Valor inválido')

  // Sempre dia 1: a unidade do lançamento é o mês. Como string — Date cru vira
  // meia-noite UTC e volta um dia em BRT.
  const mes = `${dados.mes}-01`
  const valores = {
    grupoId: grupo.id,
    mes,
    pipelineId: dados.pipelineId || null,
    plataforma,
    valor: String(dados.valor),
    observacao: dados.observacao?.trim() || null,
  }

  if (dados.id) {
    await db.update(marketingInvestimento)
      .set(valores)
      .where(and(eq(marketingInvestimento.id, dados.id), eq(marketingInvestimento.grupoId, grupo.id)))
    revalidar()
    return
  }

  // Upsert explícito: o índice único é sobre coalesce(pipeline_id,''), expressão
  // que o onConflictDoUpdate do drizzle não consegue mirar. Mesmo mês + loja +
  // plataforma é correção do lançamento, não um segundo gasto.
  const chave = and(
    eq(marketingInvestimento.grupoId, grupo.id),
    eq(marketingInvestimento.mes, mes),
    eq(marketingInvestimento.plataforma, plataforma),
    sql`coalesce(${marketingInvestimento.pipelineId}, '') = ${dados.pipelineId ?? ''}`,
  )
  const [existente] = await db.select({ id: marketingInvestimento.id })
    .from(marketingInvestimento).where(chave).limit(1)

  if (existente) {
    await db.update(marketingInvestimento)
      .set({ valor: String(dados.valor), observacao: valores.observacao })
      .where(eq(marketingInvestimento.id, existente.id))
  } else {
    await db.insert(marketingInvestimento).values(valores)
  }
  revalidar()
}

export async function excluirInvestimentoAction(id: string) {
  const usuario = await exigirGestor()
  const grupo = await getGrupoAtivo(usuario)
  await db.delete(marketingInvestimento)
    .where(and(eq(marketingInvestimento.id, id), eq(marketingInvestimento.grupoId, grupo.id)))
  revalidar()
}
