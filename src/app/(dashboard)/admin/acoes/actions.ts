'use server'
import { db } from '@/lib/db'
import { motos, historicoEstoque } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

async function assertAdmin() {
  const u = await getUsuarioLogado()
  if (u.papel !== 'admin_geral') throw new Error('Acesso restrito ao Admin Geral')
  return u
}

export async function reatribuirLojaMotaAction(motoId: string, novaLojaId: string, observacao: string) {
  const admin = await assertAdmin()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status !== 'faturada') throw new Error('Reatribuição de loja só permitida para motos com status "faturada"')
  if (!observacao) throw new Error('Observação obrigatória para reatribuição de loja')

  const lojaAnteriorId = moto.lojaId

  await db.update(motos).set({ lojaId: novaLojaId }).where(eq(motos.id, motoId))
  await db.insert(historicoEstoque).values({
    motoId,
    lojaOrigemId: lojaAnteriorId,
    lojaDestinoId: novaLojaId,
    usuarioId: admin.id,
    tipo: 'transferencia_enviada',
    observacao: `Reatribuição de loja pelo Admin: ${observacao}`,
  })

  revalidatePath('/estoque')
  revalidatePath(`/estoque/${motoId}`)
}

export async function correcaoStatusAdminAction(motoId: string, novoStatus: string, observacao: string) {
  const admin = await assertAdmin()
  if (!observacao) throw new Error('Observação obrigatória para correção de status')

  const supabase = await createClient()
  const { error } = await supabase.rpc('mudar_status_moto', {
    p_moto_id: motoId,
    p_novo_status: novoStatus,
    p_usuario_id: admin.id,
    p_observacao: observacao,
  })
  if (error) throw new Error(error.message)
  revalidatePath(`/estoque/${motoId}`)
}
