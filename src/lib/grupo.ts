import { cache } from 'react'
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
import { grupoEstaNaConta } from '@/lib/conta'
import { escolherGrupoPadrao, gruposVisiveis, podeVerGrupo, type UsuarioAcessoGrupo } from '@/lib/acesso-grupo'

// Usuário com o campo de acesso OBRIGATÓRIO (mesmo que null) — diferente de
// UsuarioAcessoGrupo (regra pura em @/lib/acesso-grupo, campo opcional de
// propósito, undefined vira lista vazia). Aqui, nas funções que orquestram
// banco+cookie e são chamadas por página/action com o usuário logado inteiro,
// a omissão do campo é sinal de bug: sem isto, um objeto montado à mão sem
// grupos_acesso compilava calado e a página podia resolver um grupo diferente
// do que o seletor mostra, sem erro nem log.
type UsuarioComAcessoObrigatorio = { papel: string; gruposAcesso: string[] | null; contaId: string | null }

// Conta obrigatória no tipo (mesmo que null): sem ela a regra recusa todo grupo, e
// esquecer o campo viraria "usuário sem acesso" calado em vez de erro de compilação.
type UsuarioAprovadorComConta = UsuarioAprovador & { contaId: string | null }

type UsuarioComConta = { papel: string; lojaId: string | null; contaId: string | null } & Partial<UsuarioAcessoGrupo>

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
  usuario: UsuarioComConta,
  grupoId: string,
): Promise<boolean> {
  const [grupoDaPropriaLoja, [grupo]] = await Promise.all([
    grupoIdDaPropriaLoja(usuario.lojaId),
    db.select({ id: grupos.id, contaId: grupos.contaId }).from(grupos).where(eq(grupos.id, grupoId)).limit(1),
  ])
  return !!grupo && podeVerGrupo(usuario, grupoDaPropriaLoja, grupo)
}

