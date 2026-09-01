'use server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { holerites, usuarios } from '@/lib/db/schema'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'
import { getUsuarioLogado } from '@/lib/auth'
import { listarLojaIdsDoGrupoAtivo } from '@/lib/grupo'

// Holerites que a contabilidade manda todo mês, em PDF (migração 0077).
//
// Em arquivo próprio, e não em actions.ts: aquele arquivo cuida do CÁLCULO da
// folha, e aqui é só guarda de documento. O bucket é privado e o link sai
// assinado por 10 minutos — ver getHoleriteUrlAction.

const ADMINS = ['admin_geral', 'admin_socio']
const BUCKET = 'holerites'
const TIPOS = ['adiantamento', 'salario']
const TAMANHO_MAXIMO = 10 * 1024 * 1024

async function checarAdmin() {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')
  return usuario
}

function storageAdmin() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/** Confere que o funcionário é do grupo ativo. Sem isso, um id de outro grupo na
 *  requisição penduraria o holerite na pessoa errada. */
async function funcionarioDoGrupo(
  usuario: { id: string; papel: string; lojaId: string | null },
  usuarioId: string,
) {
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  const [alvo] = await db
    .select({ lojaId: usuarios.lojaId })
    .from(usuarios)
    .where(eq(usuarios.id, usuarioId))
    .limit(1)
  if (!alvo?.lojaId || !lojaIdsGrupo.includes(alvo.lojaId)) {
    throw new Error('Funcionário não pertence ao grupo ativo')
  }
}

export type HoleriteRow = {
  id: string
  usuarioId: string
  mes: string
  tipo: string
  arquivoNome: string
  tamanho: number | null
  enviadoEm: Date
  enviadoPorNome: string | null
}

export async function listarHoleritesAction(mes: string): Promise<HoleriteRow[]> {
  const usuario = await checarAdmin()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)
  if (lojaIdsGrupo.length === 0) return []

  const rows = await db
    .select({
      id: holerites.id,
      usuarioId: holerites.usuarioId,
      mes: holerites.mes,
      tipo: holerites.tipo,
      arquivoNome: holerites.arquivoNome,
      tamanho: holerites.tamanho,
      enviadoEm: holerites.enviadoEm,
      enviadoPorId: holerites.enviadoPor,
      lojaId: usuarios.lojaId,
    })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(and(eq(holerites.mes, mes), inArray(usuarios.lojaId, lojaIdsGrupo)))

  // Nome de quem enviou vem de uma segunda consulta em vez de um segundo join na
  // mesma tabela: são poucas linhas por mês e o alias deixaria a query bem menos
  // legível do que este de-para.
  const enviantes = [...new Set(rows.map(r => r.enviadoPorId).filter((id): id is string => !!id))]
  const nomePorId = new Map<string, string>()
  if (enviantes.length > 0) {
    const pessoas = await db
      .select({ id: usuarios.id, nome: usuarios.nome })
      .from(usuarios)
      .where(inArray(usuarios.id, enviantes))
    for (const p of pessoas) nomePorId.set(p.id, p.nome)
  }

  return rows.map(r => ({
    id: r.id,
    usuarioId: r.usuarioId,
    mes: r.mes,
    tipo: r.tipo,
    arquivoNome: r.arquivoNome,
    tamanho: r.tamanho,
    enviadoEm: r.enviadoEm,
    enviadoPorNome: r.enviadoPorId ? (nomePorId.get(r.enviadoPorId) ?? null) : null,
  }))
}

export async function uploadHoleriteAction(formData: FormData) {
  const usuario = await checarAdmin()

  const usuarioId = String(formData.get('usuarioId') ?? '')
  const mes = String(formData.get('mes') ?? '')
  const tipo = String(formData.get('tipo') ?? '')
  const file = formData.get('file') as File | null

  if (!/^\d{4}-\d{2}$/.test(mes)) throw new Error('Mês inválido')
  if (!TIPOS.includes(tipo)) throw new Error('Tipo de holerite inválido')
  if (!file || file.size === 0) throw new Error('Arquivo não enviado')
  // Só PDF: é o que a contabilidade manda, e aceitar imagem faria o arquivo do
  // holerite virar print de tela sem quem conferir.
  if (file.type !== 'application/pdf') throw new Error('Envie o holerite em PDF')
  if (file.size > TAMANHO_MAXIMO) throw new Error('Arquivo muito grande. Máximo: 10MB.')

  await funcionarioDoGrupo(usuario, usuarioId)

  const storage = storageAdmin()
  const filePath = `${mes}/${usuarioId}-${tipo}-${crypto.randomUUID()}.pdf`

  const { error } = await storage.storage
    .from(BUCKET)
    .upload(filePath, file, { contentType: 'application/pdf' })
  if (error) throw new Error(`Erro no upload: ${error.message}`)

  // Reenvio substitui: o índice único é (usuario, mes, tipo). Guarda o caminho
  // antigo ANTES do upsert para apagar o arquivo órfão depois — sem isso o bucket
  // acumula uma cópia a cada correção da contabilidade.
  const [anterior] = await db
    .select({ arquivoPath: holerites.arquivoPath })
    .from(holerites)
    .where(and(
      eq(holerites.usuarioId, usuarioId),
      eq(holerites.mes, mes),
      eq(holerites.tipo, tipo),
    ))
    .limit(1)

  await db.insert(holerites).values({
    usuarioId,
    mes,
    tipo,
    arquivoPath: filePath,
    arquivoNome: file.name,
    tamanho: file.size,
    enviadoPor: usuario.id,
  }).onConflictDoUpdate({
    target: [holerites.usuarioId, holerites.mes, holerites.tipo],
    set: {
      arquivoPath: filePath,
      arquivoNome: file.name,
      tamanho: file.size,
      enviadoPor: usuario.id,
      enviadoEm: new Date(),
    },
  })

  // Depois do upsert: se a gravação falhar, o arquivo novo é que fica órfão, e é
  // melhor sobrar arquivo do que a linha apontar para um PDF já apagado.
  if (anterior?.arquivoPath && anterior.arquivoPath !== filePath) {
    await storage.storage.from(BUCKET).remove([anterior.arquivoPath])
  }

  revalidatePath('/folha-pagamento')
}

