// ─── admin_rede: grupos de outras Contas liberados pelo admin_geral (#517) ──────
// Adendo de 29/10/2026 ao ADR-0018. Sem next/headers, para ser testado contra o banco.
//
// O admin_rede opera como admin_socio. Quando o grupo ativo é um grupo liberado de outra
// Conta, o usuário da requisição vira a "persona" daquele grupo: Conta dona no lugar da
// dele e o grupo liberado como único grupo visível. Assim as consultas que já filtram por
// Conta usam o catálogo da Conta dona, e as que filtram por loja usam lojasDoEscopo, que
// prende a persona às lojas do grupo liberado (outro grupo da Conta dona nunca aparece).
import { and, eq, isNull } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, gruposLiberados } from '@/lib/db/schema'
import { hojeBrt } from '@/lib/data-venda'
import { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { estaBloqueado } from '@/lib/mensalidade/regras'

type Executor = Pick<typeof db, 'select'>

export type GrupoLiberado = { grupoId: string; contaId: string }

/**
 * Liberações vivas do usuário: não revogadas, de grupo ativo e não bloqueado por falta de
 * pagamento (o bloqueio da Conta dona derruba também o acesso de fora).
 */
export async function gruposLiberadosVivos(usuarioId: string, agora: Date = new Date(), exec: Executor = db): Promise<GrupoLiberado[]> {
  const linhas = await exec.select({ grupoId: grupos.id, contaId: grupos.contaId })
    .from(gruposLiberados)
    .innerJoin(grupos, eq(grupos.id, gruposLiberados.grupoId))
    .where(and(eq(gruposLiberados.usuarioId, usuarioId), isNull(gruposLiberados.revogadoEm), eq(grupos.ativo, true)))
  if (!linhas.length) return []
  const abertas = await abertasCobraveis({ grupoIds: linhas.map(l => l.grupoId) }, exec)
  const hoje = hojeBrt(agora)
  return linhas.filter(l => !estaBloqueado(abertas.filter(a => a.m.grupoId === l.grupoId).map(a => a.m.vencimento), hoje))
}

type UsuarioBase = {
  papel: string
  lojaId: string | null
  contaId: string | null
  gruposAcesso: string[]
  gruposAprovacao: string[]
}

export type UsuarioComRede<U extends UsuarioBase> = Omit<U, 'papel'> & {
  /** Nunca admin_rede: ele opera como admin_socio. */
  papel: Exclude<U['papel'], 'admin_rede'>
  /** Papel gravado no cadastro; `papel` é o que governa as permissões. */
  papelReal: U['papel']
  /** Grupos de outras Contas que ele pode ver; vazio na persona, presa ao grupo dela. */
  gruposLiberados: GrupoLiberado[]
  /** Grupo liberado que ele está operando agora, ou null fora da persona. */
  grupoLiberado: string | null
  /** Identidade da própria Conta: seletor e troca de grupo decidem por ela. */
  origem: Pick<UsuarioBase, 'lojaId' | 'contaId' | 'gruposAcesso'> & { gruposLiberados: GrupoLiberado[] }
}

/**
 * Usuário que a requisição usa. Fora do admin_rede, o mesmo do cadastro. O admin_rede vira
 * admin_socio; com o grupo ativo liberado (de outra Conta), vira a persona daquele grupo.
 */
export function usuarioDaRede<U extends UsuarioBase>(usuario: U, liberados: GrupoLiberado[], grupoAtivoId: string | null): UsuarioComRede<U> {
  const deFora = usuario.papel === 'admin_rede' ? liberados.filter(l => l.contaId !== usuario.contaId) : []
  const origem = { lojaId: usuario.lojaId, contaId: usuario.contaId, gruposAcesso: usuario.gruposAcesso, gruposLiberados: deFora }
  type Papel = Exclude<U['papel'], 'admin_rede'>
  if (usuario.papel !== 'admin_rede') return { ...usuario, papel: usuario.papel as Papel, papelReal: usuario.papel, gruposLiberados: [], grupoLiberado: null, origem }
  const base = { ...usuario, papel: 'admin_socio' as Papel, papelReal: usuario.papel, gruposLiberados: deFora, grupoLiberado: null, origem }
  const ativo = deFora.find(l => l.grupoId === grupoAtivoId)
  if (!ativo) return base
  return {
    ...base,
    contaId: ativo.contaId,
    lojaId: null,
    gruposAcesso: [ativo.grupoId],
    // Aprova no grupo liberado só se o admin_geral marcou a aprovação nele (decisão do Luis).
    gruposAprovacao: usuario.gruposAprovacao.includes(ativo.grupoId) ? [ativo.grupoId] : [],
    gruposLiberados: [],
    grupoLiberado: ativo.grupoId,
  }
}
