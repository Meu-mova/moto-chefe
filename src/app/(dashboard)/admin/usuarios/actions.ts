'use server'
import { db } from '@/lib/db'
import { usuarios, grupos, gruposLiberados } from '@/lib/db/schema'
import { eq, sql, inArray, or } from 'drizzle-orm'
import { createClient as createSupabaseAdmin } from '@supabase/supabase-js'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { gestorDaSessao } from '@/lib/gestor-da-sessao'
import { COM_HISTORICO, podeExcluir, recusaDaGravacao } from '@/lib/gestao-usuarios'
import { cadastroAtual, cadastroPedido } from '@/lib/usuarios-gerenciaveis'
import { cargoParaGravar } from '@/lib/cargos'
import { aprovacoesForaDoAlcance, sincronizarGruposLiberados } from '@/lib/grupos-liberados-admin'
import { camposDePermissaoAlterados, registrarAcaoSensivelSemFalhar, type Permissoes } from '@/lib/log-acoes'
import { ITENS } from '@/lib/navegacao'
import { revalidatePath } from 'next/cache'

// Item só do admin_geral não se libera individualmente: gravar seria liberação sem efeito.
const IDS_VALIDOS = new Set(ITENS.filter(i => !i.soAdminGeral && !i.soPeloPapel).map(i => i.id))

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

// Recusa esperada ao salvar: volta à tela como { ok: false, erro }, porque na produção o
// Next esconde a mensagem de erro lançado por Server Action (#506).
class Recusa extends Error {}

type Resultado = { ok: true } | { ok: false; erro: string }

async function recusando(fn: () => Promise<void>): Promise<Resultado> {
  try {
    await fn()
    return { ok: true }
  } catch (e) {
    if (e instanceof Recusa) return { ok: false, erro: e.message }
    throw e
  }
}

// Grupo inexistente e grupo de outra Conta recebem a mesma frase: não revela que o
// grupo existe em outra Conta.
const GRUPO_INVALIDO = 'Grupo inválido: marque só grupos da mesma Conta da loja do usuário'

function exigir(recusa: string | null) {
  if (recusa) throw new Recusa(recusa)
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
    throw new Recusa('Link Conecta inválido')
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    throw new Recusa('Link Conecta deve começar com http:// ou https://')
  }
  return conecta
}

// Só admin_geral/admin_socio aprovam venda — guardar grupo de aprovação para um
// vendedor seria permissão fantasma, que não faz nada mas confunde a auditoria.
// Também não aceita id de grupo inexistente/inativo vindo do cliente.
async function validarAprovacao(papel: string, gruposAprovacao: string[], aprovaPagamentoSensivel: boolean) {
  if (!['admin_geral', 'admin_rede', 'admin_socio'].includes(papel)) {
    return { gruposAprovacao: [] as string[], aprovaPagamentoSensivel: false }
  }
  const ids = [...new Set(gruposAprovacao)]
  if (ids.length === 0) return { gruposAprovacao: [], aprovaPagamentoSensivel }

  const validos = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(inArray(grupos.id, ids))
  if (validos.length !== ids.length) throw new Recusa(GRUPO_INVALIDO)

  return { gruposAprovacao: ids, aprovaPagamentoSensivel }
}

// grupos_acesso é sobre ENXERGAR/trocar de grupo (@/lib/acesso-grupo), coisa
// diferente de aprovar pagamento — por isso valida separado de
// validarAprovacao, mesmo repetindo a checagem de grupo existente. admin_geral
// não precisa de lista (o papel já vê tudo) e, para os demais papéis que não
// trocam de grupo (vendedor, mecânico, aux_adm, motorista), a lista não faz
// nada — zera para não guardar lixo no cadastro.
async function validarAcesso(papel: string, gruposAcesso: string[]) {
  if (papel !== 'admin_socio' && papel !== 'admin_rede') return { gruposAcesso: [] as string[] }

  const ids = [...new Set(gruposAcesso)]
  if (ids.length === 0) return { gruposAcesso: [] }

  const validos = await db
    .select({ id: grupos.id })
    .from(grupos)
    .where(inArray(grupos.id, ids))
  if (validos.length !== ids.length) throw new Recusa(GRUPO_INVALIDO)

  return { gruposAcesso: ids }
}

