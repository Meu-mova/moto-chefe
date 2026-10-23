'use server'
import { db } from '@/lib/db'
import { notagatewayConfig, regrasFiscaisSaida, grupos } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { cifrar } from '@/lib/cripto'
import { revalidatePath } from 'next/cache'
import { podeConfigurarFiscal } from '../../vendas/papeis-nf-saida'

/**
 * Configuração fiscal por grupo. Cada grupo é um CNPJ com contabilidade
 * própria, e o MOVA vai ser vendido para outros lojistas — então nada aqui é
 * global, nem a credencial nem a regra de saída.
 */

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (!podeConfigurarFiscal(u.papel)) {
    throw new Error('Acesso restrito a Admin Geral e Sócio')
  }
  return u
}

async function assertGrupo(usuario: Awaited<ReturnType<typeof assertAdmin>>, grupoId: string) {
  const [g] = await db.select({ id: grupos.id }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  if (!g || !(await podeUsuarioVerGrupo(usuario, grupoId))) throw new Error('Grupo não encontrado')
  return g
}

export type CredencialPayload = {
  grupoId: string
  /** Vazio = não mexer no token já gravado (a tela nunca mostra o valor atual). */
  token: string
  ambiente: 'Homologacao' | 'Producao'
  serieNfe: string
  proximoNumero: number
}

/**
 * Grava a credencial da Nota Gateway do grupo.
 *
 * O token é cifrado como o certificado A1 (`src/lib/cripto.ts`) e nunca volta
 * para a tela — quem quiser trocar digita o novo; campo vazio preserva o atual.
 * O `empresaId` não entra aqui: ele vem da API no cadastro da empresa.
 */
export async function salvarCredencialAction(data: CredencialPayload) {
  const usuario = await assertAdmin()
  await assertGrupo(usuario, data.grupoId)

  const serie = data.serieNfe.trim() || '1'
  const numero = Number.isFinite(data.proximoNumero) && data.proximoNumero > 0 ? Math.trunc(data.proximoNumero) : 1

  const jaTem = await db
    .select({ grupoId: notagatewayConfig.grupoId })
    .from(notagatewayConfig)
    .where(eq(notagatewayConfig.grupoId, data.grupoId))
    .limit(1)

  if (!jaTem.length && !data.token.trim()) {
    throw new Error('Informe o token da Nota Gateway para configurar este grupo')
  }

  const comum = {
    ambiente: data.ambiente,
    serieNfe: serie,
    proximoNumero: numero,
    atualizadoEm: sql`NOW()` as unknown as Date,
  }

  if (jaTem.length) {
    await db
      .update(notagatewayConfig)
      .set(data.token.trim() ? { ...comum, token: cifrar(data.token.trim()) } : comum)
      .where(eq(notagatewayConfig.grupoId, data.grupoId))
  } else {
    await db.insert(notagatewayConfig).values({
      grupoId: data.grupoId,
      token: cifrar(data.token.trim()),
      ...comum,
    })
  }

  revalidatePath('/admin/notas-fiscais')
}

export type RegraPayload = {
  grupoId: string
  naturezaOperacao: string
  cfopInterno: string
  cstIcmsInterno: string
  cfopInterestadual: string
  cstIcmsInterestadual: string
  aliquotaIcmsInterestadual: string
  cstPis: string
  aliquotaPis: string
  cstCofins: string
  aliquotaCofins: string
  cstIpi: string
  cstIbsCbs: string
  classTribIbsCbs: string
  crt: number
  /** '' = usar a origem real da moto (a da nota de entrada). */
  origemFixa: string
  ibptFederal: string
  ibptEstadual: string
}

const ouNulo = (v: string) => (v.trim() === '' ? null : v.trim())

/**
 * Grava a regra de saída do grupo — o que a NOSSA nota leva e não vem do XML
 * de entrada. A do Sul de Minas nasceu das ~200 notas já aceitas pela SEFAZ;
 * a de um lojista novo começa vazia e quem preenche é o contador dele.
 */
export async function salvarRegraAction(data: RegraPayload) {
  const usuario = await assertAdmin()
  await assertGrupo(usuario, data.grupoId)

  const obrigatorios: [string, string][] = [
    ['Natureza da operação', data.naturezaOperacao],
    ['CFOP dentro da UF', data.cfopInterno],
    ['CST do ICMS dentro da UF', data.cstIcmsInterno],
    ['CFOP fora da UF', data.cfopInterestadual],
    ['CST do ICMS fora da UF', data.cstIcmsInterestadual],
    ['CST do PIS', data.cstPis],
    ['CST da COFINS', data.cstCofins],
  ]
  const faltando = obrigatorios.filter(([, v]) => !v.trim()).map(([n]) => n)
  if (faltando.length) throw new Error(`Preencha: ${faltando.join(', ')}`)

  const valores = {
    naturezaOperacao: data.naturezaOperacao.trim(),
    cfopInterno: data.cfopInterno.trim(),
    cstIcmsInterno: data.cstIcmsInterno.trim(),
    cfopInterestadual: data.cfopInterestadual.trim(),
    cstIcmsInterestadual: data.cstIcmsInterestadual.trim(),
    aliquotaIcmsInterestadual: ouNulo(data.aliquotaIcmsInterestadual),
    cstPis: data.cstPis.trim(),
    aliquotaPis: ouNulo(data.aliquotaPis),
    cstCofins: data.cstCofins.trim(),
    aliquotaCofins: ouNulo(data.aliquotaCofins),
    cstIpi: ouNulo(data.cstIpi),
    cstIbsCbs: ouNulo(data.cstIbsCbs),
    classTribIbsCbs: ouNulo(data.classTribIbsCbs),
    crt: data.crt,
    origemFixa: ouNulo(data.origemFixa),
    ibptFederal: ouNulo(data.ibptFederal),
    ibptEstadual: ouNulo(data.ibptEstadual),
    atualizadoEm: sql`NOW()` as unknown as Date,
  }

  await db
    .insert(regrasFiscaisSaida)
    .values({ grupoId: data.grupoId, ...valores })
    .onConflictDoUpdate({ target: regrasFiscaisSaida.grupoId, set: valores })

  revalidatePath('/admin/notas-fiscais')
}
