// src/app/(dashboard)/estoque/[id]/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getTransicoesPermitidas } from '@/lib/estado-moto'
import { revalidatePath } from 'next/cache'

export async function alterarStatusAction(motoId: string, novoStatus: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const isMinhaLoja = usuario.lojaId === moto.lojaId
  const permitidas = getTransicoesPermitidas(moto.status, usuario.papel, isMinhaLoja)

  if (!permitidas.includes(novoStatus as any)) {
    throw new Error(`Transição ${moto.status} → ${novoStatus} não permitida`)
  }

  const { error } = await supabase.rpc('mudar_status_moto', {
    p_moto_id: motoId,
    p_novo_status: novoStatus,
    p_usuario_id: usuario.id,
    p_observacao: observacao ?? null,
  })

  if (error) throw new Error(error.message)

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}