// Conta de origem (ADR-0018): a do grupo da loja; sem loja, a do primeiro grupo de
// acesso. admin_geral é da plataforma e fica sem.
async function contaDoUsuario(papel: string, lojaId: string | null, gruposAcesso: string[]): Promise<string | null> {
  if (papel === 'admin_geral') return null
  const grupoId = lojaId ? await getGrupoIdDaLoja(lojaId) : gruposAcesso[0]
  // O admin_rede precisa de Conta própria (ADR-0019): os grupos liberados somam por cima dela.
  if (!grupoId && papel === 'admin_rede') throw new Recusa('Escolha a loja ou um grupo de acesso do Admin de Rede')
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
  if (linhas.some(g => g.contaId !== contaId)) throw new Recusa(GRUPO_INVALIDO)
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
  cargoId?: string | null
}): Promise<{ ok: true; id: string } | { ok: false; erro: string }> {
  const admin = await gestorDaSessao()
  // A tela usa o id do usuário novo para gravar os grupos liberados logo depois (#517).
  let id = ''
  const r = await recusando(async () => {
    // Valida ANTES de criar no Auth para não deixar usuário órfão em auth.users
    exigir(recusaDaGravacao(admin, null, await cadastroPedido(dados, true)))
    const conecta = validarConecta(dados.conecta)
    const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
    const acesso = await validarAcesso(dados.papel, dados.gruposAcesso)
    const contaId = await contaDoUsuario(dados.papel, dados.lojaId, acesso.gruposAcesso)
    await exigirGruposDaConta(dados.papel, contaId, acesso.gruposAcesso)
    // Usuário novo ainda não tem grupo liberado: aprovação só na própria Conta.
    if ((await aprovacoesForaDoAlcance(db, { id: null, papel: dados.papel, contaId }, aprovacao.gruposAprovacao)).length) throw new Recusa(GRUPO_INVALIDO)
    const cargo = await cargoParaGravar(db, { papel: dados.papel, contaId, cargoId: dados.cargoId ?? null })
    if (!cargo.ok) throw new Recusa(cargo.erro)
    const supabase = getAdminClient()

    const { data, error } = await supabase.auth.admin.createUser({
      email: dados.email,
      password: dados.senha,
      email_confirm: true,
      // Senha definida pelo sócio: o usuário troca no 1º login (/trocar-senha).
      ...(admin.papel === 'admin_socio' ? { user_metadata: { must_change_password: true } } : {}),
    })
    // E-mail já usado (em qualquer Conta) ou recusado pelo Auth: frase neutra no diálogo.
    if (error) throw new Recusa('Não foi possível criar o login com este e-mail. Confira o endereço ou use outro.')

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
      cargoId: cargo.cargoId,
    })
    await registrarPermissao(admin.id, { id: data.user.id, nome: dados.nome, lojaId: dados.lojaId, contaId }, { acao: 'criado', papel: dados.papel })
    id = data.user.id

    revalidatePath('/admin/usuarios')
  })
  return r.ok ? { ok: true, id } : r
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
  cargoId?: string | null
}): Promise<Resultado> {
  const admin = await gestorDaSessao()
  return recusando(async () => {
    const atual = await cadastroAtual(id)
    if (!atual) throw new Recusa('Usuário não encontrado')
    exigir(recusaDaGravacao(admin, atual, await cadastroPedido(dados, atual.ativo)))
    const [antes] = await db.select(colunasPermissao).from(usuarios).where(eq(usuarios.id, id)).limit(1)
    const aprovacao = await validarAprovacao(dados.papel, dados.gruposAprovacao, dados.aprovaPagamentoSensivel)
    const acesso = await validarAcesso(dados.papel, dados.gruposAcesso)
    const contaId = await contaDoUsuario(dados.papel, dados.lojaId, acesso.gruposAcesso)
    await exigirGruposDaConta(dados.papel, contaId, acesso.gruposAcesso)
    // admin_rede aprova também nos grupos liberados (vivos) para ele (ADR-0019).
    if ((await aprovacoesForaDoAlcance(db, { id, papel: dados.papel, contaId }, aprovacao.gruposAprovacao)).length) throw new Recusa(GRUPO_INVALIDO)
    const cargo = await cargoParaGravar(db, { papel: dados.papel, contaId, cargoId: dados.cargoId ?? null })
    if (!cargo.ok) throw new Recusa(cargo.erro)

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
        cargoId: cargo.cargoId,
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
  })
}

