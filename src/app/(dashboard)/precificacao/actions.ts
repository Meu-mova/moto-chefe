'use server'
import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { eq, and, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { salvarPadraoSimulador, salvarPrecoDoModelo } from '@/lib/precificacao-modelos'
import { ehPadraoSimulador } from '@/lib/simulador-padrao'
import { ehMatrizDePlanilha } from '@/lib/planilha-precos'
import { gravarImportacao, previaDaImportacao } from '@/lib/importar-precos'

const ADMINS = ['admin_geral', 'admin_socio']

async function checarAdmin() {
  const u = await getUsuarioLogado()
  if (!ADMINS.includes(u.papel)) throw new Error('Sem permissão')
  return getGrupoAtivo(u)
}

export type TaxasPayload = {
  taxasCartao: Record<string, number>
  taxasDebito: Record<string, number>
  taxasLink: Record<string, number>
  taxasFinanciamento: Record<string, number>
  freteValorKm: string
  freteKmGratis: number
  freteValorFixo: string
  imposto: string
}

export async function salvarTaxasAction(data: TaxasPayload) {
  const grupo = await checarAdmin()
  await db
    .insert(configuracaoTaxas)
    .values({ grupoId: grupo.id, ...data })
    .onConflictDoUpdate({
      target: configuracaoTaxas.grupoId,
      set: {
        taxasCartao: data.taxasCartao,
        taxasDebito: data.taxasDebito,
        taxasLink: data.taxasLink,
        taxasFinanciamento: data.taxasFinanciamento,
        freteValorKm: data.freteValorKm,
        freteKmGratis: data.freteKmGratis,
        freteValorFixo: data.freteValorFixo,
        imposto: data.imposto,
        atualizadoEm: sql`NOW()`,
      },
    })
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
  revalidatePath('/financeiro')
}

/** Grava o preço de um modelo do grupo ativo; ver salvarPrecoDoModelo. */
export async function salvarPrecoAction(data: {
  precId?: string | null
  nome: string
  valorMinimo: string
  custo?: string
  /** Total em 12x do padrão 'avista_12x': ausente não mexe; vazio limpa. */
  valor12x?: string
}) {
  const grupo = await checarAdmin()
  await salvarPrecoDoModelo(grupo, data)
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function salvarPadraoSimuladorAction(padrao: string) {
  const grupo = await checarAdmin()
  if (!ehPadraoSimulador(padrao)) throw new Error('Padrão inválido')
  await salvarPadraoSimulador(grupo.id, padrao)
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function toggleAtivoAction(id: string, ativo: boolean) {
  const grupo = await checarAdmin()
  await db.update(precificacao).set({ ativo }).where(and(eq(precificacao.id, id), eq(precificacao.grupoId, grupo.id)))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

export async function excluirModeloAction(id: string) {
  const grupo = await checarAdmin()
  await db.delete(precificacao).where(and(eq(precificacao.id, id), eq(precificacao.grupoId, grupo.id)))
  revalidatePath('/precificacao')
  revalidatePath('/simulador')
}

// Planilha de preço do sócio (#522): a prévia não grava; a gravação lê a planilha de novo
// e recebe do navegador só os modelos cuja troca de preço foi aceita.
export async function previaImportacaoAction(matriz: unknown) {
  const grupo = await checarAdmin()
  if (!ehMatrizDePlanilha(matriz)) return { ok: false as const, erro: 'Planilha ilegível' }
  return previaDaImportacao({ grupoId: grupo.id, contaId: grupo.contaId, matriz })
}

export async function importarPrecosAction(matriz: unknown, trocar: unknown) {
  const grupo = await checarAdmin()
  if (!ehMatrizDePlanilha(matriz) || !Array.isArray(trocar) || !trocar.every(t => typeof t === 'string')) {
    return { ok: false as const, erro: 'Planilha ilegível' }
  }
  const r = await gravarImportacao({ grupoId: grupo.id, contaId: grupo.contaId, matriz, trocar })
  if (r.ok) {
    revalidatePath('/precificacao')
    revalidatePath('/simulador')
  }
  return r
}
