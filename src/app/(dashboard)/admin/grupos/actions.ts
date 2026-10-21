'use server'
import { db } from '@/lib/db'
import { contas, grupos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { cifrar, decifrar } from '@/lib/cripto'
import { resumirEndpoint } from '@/lib/mcpai-credencial'

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
  const linhas = await db.select().from(grupos).orderBy(grupos.nome)
  return linhas.map(({ mcpaiEndpointUrl, ...g }) => ({
    ...g,
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

export async function criarGrupoAction(dados: GrupoInput) {
  await assertAdmin()
  if (!dados.nome.trim()) throw new Error('Nome obrigatório')
  if (!dados.cnpj.trim()) throw new Error('CNPJ obrigatório')

  // Grupo novo nasce numa Conta nova (ADR-0018); escolher uma Conta existente vem depois (#263).
  await db.transaction(async tx => {
    const [conta] = await tx.insert(contas).values({ nome: dados.nome.trim() }).returning({ id: contas.id })
    await tx.insert(grupos).values({
      contaId: conta.id,
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
    })
  })
  revalidatePath('/admin/grupos')
  revalidatePath('/', 'layout')
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