export async function alternarAtivoUsuarioAction(id: string, ativo: boolean): Promise<Resultado> {
  const admin = await gestorDaSessao()
  return recusando(async () => {
    const atual = await cadastroAtual(id)
    if (!atual) throw new Recusa('Usuário não encontrado')
    exigir(recusaDaGravacao(admin, atual, { ...atual, ativo }))
    const [alvo] = await db.update(usuarios).set({ ativo }).where(eq(usuarios.id, id))
      .returning(colunasAlvo)
    if (alvo) await registrarPermissao(admin.id, alvo, { acao: ativo ? 'ativado' : 'desativado' })
    revalidatePath('/admin/usuarios')
  })
}

// Qualquer registro que aponte para o usuário (venda, estoque, OS...) barra o delete com 23503.
function temReferencia(e: unknown): boolean {
  return (e as { cause?: { code?: string } })?.cause?.code === '23503' || (e as { code?: string })?.code === '23503'
}

export async function excluirUsuarioAction(id: string): Promise<Resultado> {
  const admin = await gestorDaSessao()
  return recusando(async () => {
    if (!podeExcluir(admin)) throw new Recusa('Só o Admin Geral exclui usuário; desative em vez de excluir')
    // O histórico de liberações (#517) aponta para quem recebeu e para quem liberou.
    const [liberacao] = await db.select({ id: gruposLiberados.id }).from(gruposLiberados)
      .where(or(eq(gruposLiberados.usuarioId, id), eq(gruposLiberados.liberadoPor, id))).limit(1)
    if (liberacao) throw new Recusa(COM_HISTORICO)
    // O cadastro sai primeiro, numa transação; o login só sai depois. Se o banco recusar
    // (histórico), o login fica intacto; se o Auth falhar, o cadastro volta.
    let alvo: Alvo | undefined
    try {
      await db.transaction(async tx => {
        ;[alvo] = await tx.delete(usuarios).where(eq(usuarios.id, id)).returning(colunasAlvo)
        if (!alvo) throw new Recusa('Usuário não encontrado')
        const { error } = await getAdminClient().auth.admin.deleteUser(id)
        if (error) throw new Error(error.message)
      })
    } catch (e) {
      if (temReferencia(e)) throw new Recusa(COM_HISTORICO)
      throw e
    }
    if (alvo) await registrarPermissao(admin.id, alvo, { acao: 'excluido' })
    revalidatePath('/admin/usuarios')
  })
}

// Grupos de outras Contas para o admin_rede (#517, ADR-0019): só o admin_geral, e cada
// liberação ou revogação vai para o log no grupo liberado, que é onde a Conta dona vê.
export async function salvarGruposLiberadosAction(id: string, grupoIds: string[]): Promise<Resultado> {
  const admin = await gestorDaSessao()
  const r = await db.transaction(tx => sincronizarGruposLiberados(tx, admin, id, grupoIds))
  if (!r.ok) return r
  const [alvo] = await db.select(colunasAlvo).from(usuarios).where(eq(usuarios.id, id)).limit(1)
  const registros = [...r.liberados.map(g => ['grupo_liberado', g] as const), ...r.revogados.map(g => ['grupo_revogado', g] as const)]
  for (const [acao, grupoId] of registros) {
    await registrarAcaoSensivelSemFalhar({
      tipo: 'permissao_alterada', usuarioId: admin.id, grupoId,
      detalhe: { acao, alvoId: id, alvoNome: alvo?.nome, contaOrigemId: alvo?.contaId },
    })
  }
  revalidatePath('/admin/usuarios')
  return { ok: true }
}
