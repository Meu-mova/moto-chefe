'use server'
import { db } from '@/lib/db'
import { usuarios, grupos } from '@/lib/db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { ITENS } from '@/lib/navegacao'
import { revalidatePath } from 'next/cache'

const IDS_VALIDOS = new Set(ITENS.map(i => i.id))

// Grava só ids que existem hoje na tabela de navegação — evita lixo permanente
// no banco se um id de item mudar de nome (o valor antigo nunca mais casaria
// com nada e ficaria preso em modulos_extras/bloqueados para sempre).
function filtrarIdsValidos(ids: string[]): string[] {
  return ids.filter(id => IDS_VALIDOS.has(id))
}

function getAdminClient() {
  return createSupabaseAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
}

// Garante que o link Conecta é http/https (evita esquemas perigosos como javascript:)
function validarConecta(conecta: string | null): string | null {
  if (!conecta) return null
  let u: URL
  try {
    u = new URL(conecta)
  } catch {
    throw new Error('Link Conecta inválido')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Error('Link Conecta deve começar com http:// ou https://')
  }
  return conecta
}

// Só admin_geral/admin_socio aprovam venda — guardar grupo de aprovação para um
// vendedor seria permissão fantasma, que não faz nada mas confunde a auditoria.
// Também não aceita id de grupo inexistente/inativo vindo do cliente.
async function validarAprovacao(papel: string, gruposAprovacao: string[], aprovaPagamentoSensivel: boolean) {
  if (!['admin_geral', 'admin_socio'].includes(papel)) {
    return { gruposAprovacao: [] as string[], aprovaPagamentoSensivel: false }
  }
  const ids = [...new Set(gruposAprovacao)]
  if (ids.length === 0) return { gruposAprovacao: [], aprovaPagamentoSensivel }

  const validos = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(inArray(grupos.id, ids))
  if (validos.length !== ids.length) throw new Error('Grupo de aprovação inválido')

  return { gruposAprovacao: ids, aprovaPagamentoSensivel }
}

export async function criarUsuarioAction(dados: {
  nome: string
  email: string
  senha: string
  papel: string
  lojaId: string | null
  conecta: string | null
  gruposAprovacao: string[]
  aprovaPagamentoSensivel: boolean
  modulosExtras: string[]
  modulosBloqueados: string[]
}) {
  await assertAdmin()
  // Valida ANTES de criar no Auth para não deixar usuário órfão em auth.users
  const conecta = validarConecta(dados.conecta)
  const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
  const supabase = getAdminClient()

  const { data, error } = await supabase.auth.admin.createUser({
    email: dados.email,
    password: dados.senha,
    email_confirm: true,
  })
  if (error) throw new Error(error.message)

  await db.insert(usuarios).values({
    id: data.user.id,
    nome: dados.nome,
    email: dados.email,
    papel: dados.papel as any,
    lojaId: dados.lojaId,
    conecta,
    gruposAprovacao:         aprovacao.gruposAprovacao,
    aprovaPagamentoSensivel: aprovacao.aprovaPagamentoSensivel,
    modulosExtras:     filtrarIdsValidos(dados.modulosExtras),
    modulosBloqueados: filtrarIdsValidos(dados.modulosBloqueados),
  })

  revalidatePath('/admin/usuarios')
}

export async function editarUsuarioAction(id: string, dados: {
  nome: string
  email: string
  novaSenha?: string
  papel: string
  lojaId: string | null
  conecta: string | null
  gruposAprovacao: string[]
  aprovaPagamentoSensivel: boolean
  modulosExtras: string[]
  modulosBloqueados: string[]
}) {
  await assertAdmin()
  const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)

  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel as any,
      lojaId: dados.lojaId,
      conecta: validarConecta(dados.conecta),
      gruposAprovacao:         aprovacao.gruposAprovacao,
      aprovaPagamentoSensivel: aprovacao.aprovaPagamentoSensivel,
      modulosExtras:     filtrarIdsValidos(dados.modulosExtras),
      modulosBloqueados: filtrarIdsValidos(dados.modulosBloqueados),
    }).where(eq(usuarios.id, id))

    if (dados.novaSenha?.trim()) {
      await tx.execute(sql`
        UPDATE auth.users
        SET email = ${dados.email},
            encrypted_password = crypt(${dados.novaSenha}, gen_salt('bf')),
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${id}::uuid
      `)
    } else {
      await tx.execute(sql`
        UPDATE auth.users
        SET email = ${dados.email},
            email_confirmed_at = COALESCE(email_confirmed_at, now()),
            updated_at = now()
        WHERE id = ${id}::uuid
      `)
    }
  })

  revalidatePath('/admin/usuarios')
}

export async function alternarAtivoUsuarioAction(id: string, ativo: boolean) {
  await assertAdmin()
  await db.update(usuarios).set({ ativo }).where(eq(usuarios.id, id))
  revalidatePath('/admin/usuarios')
}

export async function excluirUsuarioAction(id: string) {
  await assertAdmin()
  const supabase = getAdminClient()

  await db.delete(usuarios).where(eq(usuarios.id, id))

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/usuarios')
}
