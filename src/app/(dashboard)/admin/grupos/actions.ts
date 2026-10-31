'use server'
import { contasParaNovoGrupo, criarGrupo } from '@/lib/grupo-novo'
import { db } from '@/lib/db'
import { contas, grupos } from '@/lib/db/schema'
import { asc, eq, isNull, sql } from 'drizzle-orm'
import { moverGrupo, previaMoverGrupo } from '@/lib/mover-grupo'
import { origemDaRequisicaoAtual } from '@/lib/log-acoes'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { cifrar, decifrar } from '@/lib/cripto'
import { resumirEndpoint } from '@/lib/mcpai-credencial'
import { alterarTransferenciaEntreGrupos } from '@/lib/transferencia-grupos'
import { count } from 'drizzle-orm'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

/**
 * O valor cifrado da chave do mcp.ai NÃO sai daqui: esta lista alimenta um
 * componente de cliente (o dialog), ou seja, tudo o que ela devolve é
 * serializado para o navegador. Em lugar do valor vai um resumo — host e os
 * últimos caracteres — que é o bastante para a pessoa reconhecer qual chave
 * está salva sem que a credencial trafegue.
 */
export async function listarGruposAction() {
  await assertAdmin()
  const linhas = await db.select({ g: grupos, contaNome: contas.nome }).from(grupos)
    .innerJoin(contas, eq(contas.id, grupos.contaId)).orderBy(grupos.nome)
  return linhas.map(({ g: { mcpaiEndpointUrl, ...g }, contaNome }) => ({
    ...g,
    contaNome,
    mcpaiConfigurado: !!mcpaiEndpointUrl,
    mcpaiResumo: mcpaiEndpointUrl ? resumoDaChave(mcpaiEndpointUrl) : null,
  }))
}

function resumoDaChave(cifrado: string): string {
  try {
    return resumirEndpoint(decifrar(cifrado).toString('utf8'))
  } catch {
    // CERT_MASTER_KEY trocada ou valor corrompido: a tela precisa dizer que tem
    // algo salvo e que não serve, em vez de fingir que está tudo certo.
    return 'chave salva, mas ilegível — cadastre de novo'
  }
}

type GrupoInput = {
  nome: string
  cnpj: string
  ativo: boolean
  blingClientId?: string
  blingClientSecret?: string
  /**
   * URL do endpoint do mcp.ai desta empresa. Vazio NÃO apaga a chave que já
   * está salva: como o valor nunca volta para a tela (é credencial), um campo
   * em branco significa "não mexi nisso", não "apague". Para trocar, cola-se
   * a nova; para apagar, existe `mcpaiRemover`.
   */
  mcpaiEndpointUrl?: string
  mcpaiRemover?: boolean
  // Qualificação da empresa no contrato de compra e venda. Sem os três, o envio
  // de contrato fica bloqueado neste grupo (ver @/lib/assinatura/documento).
  razaoSocial?: string
  enderecoSede?: string
  cidadeSede?: string
  comarcaForo?: string
}

/**
 * `undefined` = não mexer na coluna; `null` = apagar; string = novo valor
 * cifrado. A URL do mcp.ai carrega o segredo de acesso dentro dela, por isso
 * nunca é gravada em claro (mesmo cofre do certificado A1).
 */
function cifrarChaveMcp(dados: GrupoInput): string | null | undefined {
  if (dados.mcpaiRemover) return null
  const url = dados.mcpaiEndpointUrl?.trim()
  if (!url) return undefined
  if (!/^https:\/\//i.test(url)) {
    throw new Error('A chave do mcp.ai precisa ser a URL do endpoint, começando com https://')
  }
  return cifrar(url)
}

