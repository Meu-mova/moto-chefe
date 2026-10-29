'use server'

import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { demandas, motos } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo } from '@/lib/grupo'
import { podeAbrirRegistroDaLoja } from '@/lib/acesso-registro'
import { maquininhasDaLoja, maquininhasDoGrupo, type Maquininha } from '@/lib/maquininhas'

export type RegistroComLoja = { loja: string } | { moto: string } | { demanda: string }

async function lojaDoRegistro(r: RegistroComLoja): Promise<string | null> {
  if ('loja' in r) return r.loja || null
  if ('moto' in r) {
    const [m] = await db.select({ lojaId: motos.lojaId }).from(motos).where(eq(motos.id, r.moto)).limit(1)
    return m?.lojaId ?? null
  }
  const [d] = await db.select({ lojaId: demandas.lojaId }).from(demandas).where(eq(demandas.id, r.demanda)).limit(1)
  return d?.lojaId ?? null
}

/**
 * Maquininhas do grupo da loja do registro (#460). Registro que o usuário não vê ou que não
 * existe: lista vazia, sem diferença entre os dois.
 */
export async function maquininhasDoRegistroAction(r: RegistroComLoja): Promise<Maquininha[]> {
  const usuario = await getUsuarioLogado()
  const lojaId = await lojaDoRegistro(r)
  if (!lojaId || !(await podeAbrirRegistroDaLoja(usuario, lojaId))) return []
  return maquininhasDaLoja(db, lojaId)
}

/** Maquininhas do grupo ativo da sessão, para a conciliação (#460). */
export async function maquininhasDoGrupoAtivoAction(): Promise<Maquininha[]> {
  const usuario = await getUsuarioLogado()
  const grupo = await getGrupoAtivo(usuario)
  return maquininhasDoGrupo(db, grupo.id)
}
