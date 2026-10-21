'use server'
import { db } from '@/lib/db'
import { usuarios, grupos } from '@/lib/db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { camposDePermissaoAlterados, registrarAcaoSensivelSemFalhar, type Permissoes } from '@/lib/log-acoes'
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
  return u
}

/** Grupo da loja do alvo e Conta dele: é onde o admin da Conta vê a mudança. */
async function registrarPermissao(adminId: string, alvo: { id: string; nome: string; lojaId: string | null; contaId: string | null }, detalhe: Record<string, unknown>) {
  await registrarAcaoSensivelSemFalhar({
    tipo: 'permissao_alterada', usuarioId: adminId, contaId: alvo.contaId,
    grupoId: alvo.lojaId ? await getGrupoIdDaLoja(alvo.lojaId).catch(() => null) : null,
    detalhe: { alvoId: alvo.id, alvoNome: alvo.nome, ...detalhe },
  })
}

const colunasPermissao = {
  id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId, contaId: usuarios.contaId,
  papel: usuarios.papel, gruposAcesso: usuarios.gruposAcesso, gruposAprovacao: usuarios.gruposAprovacao,
  aprovaPagamentoSensivel: usuarios.aprovaPagamentoSensivel,
  modulosExtras: usuarios.modulosExtras, modulosBloqueados: usuarios.modulosBloqueados,
}

function permissoesDe(u: Permissoes): Permissoes {
  return {
    papel: u.papel, lojaId: u.lojaId, gruposAcesso: u.gruposAcesso, gruposAprovacao: u.gruposAprovacao,
    aprovaPagamentoSensivel: u.aprovaPagamentoSensivel, modulosExtras: u.modulosExtras, modulosBloqueados: u.modulosBloqueados,
  }
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

// grupos_acesso é sobre ENXERGAR/trocar de grupo (@/lib/acesso-grupo), coisa
// diferente de aprovar pagamento — por isso valida separado de
// validarAprovacao, mesmo repetindo a checagem de grupo existente. admin_geral
// não precisa de lista (o papel já vê tudo) e, para os demais papéis que não
// trocam de grupo (vendedor, mecânico, aux_adm, motorista), a lista não faz
// nada — zera para não guardar lixo no cadastro.
async function validarAcesso(papel: string, gruposAcesso: string[]) {
  if (papel !== 'admin_socio') return { gruposAcesso: [] as string[] }

  const ids = [...new Set(gruposAcesso)]
  if (ids.length === 0) return { gruposAcesso: [] }

  const validos = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(inArray(grupos.id, ids))
  if (validos.length !== ids.length) throw new Error('Grupo de acesso inválido')

  return { gruposAcesso: ids }
}

// Conta de origem (ADR-0018): a do grupo da loja; sem loja, a do primeiro grupo de
// acesso. admin_geral é da plataforma e fica sem.
async function contaDoUsuario(papel: string, lojaId: string | null, gruposAcesso: string[]): Promise<string | null> {
  if (papel === 'admin_geral') return null
  const grupoId = lojaId ? await getGrupoIdDaLoja(lojaId) : gruposAcesso[0]
  if (!grupoId) return null
  const [g] = await db.select({ contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1)
  return g?.contaId ?? null
}

// Grupo marcado (de acesso ou de aprovação) tem de ser da Conta do usuário: grupo de
// outra Conta nunca vale, e gravar um assim seria permissão que não funciona (ADR-0018).
async function exigirGruposDaConta(papel: string, contaId: string | null, gruposMarcados: string[]) {
  // admin_geral é da plataforma, sem Conta: aprova e vê tudo de qualquer jeito.
  if (papel === 'admin_geral' || gruposMarcados.length === 0) return
  const linhas = await db.select({ contaId: grupos.contaId }).from(grupos).where(inArray(grupos.id, gruposMarcados))
  if (linhas.some(g => g.contaId !== contaId)) throw new Error('Grupo de outra Conta: marque só grupos da mesma Conta da loja do usuário')
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
  gruposAcesso: string[]
  modulosExtras: string[]
  modulosBloqueados: string[]
}) {
  const admin = await assertAdmin()
  // Valida ANTES de criar no Auth para não deixar usuário órfão em auth.users
  const conecta = validarConecta(dados.conecta)
  const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
  const acesso = await validarAcesso(dados.papel, dados.gruposAcesso)
  const contaId = await contaDoUsuario(dados.papel, dados.lojaId, acesso.gruposAcesso)
  await exigirGruposDaConta(dados.papel, contaId, [...acesso.gruposAcesso, ...aprovacao.gruposAprovacao])
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
    contaId,
    conecta,
    gruposAprovacao:         aprovacao.gruposAprovacao,
    aprovaPagamentoSensivel: aprovacao.aprovaPagamentoSensivel,
    gruposAcesso:            acesso.gruposAcesso,
    modulosExtras:     filtrarIdsValidos(dados.modulosExtras),
    modulosBloqueados: filtrarIdsValidos(dados.modulosBloqueados),
  })
  await registrarPermissao(admin.id, { id: data.user.id, nome: dados.nome, lojaId: dados.lojaId, contaId }, { acao: 'criado', papel: dados.papel })

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
  gruposAcesso: string[]
  modulosExtras: string[]
  modulosBloqueados: string[]
}) {
  const admin = await assertAdmin()
  const [antes] = await db.select(colunasPermissao).from(usuarios).where(eq(usuarios.id, id)).limit(1)
  const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
  const acesso = await validarAcesso(dados.papel, dados.gruposAcesso)
  const contaId = await contaDoUsuario(dados.papel, dados.lojaId, acesso.gruposAcesso)
  await exigirGruposDaConta(dados.papel, contaId, [...acesso.gruposAcesso, ...aprovacao.gruposAprovacao])

  await db.transaction(async (tx) => {
    await tx.update(usuarios).set({
      nome: dados.nome,
      email: dados.email,
      papel: dados.papel as any,
      lojaId: dados.lojaId,
      contaId,
      conecta: validarConecta(dados.conecta),
      gruposAprovacao:         aprovacao.gruposAprovacao,
      aprovaPagamentoSensivel: aprovacao.aprovaPagamentoSensivel,
      gruposAcesso:            acesso.gruposAcesso,
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

  const [depois] = await db.select(colunasPermissao).from(usuarios).where(eq(usuarios.id, id)).limit(1)
  const campos = antes && depois ? camposDePermissaoAlterados(permissoesDe(antes), permissoesDe(depois)) : []
  if (campos.length) {
    await registrarPermissao(admin.id, depois, { acao: 'alterado', campos, ...(campos.includes('papel') ? { papelAntes: antes.papel, papel: depois.papel } : {}) })
  }

  revalidatePath('/admin/usuarios')
}

export async function alternarAtivoUsuarioAction(id: string, ativo: boolean) {
  const admin = await assertAdmin()
  const [alvo] = await db.update(usuarios).set({ ativo }).where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId, contaId: usuarios.contaId })
  if (alvo) await registrarPermissao(admin.id, alvo, { acao: ativo ? 'ativado' : 'desativado' })
  revalidatePath('/admin/usuarios')
}

export async function excluirUsuarioAction(id: string) {
  const admin = await assertAdmin()
  const supabase = getAdminClient()

  const [alvo] = await db.delete(usuarios).where(eq(usuarios.id, id))
    .returning({ id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId, contaId: usuarios.contaId })
  if (alvo) await registrarPermissao(admin.id, alvo, { acao: 'excluido' })

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)

  revalidatePath('/admin/usuarios')
}
