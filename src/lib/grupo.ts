import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import {
  EMAIL_ACESSO_MULTI_GRUPO,
  aprovaBaixoValorEmQualquerGrupo,
  aprovaEmGrupoExtra,
  aprovaPagamentoSensivelNoGrupo,
  socioAprovaNoGrupo,
  type UsuarioAprovador,
} from '@/lib/aprovacao-permissao'
import { gruposVisiveis, podeVerGrupo, type UsuarioAcessoGrupo } from '@/lib/acesso-grupo'

export type Grupo = typeof grupos.$inferSelect

const ADMIN_PAPEIS = ['admin_geral', 'admin_socio']

// Grupo legado, criado na migração multi-grupo (0011) a partir dos dados que já existiam.
// Usado como padrão de fallback para não cair num grupo novo sem dados por ordem alfabética.
const GRUPO_PADRAO_ID = '00000000-0000-4000-8000-000000000001'

// Grupo "de casa" do usuário (o da loja fixa), buscado sem lançar erro: um
// lojaId órfão (dado inconsistente) não pode derrubar página nem action —
// mesmo espírito de fail-open do resto deste arquivo. Usado por getGrupoAtivo,
// listarGruposVisiveis e pela action de troca de grupo (todos precisam da
// mesma base para decidir posse).
export async function grupoIdDaPropriaLoja(lojaId: string | null): Promise<string | null> {
  const [lojaDoUsuario] = lojaId
    ? await db.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, lojaId)).limit(1)
    : []
  return lojaDoUsuario?.grupoId ?? null
}

// Checagem de posse pronta para usar com o usuário logado inteiro (banco
// incluso) — é o que a action de troca de grupo (porta principal do seletor)
// e qualquer outro ponto fora deste arquivo devem chamar, em vez de duplicar
// a resolução de grupoDaPropriaLoja.
export async function podeUsuarioVerGrupo(
  usuario: { papel: string; lojaId: string | null } & Partial<UsuarioAcessoGrupo>,
  grupoId: string,
): Promise<boolean> {
  const grupoDaPropriaLoja = await grupoIdDaPropriaLoja(usuario.lojaId)
  return podeVerGrupo(usuario, grupoDaPropriaLoja, grupoId)
}

export async function getGrupoAtivo(
  usuario: { papel: string; lojaId: string | null } & Partial<UsuarioAcessoGrupo>,
): Promise<Grupo> {
  if (ADMIN_PAPEIS.includes(usuario.papel)) {
    const grupoDaPropriaLoja = await grupoIdDaPropriaLoja(usuario.lojaId)

    const cookieStore = await cookies()
    const grupoIdCookie = cookieStore.get('grupoAtivo')?.value

    // Além de existir e estar ativo, o grupo do cookie agora precisa ser
    // PERMITIDO (posse via grupos_acesso, ou ser o da própria loja, ou
    // admin_geral). Sem essa checagem, qualquer admin_socio trocava de tenant
    // só escrevendo outro id no seletor — era a falha que este módulo fecha.
    if (grupoIdCookie && podeVerGrupo(usuario, grupoDaPropriaLoja, grupoIdCookie)) {
      const [grupo] = await db
        .select()
        .from(grupos)
        .where(and(eq(grupos.id, grupoIdCookie), eq(grupos.ativo, true)))
        .limit(1)
      if (grupo) return grupo
    }

    // Cookie ausente, de um grupo inexistente/inativo, ou de um grupo sem
    // posse: nunca lança erro por isso — um cookie velho não pode travar o
    // acesso de ninguém. Cai no grupo padrão do usuário: o da própria loja
    // primeiro, senão o primeiro grupo permitido (ordem alfabética).
    if (grupoDaPropriaLoja) {
      const [grupo] = await db
        .select()
        .from(grupos)
        .where(and(eq(grupos.id, grupoDaPropriaLoja), eq(grupos.ativo, true)))
        .limit(1)
      if (grupo) return grupo
    }

    const candidatos = await db
      .select()
      .from(grupos)
      .where(eq(grupos.ativo, true))
      .orderBy(grupos.nome)
    if (!candidatos.length) throw new Error('Nenhum grupo ativo cadastrado')

    const permitidos = candidatos.filter(g => podeVerGrupo(usuario, grupoDaPropriaLoja, g.id))
    // Sem loja e sem grupos_acesso não deveria acontecer para quem tem papel
    // de admin (admin_geral vê tudo; admin_socio sempre tem loja fixa), mas
    // se acontecer não é motivo para quebrar a página — cai no padrão
    // histórico de antes desta trava existir.
    const base = permitidos.length ? permitidos : candidatos
    return base.find(g => g.id === GRUPO_PADRAO_ID) ?? base[0]
  }

  if (!usuario.lojaId) throw new Error('Usuário sem loja associada')

  const [loja] = await db
    .select({ grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, usuario.lojaId))
    .limit(1)
  if (!loja) throw new Error('Loja do usuário não encontrada')

  const [grupo] = await db.select().from(grupos).where(eq(grupos.id, loja.grupoId)).limit(1)
  if (!grupo) throw new Error('Grupo da loja não encontrado')
  return grupo
}

export async function getGrupoIdDaLoja(lojaId: string): Promise<string> {
  const [loja] = await db.select({ grupoId: lojas.grupoId }).from(lojas).where(eq(lojas.id, lojaId)).limit(1)
  if (!loja) throw new Error('Loja não encontrada')
  return loja.grupoId
}

export async function listarGruposAtivos(): Promise<Grupo[]> {
  return db.select().from(grupos).where(eq(grupos.ativo, true)).orderBy(grupos.nome)
}

