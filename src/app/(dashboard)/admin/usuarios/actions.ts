'use server'
import { db } from '@/lib/db'
import { usuarios, grupos, lojas } from '@/lib/db/schema'
import { eq, sql, inArray } from 'drizzle-orm'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoIdDaLoja, listarGruposVisiveis } from '@/lib/grupo'
import { ehGestorDeUsuarios, podeExcluir, recusaDaGravacao, type CadastroGestao, type Gestor } from '@/lib/gestao-usuarios'
import { camposDePermissaoAlterados, registrarAcaoSensivelSemFalhar, type Permissoes } from '@/lib/log-acoes'
import { ITENS, itensVisiveis } from '@/lib/navegacao'
import { revalidatePath } from 'next/cache'

// Item só do admin_geral não se libera individualmente: gravar seria liberação sem efeito.
const IDS_VALIDOS = new Set(ITENS.filter(i => !i.soAdminGeral).map(i => i.id))

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

// admin_geral ou sócio (#322). O que cada um pode gravar decide @/lib/gestao-usuarios.
async function gestorDaSessao(): Promise<Gestor> {
  const u = await getUsuarioLogado()
  if (!ehGestorDeUsuarios(u)) throw new Error('Sem permissão para gerenciar usuários')
  const gruposVisiveis = u.papel === 'admin_geral' ? [] : (await listarGruposVisiveis(u)).map(g => g.id)
  // Sem as regras próprias: tela que depende delas não se libera pelo sócio.
  const itensLiberaveis = itensVisiveis(u, {}).map(i => i.id)
  return { id: u.id, papel: u.papel, gruposVisiveis, itensLiberaveis, aprovaPagamentoSensivel: u.aprovaPagamentoSensivel === true }
}

function exigir(recusa: string | null) {
  if (recusa) throw new Error(recusa)
}

// Estado gravado do alvo, lido no servidor: a tela não decide quem está no alcance.
async function cadastroAtual(id: string): Promise<(CadastroGestao & { id: string }) | null> {
  const [u] = await db
    .select({
      id: usuarios.id, papel: usuarios.papel, grupoDaLoja: lojas.grupoId, ativo: usuarios.ativo,
      gruposAcesso: usuarios.gruposAcesso, gruposAprovacao: usuarios.gruposAprovacao, modulosExtras: usuarios.modulosExtras, modulosBloqueados: usuarios.modulosBloqueados,
      aprovaPagamentoSensivel: usuarios.aprovaPagamentoSensivel,
    })
    .from(usuarios).leftJoin(lojas, eq(usuarios.lojaId, lojas.id)).where(eq(usuarios.id, id)).limit(1)
  if (!u) return null
  return { ...u, gruposAcesso: u.gruposAcesso ?? [], gruposAprovacao: u.gruposAprovacao ?? [], modulosExtras: u.modulosExtras ?? [], modulosBloqueados: u.modulosBloqueados ?? [] }
}

async function cadastroPedido(dados: { papel: string; lojaId: string | null; gruposAcesso: string[]; gruposAprovacao: string[]; modulosExtras: string[]; modulosBloqueados: string[]; aprovaPagamentoSensivel: boolean }, ativo: boolean): Promise<CadastroGestao> {
  return {
    aprovaPagamentoSensivel: dados.aprovaPagamentoSensivel,
    papel: dados.papel, grupoDaLoja: dados.lojaId ? await getGrupoIdDaLoja(dados.lojaId) : null, ativo,
    gruposAcesso: dados.gruposAcesso, gruposAprovacao: dados.gruposAprovacao, modulosExtras: dados.modulosExtras, modulosBloqueados: dados.modulosBloqueados,
  }
}

/** Grupo da loja do alvo e Conta dele: é onde o admin da Conta vê a mudança. */
type Alvo = { id: string; nome: string; lojaId: string | null; contaId: string | null }

async function registrarPermissao(adminId: string, alvo: Alvo, detalhe: Record<string, unknown>) {
  await registrarAcaoSensivelSemFalhar({
    tipo: 'permissao_alterada', usuarioId: adminId, contaId: alvo.contaId, lojaId: alvo.lojaId,
    detalhe: { alvoId: alvo.id, alvoNome: alvo.nome, ...detalhe },
  })
}

const colunasAlvo = { id: usuarios.id, nome: usuarios.nome, lojaId: usuarios.lojaId, contaId: usuarios.contaId }

const colunasPermissao = {
  ...colunasAlvo,
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
  const admin = await gestorDaSessao()
  // Valida ANTES de criar no Auth para não deixar usuário órfão em auth.users
  exigir(recusaDaGravacao(admin, null, await cadastroPedido(dados, true)))
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
    // Senha definida pelo sócio: o usuário troca no 1º login (/trocar-senha).
    ...(admin.papel === 'admin_socio' ? { user_metadata: { must_change_password: true } } : {}),
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
  const admin = await gestorDaSessao()
  const atual = await cadastroAtual(id)
  if (!atual) throw new Error('Usuário não encontrado')
  exigir(recusaDaGravacao(admin, atual, await cadastroPedido(dados, atual.ativo)))
  const [antes] = await db.select(colunasPermissao).from(usuarios).where(eq(usuarios.id, id)).limit(1)
  const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
  const acesso = await validarAcesso(dados.papel, dados.gruposAcesso)
  const contaId = await contaDoUsuario(dados.papel, dados.lojaId, acesso.gruposAcesso)
  await exigirGruposDaConta(dados.papel, contaId, [...acesso.gruposAcesso, ...aprovacao.gruposAprovacao])

  // Senha trocada pelo sócio vale como a inicial: o usuário troca no próximo login. Na
  // mesma transação da senha, para não sobrar senha nova sem a troca obrigatória.
  const forcarTroca = admin.papel === 'admin_socio' && id !== admin.id
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
            raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || ${forcarTroca ? sql`'{"must_change_password": true}'::jsonb` : sql`'{}'::jsonb`},
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
    const detalhe = { acao: 'alterado', campos, ...(campos.includes('papel') ? { papelAntes: antes.papel, papel: depois.papel } : {}) }
    await registrarPermissao(admin.id, depois, detalhe)
    // Saiu de uma Conta para outra: o admin da Conta antiga também precisa ver.
    if (antes.contaId !== depois.contaId) await registrarPermissao(admin.id, antes, detalhe)
  }

  revalidatePath('/admin/usuarios')
}

export async function alternarAtivoUsuarioAction(id: string, ativo: boolean) {
  const admin = await gestorDaSessao()
  const atual = await cadastroAtual(id)
  if (!atual) throw new Error('Usuário não encontrado')
  exigir(recusaDaGravacao(admin, atual, { ...atual, ativo }))
  const [alvo] = await db.update(usuarios).set({ ativo }).where(eq(usuarios.id, id))
    .returning(colunasAlvo)
  if (alvo) await registrarPermissao(admin.id, alvo, { acao: ativo ? 'ativado' : 'desativado' })
  revalidatePath('/admin/usuarios')
}

export async function excluirUsuarioAction(id: string) {
  const admin = await gestorDaSessao()
  if (!podeExcluir(admin)) throw new Error('Só o Admin Geral exclui usuário; desative em vez de excluir')
  const supabase = getAdminClient()

  const [alvo] = await db.delete(usuarios).where(eq(usuarios.id, id)).returning(colunasAlvo)

  const { error } = await supabase.auth.admin.deleteUser(id)
  if (error) throw new Error(error.message)
  if (alvo) await registrarPermissao(admin.id, alvo, { acao: 'excluido' })

  revalidatePath('/admin/usuarios')
}
