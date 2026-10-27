import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'
import { podeVendedorReservarForaDaLoja } from '@/lib/loja-galpao'

type Executor = Pick<typeof db, 'select'>

// Tela de detalhe aberta pelo endereço (moto, OS): o registro só aparece se o grupo
// da loja dele é um que o usuário pode ver. Mesma regra do seletor de grupo
// (podeVerGrupo); quem chama devolve 404 quando dá false, para não revelar que o
// registro existe em outro grupo.
export async function podeAbrirRegistroDaLoja(
  usuario: { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null },
  lojaId: string,
  exec: Executor = db,
): Promise<boolean> {
  const ids = usuario.lojaId && usuario.lojaId !== lojaId ? [lojaId, usuario.lojaId] : [lojaId]
  const linhas = await exec
    .select({ lojaId: lojas.id, grupoId: lojas.grupoId, ativo: grupos.ativo, contaId: grupos.contaId })
    .from(lojas)
    .innerJoin(grupos, eq(grupos.id, lojas.grupoId))
    .where(inArray(lojas.id, ids))
  const doRegistro = linhas.find(l => l.lojaId === lojaId)
  if (!doRegistro) return false
  if (usuario.papel === 'admin_geral') return true
  if (!doRegistro.ativo) return false
  const grupoDaPropriaLoja = usuario.lojaId
    ? linhas.find(l => l.lojaId === usuario.lojaId)?.grupoId ?? null
    : null
  return podeVerGrupo(
    { papel: usuario.papel, gruposAcesso: usuario.gruposAcesso ? [...usuario.gruposAcesso] : null, contaId: usuario.contaId },
    grupoDaPropriaLoja,
    { id: doRegistro.grupoId, contaId: doRegistro.contaId },
  )
}

// Ação (ou impressão) sobre registro de uma loja escolhida pelo payload ou buscado
// por id. Admin passava direto, inclusive com loja de outro grupo forjada no payload;
// agora passa só no grupo que vê. Os demais papéis seguem presos à própria loja.
export async function podeAgirNaLoja(
  usuario: { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null },
  lojaId: string,
  exec: Executor = db,
): Promise<boolean> {
  if (usuario.papel === 'admin_geral' || usuario.papel === 'admin_socio') {
    return podeAbrirRegistroDaLoja(usuario, lojaId, exec)
  }
  return usuario.lojaId === lojaId
}

// Reservar, vender ou pedir venda de uma moto: como podeAgirNaLoja, mais a exceção
// do Galpão Matriz para quem vende (CONTEXT.md), dentro do grupo dele. É a regra que
// a tela já aplica; aqui ela vale também para quem chama a action direto.
export async function podeVenderMotoDaLoja(
  usuario: { papel: string; papeisExtras?: readonly string[] | null; lojaId: string | null; gruposAcesso?: readonly string[] | null; contaId: string | null },
  lojaId: string,
  exec: Executor = db,
): Promise<boolean> {
  if (await podeAgirNaLoja(usuario, lojaId, exec)) return true
  const vende = usuario.papel === 'vendedor' || (usuario.papeisExtras ?? []).includes('vendedor')
  return vende && podeVendedorReservarForaDaLoja(lojaId) && (await podeAbrirRegistroDaLoja(usuario, lojaId, exec))
}