// Para o seletor de empresa (GroupSwitcher): só os grupos que o usuário tem
// posse — nunca a lista inteira. É a mesma regra de podeVerGrupo em
// getGrupoAtivo, só que devolvendo a lista completa para montar o dropdown em
// vez de checar um id específico. Páginas que precisam do universo inteiro de
// grupos (ex.: /admin/usuarios editando a lista de outra pessoa) continuam
// usando listarGruposAtivos() direto — de propósito, não é o mesmo caso de uso.
export async function listarGruposVisiveis(
  usuario: { papel: string; lojaId: string | null } & Partial<UsuarioAcessoGrupo>,
): Promise<Grupo[]> {
  const [todos, grupoDaPropriaLoja] = await Promise.all([
    listarGruposAtivos(),
    grupoIdDaPropriaLoja(usuario.lojaId),
  ])

  const idsVisiveis = new Set(gruposVisiveis(usuario, grupoDaPropriaLoja, todos.map(g => g.id)))
  return todos.filter(g => idsVisiveis.has(g.id))
}

export async function listarLojasDoGrupoAtivo(
  usuario: { papel: string; lojaId: string | null },
  opts?: { somenteAtivas?: boolean },
): Promise<{ id: string; nome: string }[]> {
  const grupo = await getGrupoAtivo(usuario)
  const somenteAtivas = opts?.somenteAtivas ?? true
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(somenteAtivas ? and(eq(lojas.grupoId, grupo.id), eq(lojas.ativa, true)) : eq(lojas.grupoId, grupo.id))
    .orderBy(lojas.nome)
}

export async function listarLojaIdsDoGrupoAtivo(usuario: { papel: string; lojaId: string | null }): Promise<string[]> {
  const grupo = await getGrupoAtivo(usuario)
  const rows = await db.select({ id: lojas.id }).from(lojas).where(eq(lojas.grupoId, grupo.id))
  return rows.map(r => r.id)
}

// ─── Exceção pontual: transferência entre grupos ──────────────────────────────
// Liberado apenas para este usuário, por decisão explícita — não é uma role
// genérica. Ver docs/superpowers/specs/2026-07-01-transferencia-entre-grupos-design.md
export function podeTransferirEntreGrupos(usuario: { email: string }): boolean {
  return usuario.email === EMAIL_ACESSO_MULTI_GRUPO
}

// ─── Aprovação de pagamento sensível (financiamento/transferência) ────────────
// Não é permissão de papel: um admin_socio só aprova se tiver
// aprova_pagamento_sensivel marcado em /admin/usuarios — os demais continuam
// sem acesso a essa informação, como o Cesar definiu. Quem tem a liberação
// aprova nos MESMOS grupos em que aprova venda de baixo valor (grupo da loja
// fixa + grupos_aprovacao), nunca no grupo do cookie grupoAtivo.
// A regra pura fica em @/lib/aprovacao-permissao.
export async function podeAprovarPagamentoSensivelNaLoja(
  usuario: UsuarioAprovador,
  lojaIdVenda: string,
): Promise<boolean> {
  if (usuario.email === EMAIL_ACESSO_MULTI_GRUPO) return true
  if (!usuario.aprovaPagamentoSensivel) return false

  const [grupoAlvo, grupoUsuario] = await Promise.all([
    getGrupoIdDaLoja(lojaIdVenda),
    usuario.lojaId ? getGrupoIdDaLoja(usuario.lojaId) : Promise.resolve(null),
  ])
  return aprovaPagamentoSensivelNoGrupo(usuario, grupoAlvo, grupoUsuario)
}

// Variante para telas que listam o grupo ativo inteiro (/vendas, /estoque):
// o alvo é o grupo que o usuário está olhando, não uma loja específica.
export async function podeAprovarPagamentoSensivelNoGrupoAtivo(
  usuario: UsuarioAprovador,
): Promise<boolean> {
  if (usuario.email === EMAIL_ACESSO_MULTI_GRUPO) return true
  if (!usuario.aprovaPagamentoSensivel) return false

  const grupoAtivo = await getGrupoAtivo(usuario)
  const grupoUsuario = usuario.lojaId ? await getGrupoIdDaLoja(usuario.lojaId) : null
  return aprovaPagamentoSensivelNoGrupo(usuario, grupoAtivo.id, grupoUsuario)
}

export async function listarTodasLojasAtivas(): Promise<{ id: string; nome: string }[]> {
  return db
    .select({ id: lojas.id, nome: lojas.nome })
    .from(lojas)
    .where(eq(lojas.ativa, true))
    .orderBy(lojas.nome)
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────
// admin_geral e o usuário multi-grupo aprovam de qualquer grupo; admin_socio
// aprova no próprio grupo (o da loja fixa dele, usuarios.lojaId) mais os grupos
// liberados no cadastro (usuarios.grupos_aprovacao) — nunca pelo cookie
// grupoAtivo: a permissão de aprovar não deve depender de qual grupo o sócio
// está "olhando" no momento. A regra pura fica em @/lib/aprovacao-permissao
// (testável sem banco).
export async function podeAprovarVendaBaixoValor(
  usuario: UsuarioAprovador,
  lojaIdVenda: string,
): Promise<boolean> {
  // admin_geral e o usuário multi-grupo aprovam em qualquer grupo — sem isto o
  // sócio multi-grupo ficava travado no BH por ter loja fixa no Sul de Minas.
  if (aprovaBaixoValorEmQualquerGrupo(usuario)) return true

  const grupoVenda = await getGrupoIdDaLoja(lojaIdVenda)
  // Grupo liberado nominalmente no cadastro (ex.: João Brito no BH e no Vale).
  if (aprovaEmGrupoExtra(usuario, grupoVenda)) return true

  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false
  const grupoSocio = await getGrupoIdDaLoja(usuario.lojaId)
  return socioAprovaNoGrupo(usuario, grupoVenda, grupoSocio)
}