export async function getGrupoAtivo(
  usuario: UsuarioComConta,
): Promise<Grupo> {
  if (ADMIN_PAPEIS.includes(usuario.papel)) {
    const grupoDaPropriaLoja = await grupoIdDaPropriaLoja(usuario.lojaId)

    const cookieStore = await cookies()
    const grupoIdCookie = cookieStore.get('grupoAtivo')?.value

    // Além de existir e estar ativo, o grupo do cookie agora precisa ser
    // PERMITIDO (posse via grupos_acesso, ou ser o da própria loja, ou
    // admin_geral). Sem essa checagem, qualquer admin_socio trocava de tenant
    // só escrevendo outro id no seletor — era a falha que este módulo fecha.
    if (grupoIdCookie) {
      const [grupo] = await db
        .select()
        .from(grupos)
        .where(and(eq(grupos.id, grupoIdCookie), eq(grupos.ativo, true)))
        .limit(1)
      if (grupo && podeVerGrupo(usuario, grupoDaPropriaLoja, grupo)) return grupo
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

    // FALHA FECHADO: a escolha é feita só entre os PERMITIDOS, nunca entre
    // "candidatos" (todos os grupos ativos). Existe admin_socio ativo, neste
    // banco, com loja_id NULL — se essa pessoa também não tiver grupos_acesso
    // cadastrado, ela não tem grupo nenhum para ver, e escolherGrupoPadrao
    // lança erro em vez de inventar um (era isto que a versão anterior fazia,
    // devolvendo o primeiro grupo de "candidatos" em silêncio — vazamento de
    // tenant). Ver src/lib/acesso-grupo.ts.
    const permitidos = candidatos.filter(g => podeVerGrupo(usuario, grupoDaPropriaLoja, g))
    return escolherGrupoPadrao(permitidos, GRUPO_PADRAO_ID)
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
  usuario: UsuarioComConta,
): Promise<Grupo[]> {
  const [todos, grupoDaPropriaLoja] = await Promise.all([
    listarGruposAtivos(),
    grupoIdDaPropriaLoja(usuario.lojaId),
  ])

  const idsVisiveis = new Set(gruposVisiveis(usuario, grupoDaPropriaLoja, todos))
  return todos.filter(g => idsVisiveis.has(g.id))
}

export async function listarLojasDoGrupoAtivo(
  usuario: { papel: string; lojaId: string | null } & UsuarioComAcessoObrigatorio,
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

export async function listarLojaIdsDoGrupoAtivo(
  usuario: { papel: string; lojaId: string | null } & UsuarioComAcessoObrigatorio,
): Promise<string[]> {
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
  usuario: UsuarioAprovadorComConta,
  lojaIdVenda: string,
): Promise<boolean> {
  if (usuario.email !== EMAIL_ACESSO_MULTI_GRUPO && !usuario.aprovaPagamentoSensivel) return false

  const [grupoAlvo, grupoUsuario] = await Promise.all([
    getGrupoIdDaLoja(lojaIdVenda),
    usuario.lojaId ? getGrupoIdDaLoja(usuario.lojaId) : Promise.resolve(null),
  ])
  if (!(await aprovaNaContaDoGrupo(usuario, grupoAlvo))) return false
  return aprovaPagamentoSensivelNoGrupo(usuario, grupoAlvo, grupoUsuario)
}

// Variante para telas que listam o grupo ativo inteiro (/vendas, /estoque):
// o alvo é o grupo que o usuário está olhando, não uma loja específica.
export async function podeAprovarPagamentoSensivelNoGrupoAtivo(
  usuario: UsuarioAprovadorComConta & UsuarioComConta,
): Promise<boolean> {
  if (usuario.email !== EMAIL_ACESSO_MULTI_GRUPO && !usuario.aprovaPagamentoSensivel) return false

  const grupoAtivo = await getGrupoAtivo(usuario)
  if (!(await aprovaNaContaDoGrupo(usuario, grupoAtivo.id))) return false
  const grupoUsuario = usuario.lojaId ? await getGrupoIdDaLoja(usuario.lojaId) : null
  return aprovaPagamentoSensivelNoGrupo(usuario, grupoAtivo.id, grupoUsuario)
}

// Fora o admin_geral, aprovar (pela exceção nominal, pelos grupos de aprovação ou como
// sócio) só vale em grupo da própria Conta (ADR-0018).
async function aprovaNaContaDoGrupo(usuario: UsuarioAprovadorComConta, grupoId: string): Promise<boolean> {
  return usuario.papel === 'admin_geral' || grupoEstaNaConta(grupoId, usuario.contaId)
}

// ─── Aprovação de venda abaixo do valor mínimo ────────────────────────────────
// admin_geral e o usuário multi-grupo aprovam de qualquer grupo; admin_socio
// aprova no próprio grupo (o da loja fixa dele, usuarios.lojaId) mais os grupos
// liberados no cadastro (usuarios.grupos_aprovacao) — nunca pelo cookie
// grupoAtivo: a permissão de aprovar não deve depender de qual grupo o sócio
// está "olhando" no momento. A regra pura fica em @/lib/aprovacao-permissao
// (testável sem banco).
export async function podeAprovarVendaBaixoValor(
  usuario: UsuarioAprovadorComConta,
  lojaIdVenda: string,
): Promise<boolean> {
  if (usuario.papel === 'admin_geral') return true
  const grupoVenda = await getGrupoIdDaLoja(lojaIdVenda)
  if (!(await aprovaNaContaDoGrupo(usuario, grupoVenda))) return false
  // O usuário multi-grupo aprova em qualquer grupo da Conta dele — sem isto ficava
  // travado no BH por ter loja fixa no Sul de Minas.
  if (aprovaBaixoValorEmQualquerGrupo(usuario)) return true

  // Grupo liberado nominalmente no cadastro (ex.: João Brito no BH e no Vale).
  if (aprovaEmGrupoExtra(usuario, grupoVenda)) return true

  if (usuario.papel !== 'admin_socio' || !usuario.lojaId) return false
  const grupoSocio = await getGrupoIdDaLoja(usuario.lojaId)
  return socioAprovaNoGrupo(usuario, grupoVenda, grupoSocio)
}

/**
 * O mesmo grupo ativo para toda a requisição: o layout (1º acesso, mensalidade) e a
 * barra de grupo leem uma vez só. A chave do cache é o objeto do usuário, que vem do
 * getUsuarioLogado (também em cache).
 */
export const grupoAtivoDaRequisicao = cache(getGrupoAtivo)

/** Os grupos que o usuário enxerga, uma vez por requisição (layout e barra de grupo). */
export const gruposVisiveisDaRequisicao = cache(listarGruposVisiveis)
