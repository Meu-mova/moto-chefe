'use server'
import { db } from '@/lib/db'
import { precificacao, configuracaoTaxas } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { eq, and, sql } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { chaveNome, modeloPrecificavel } from '@/lib/precificacao-modelos'
import { travarPrecificacaoDoGrupo } from '@/lib/tabela-preco-padrao'
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

/**
 * Grava o preço de um modelo. `precId` vem preenchido quando a linha já tem
 * preço; quando vem null é um modelo do catálogo que ainda não foi precificado
 * neste grupo, e aí a linha nasce agora.
 *
 * O nome grava em caixa alta porque é ele que casa com `modelos.modelo` (que é
 * todo caixa alta) nas consultas de preço mínimo e de custo. O upsert é por
 * (grupo, nome) para não criar duas linhas do mesmo modelo se dois usuários
 * salvarem ao mesmo tempo.
 */
export async function salvarPrecoAction(data: {
  precId?: string | null
  nome: string
  valorMinimo: string
  custo?: string
}) {
  const grupo = await checarAdmin()
  const nome = data.nome.trim().toUpperCase()
  if (!nome) throw new Error('Nome do modelo é obrigatório')

  // Só modelo do catálogo da Conta (#496). O preço avulso antigo continua
  // editável enquanto mantém o próprio nome.
  const atual = data.precId
    ? (await db.select({ nome: precificacao.nome }).from(precificacao)
        .where(and(eq(precificacao.id, data.precId), eq(precificacao.grupoId, grupo.id))).limit(1))[0]
    : undefined
  const mantemNome = !!atual && chaveNome(atual.nome) === nome
  if (!mantemNome && !(await modeloPrecificavel(grupo.contaId, nome))) {
    throw new Error('Modelo não encontrado')
  }

  if (data.precId) {
    await db.update(precificacao).set({
      nome,
      valorMinimo: data.valorMinimo,
      custo: data.custo || null,
    }).where(and(eq(precificacao.id, data.precId), eq(precificacao.grupoId, grupo.id)))
  } else {
    // Mesma trava do preenchimento automático: os dois conferem e inserem pelo nome (#522).
    await db.transaction(async tx => {
      await travarPrecificacaoDoGrupo(tx, grupo.id)
      const [existente] = await tx
        .select({ id: precificacao.id })
        .from(precificacao)
        .where(and(eq(precificacao.grupoId, grupo.id), sql`upper(btrim(${precificacao.nome})) = ${nome}`))
        .limit(1)

      if (existente) {
        await tx.update(precificacao).set({
          nome,
          valorMinimo: data.valorMinimo,
          custo: data.custo || null,
        }).where(eq(precificacao.id, existente.id))
      } else {
        await tx.insert(precificacao).values({
          grupoId: grupo.id,
          nome,
          valorMinimo: data.valorMinimo,
          custo: data.custo || null,
          taxaPix: '0',
          taxasCartao: {},
          taxasLink: {},
          taxasFinanciamento: {},
        })
      }
    })
  }
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
