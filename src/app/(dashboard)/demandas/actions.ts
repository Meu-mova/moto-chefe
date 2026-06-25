'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { demandas } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { revalidatePath } from 'next/cache'

const ADMINS = ['admin_geral', 'admin_socio']

export async function criarDemandaAction(modelo: string, cor: string, lojaId: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }
  // Não-admins só podem criar demandas na própria loja — ignora lojaId do cliente
  const effectiveLojaId = ADMINS.includes(usuario.papel) ? lojaId : usuario.lojaId
  if (!effectiveLojaId) throw new Error('Usuário sem loja associada')
  await db.insert(demandas).values({
    modelo: modelo.trim(),
    cor: cor.trim(),
    lojaId: effectiveLojaId,
    solicitanteId: usuario.id,
  })
  revalidatePath('/demandas')
}

export async function darBaixaAction(demandaId: string) {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) {
    throw new Error('Sem permissão para dar baixa')
  }
  await db.delete(demandas).where(eq(demandas.id, demandaId))
  revalidatePath('/demandas')
}