export async function criarGrupoAction(dados: GrupoInput & { contaId?: string | null }) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  // Conta nova (padrão) ou uma existente escolhida pelo admin_geral (#199, ADR-0018).
  await db.transaction(async tx => {
    await criarGrupo(tx, {
      nome: dados.nome.trim(),
      cnpj: dados.cnpj.trim(),
      ativo: dados.ativo,
      blingClientId: dados.blingClientId?.trim() || null,
      blingClientSecret: dados.blingClientSecret?.trim() || null,
      mcpaiEndpointUrl: cifrarChaveMcp(dados) ?? null,
      razaoSocial: dados.razaoSocial?.trim() || null,
      enderecoSede: dados.enderecoSede?.trim() || null,
      cidadeSede: dados.cidadeSede?.trim() || null,
      comarcaForo: dados.comarcaForo?.trim() || null,
    }, dados.contaId || null)
  })
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

export async function listarContasAction() {
  await assertAdmin()
  return contasParaNovoGrupo()
}

export async function editarGrupoAction(id: string, dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  const chaveMcp = cifrarChaveMcp(dados)

  await db.update(grupos).set({
    nome: dados.nome.trim(),
    cnpj: dados.cnpj.trim(),
    ativo: dados.ativo,
    // Espalhamento condicional: sem chave nova e sem pedido de remoção, a
    // coluna nem entra no UPDATE — é o que faz "campo em branco" preservar a
    // credencial já cadastrada.
    ...(chaveMcp !== undefined ? { mcpaiEndpointUrl: chaveMcp } : {}),
    blingClientId: dados.blingClientId?.trim() || null,
    blingClientSecret: dados.blingClientSecret?.trim() || null,
    razaoSocial: dados.razaoSocial?.trim() || null,
    enderecoSede: dados.enderecoSede?.trim() || null,
    cidadeSede: dados.cidadeSede?.trim() || null,
    comarcaForo: dados.comarcaForo?.trim() || null,
  }).where(eq(grupos.id, id))
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
}

/** Contas com mais de um grupo e a chave de transferência entre grupos (#552). */
export async function listarContasTransferenciaAction() {
  await assertAdmin()
  const linhas = await db.select({ id: contas.id, nome: contas.nome, ligada: contas.transferenciaEntreGrupos, grupos: count(grupos.id) })
    .from(contas).innerJoin(grupos, eq(grupos.contaId, contas.id))
    .groupBy(contas.id, contas.nome, contas.transferenciaEntreGrupos)
    .orderBy(contas.nome)
  return linhas.filter(c => c.grupos > 1)
}

export async function alterarTransferenciaEntreGruposAction(contaId: string, ligada: boolean) {
  const usuario = await getUsuarioLogado()
  const r = await alterarTransferenciaEntreGrupos(usuario, contaId, ligada)
  if (r.ok) revalidatePath('/admin/grupos')
  return r
}

// ─── Mover grupo para outra Conta (#554) ─────────────────────────────────────

/** Contas ativas para onde um grupo pode ir, com os grupos de cada uma para reconhecer. */
export async function contasDestinoAction() {
  await assertAdmin()
  return db.select({
    id: contas.id,
    nome: contas.nome,
    grupos: sql<string[]>`coalesce(array_agg(${grupos.nome} order by ${grupos.nome}) filter (where ${grupos.id} is not null), '{}')`,
  }).from(contas).leftJoin(grupos, eq(grupos.contaId, contas.id))
    .where(isNull(contas.desativadaEm)).groupBy(contas.id).orderBy(asc(contas.nome))
}

/** Só leitura: o que iria junto e o que bloqueia. */
export async function previaMoverGrupoAction(grupoId: string, contaDestinoId: string) {
  await assertAdmin()
  return previaMoverGrupo(db, grupoId, contaDestinoId)
}

export async function moverGrupoAction(grupoId: string, contaDestinoId: string) {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') return { ok: false as const, erro: 'Acesso restrito ao Admin Geral', previa: null }
  const origem = await origemDaRequisicaoAtual()
  const r = await db.transaction(tx => moverGrupo(tx, u, grupoId, contaDestinoId, origem))
  if (r.ok) {
    revalidatePath('/admin/grupos')
    revalidatePath('/', 'layout')
  }
  return r
}
