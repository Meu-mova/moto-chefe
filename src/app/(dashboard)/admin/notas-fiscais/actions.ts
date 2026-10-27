'use server'
import { db } from '@/lib/db'
import { notagatewayConfig, regrasFiscaisSaida, grupos } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { podeUsuarioVerGrupo } from '@/lib/grupo'
import { salvarCredencial, type CredencialPayload } from '@/lib/notagateway/credencial'
import { revalidatePath } from 'next/cache'
import { podeConfigurarFiscal } from '../../vendas/papeis-nf-saida'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { caminhoLogoDanfe, enviarLogoDanfe, previaLogoDanfe, type ResultadoLogo } from '@/lib/logo-danfe'
import { configNotaGateway } from '@/lib/notagateway/client'
import { vincularLogoNaNg } from '@/lib/notagateway/logo-ng'

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

export type { CredencialPayload }

/** Grava a credencial da Nota Gateway do grupo: só o admin_geral (#446). */
export async function salvarCredencialAction(data: CredencialPayload): Promise<{ ok: true } | { ok: false; erro: string }> {
  const r = await salvarCredencial(await getUsuarioLogado(), data)
  if (r.ok) revalidatePath('/admin/notas-fiscais')
  return r
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

// ─── Logo do DANFE (#428) ────────────────────────────────────────────────
// Permissão e Conta ficam em src/lib/logo-danfe.ts (teste de banco); aqui só a ligação
// com a sessão, a NG e o Storage.

async function arquivoDoForm(form: FormData): Promise<{ grupoId: string; arquivo: Buffer } | null> {
  const grupoId = form.get('grupoId')
  const arquivo = form.get('arquivo')
  if (typeof grupoId !== 'string' || !(arquivo instanceof File)) return null
  return { grupoId, arquivo: Buffer.from(await arquivo.arrayBuffer()) }
}

export async function previaLogoDanfeAction(form: FormData): Promise<{ ok: true; dataUrl: string; kb: number } | { ok: false; erro: string }> {
  const u = await getUsuarioLogado()
  const dados = await arquivoDoForm(form)
  if (!dados) return { ok: false, erro: 'Escolha um arquivo de imagem.' }
  const r = await previaLogoDanfe(u, dados.grupoId, dados.arquivo)
  if (!r.ok) return r
  return { ok: true, dataUrl: `data:image/png;base64,${r.png.toString('base64')}`, kb: r.kb }
}

export async function enviarLogoDanfeAction(form: FormData): Promise<ResultadoLogo> {
  const u = await getUsuarioLogado()
  const dados = await arquivoDoForm(form)
  if (!dados) return { ok: false, erro: 'Escolha um arquivo de imagem.' }
  const r = await enviarLogoDanfe(u, dados.grupoId, dados.arquivo, {
    configNg: configNotaGateway,
    vincularNaNg: vincularLogoNaNg,
    salvarCopia: async (grupoId, png) => {
      const admin = createSupabaseAdmin(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
      const { error } = await admin.storage.from('logos-danfe').upload(caminhoLogoDanfe(grupoId), png, { contentType: 'image/png', upsert: true })
      if (error) throw new Error(error.message)
    },
  })
  revalidatePath('/admin/notas-fiscais')
  return r
}