export async function removerHoleriteAction(id: string) {
  const usuario = await checarAdmin()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [row] = await db
    .select({ arquivoPath: holerites.arquivoPath, lojaId: usuarios.lojaId })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(eq(holerites.id, id))
    .limit(1)
  if (!row?.lojaId || !lojaIdsGrupo.includes(row.lojaId)) {
    throw new Error('Holerite não encontrado no grupo ativo')
  }

  await db.delete(holerites).where(eq(holerites.id, id))
  await storageAdmin().storage.from(BUCKET).remove([row.arquivoPath])

  revalidatePath('/folha-pagamento')
}

/**
 * Link temporário para abrir o PDF.
 *
 * Recebe o ID da linha, nunca o caminho vindo do cliente: assim não existe
 * caminho para sanear, e o acesso é decidido pela mesma consulta que prova que o
 * holerite é de alguém do grupo ativo.
 */
export async function getHoleriteUrlAction(id: string): Promise<string> {
  const usuario = await checarAdmin()
  const lojaIdsGrupo = await listarLojaIdsDoGrupoAtivo(usuario)

  const [row] = await db
    .select({ arquivoPath: holerites.arquivoPath, lojaId: usuarios.lojaId })
    .from(holerites)
    .innerJoin(usuarios, eq(holerites.usuarioId, usuarios.id))
    .where(eq(holerites.id, id))
    .limit(1)
  if (!row?.lojaId || !lojaIdsGrupo.includes(row.lojaId)) {
    throw new Error('Holerite não encontrado no grupo ativo')
  }

  const { data, error } = await storageAdmin().storage
    .from(BUCKET)
    .createSignedUrl(row.arquivoPath, 600)
  if (error || !data?.signedUrl) throw new Error('Erro ao gerar o link do holerite')
  return data.signedUrl
}

// ─── Lado do funcionário ──────────────────────────────────────────────────────
// /meus-documentos. Sem gate de papel: qualquer pessoa logada vê os holerites
// DELA. O que separa uma pessoa da outra é o filtro por usuarioId nas duas
// funções abaixo — nunca um papel, porque não existe papel "dono deste arquivo".

export type MeuHoleriteRow = {
  id: string
  mes: string
  tipo: string
  arquivoNome: string
  tamanho: number | null
  enviadoEm: Date
}

export async function listarMeusHoleritesAction(): Promise<MeuHoleriteRow[]> {
  const usuario = await getUsuarioLogado()
  return db
    .select({
      id: holerites.id,
      mes: holerites.mes,
      tipo: holerites.tipo,
      arquivoNome: holerites.arquivoNome,
      tamanho: holerites.tamanho,
      enviadoEm: holerites.enviadoEm,
    })
    .from(holerites)
    .where(eq(holerites.usuarioId, usuario.id))
    .orderBy(desc(holerites.mes))
}

/**
 * Link temporário do holerite da própria pessoa.
 *
 * Separada de getHoleriteUrlAction de propósito: aquela é do escritório e libera
 * qualquer holerite do grupo. Juntar as duas num if de papel deixaria a checagem
 * "é meu" a uma linha de distância de ser esquecida.
 */
export async function getMeuHoleriteUrlAction(id: string): Promise<string> {
  const usuario = await getUsuarioLogado()

  const [row] = await db
    .select({ arquivoPath: holerites.arquivoPath })
    .from(holerites)
    .where(and(eq(holerites.id, id), eq(holerites.usuarioId, usuario.id)))
    .limit(1)
  if (!row) throw new Error('Holerite não encontrado')

  const { data, error } = await storageAdmin().storage
    .from(BUCKET)
    .createSignedUrl(row.arquivoPath, 600)
  if (error || !data?.signedUrl) throw new Error('Erro ao gerar o link do holerite')
  return data.signedUrl
}
