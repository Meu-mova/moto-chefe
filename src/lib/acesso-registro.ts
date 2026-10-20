import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { grupos, lojas } from '@/lib/db/schema'
import { podeVerGrupo } from '@/lib/acesso-grupo'

type Executor = Pick<typeof db, 'select'>

// Tela de detalhe aberta pelo endereço (moto, OS): o registro só aparece se o grupo
// da loja dele é um que o usuário pode ver. Mesma regra do seletor de grupo
// (podeVerGrupo); quem chama devolve 404 quando dá false, para não revelar que o
// registro existe em outro grupo.
export async function podeAbrirRegistroDaLoja(
  usuario: { papel: string; lojaId: string | null; gruposAcesso?: readonly string[] | null },
  lojaId: string,
  exec: Executor = db,
): Promise<boolean> {
  const ids = usuario.lojaId && usuario.lojaId !== lojaId ? [lojaId, usuario.lojaId] : [lojaId]
  const linhas = await exec
    .select({ lojaId: lojas.id, grupoId: lojas.grupoId, ativo: grupos.ativo })
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
    { papel: usuario.papel, gruposAcesso: usuario.gruposAcesso ? [...usuario.gruposAcesso] : null },
    grupoDaPropriaLoja,
    doRegistro.grupoId,
  )
}
