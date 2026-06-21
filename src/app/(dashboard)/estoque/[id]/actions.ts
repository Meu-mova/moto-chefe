// src/app/(dashboard)/estoque/[id]/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, usuarios } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import {
  getTransicoesStatusPermitidas,
  getTransicoesDisponibilidadePermitidas,
  statusLabel,
  disponibilidadeLabel,
  type Status,
  type Disponibilidade,
} from '@/lib/estado-moto'
import { revalidatePath } from 'next/cache'

export async function alterarStatusAction(
  motoId: string,
  novoStatus: string,
  observacao?: string,
  mecanicoId?: string,
  dataMontagem?: string,
) {
  const usuario = await getUsuarioLogado()
  const supabase = await createClient()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  if (!(novoStatus in statusLabel)) throw new Error('Status inválido')
  const status = novoStatus as Status

  if (novoStatus === 'montada' && !mecanicoId) {
    throw new Error('Selecione o mecânico responsável pela montagem')
  }

  const isMinhaLoja = usuario.lojaId === moto.lojaId
  const permitidas = getTransicoesStatusPermitidas(moto.status as Status, usuario.papel, isMinhaLoja)

  if (!permitidas.includes(status)) {
    throw new Error(`Transição ${moto.status} → ${novoStatus} não permitida`)
  }

  // Monta observação incluindo o mecânico responsável quando aplicável
  let obsHistorico = observacao ?? null
  if (novoStatus === 'montada' && mecanicoId) {
    const [mecanico] = await db
      .select({ nome: usuarios.nome })
      .from(usuarios)
      .where(eq(usuarios.id, mecanicoId))
      .limit(1)
    const mecanicoNome = mecanico?.nome ?? 'Desconhecido'
    const partes = [`Mecânico responsável: ${mecanicoNome}`]
    if (observacao) partes.push(observacao)
    obsHistorico = partes.join(' — ')
  }

  const { error } = await supabase.rpc('mudar_status_moto', {
    p_moto_id: motoId,
    p_novo_status: novoStatus,
    p_usuario_id: usuario.id,
    p_observacao: obsHistorico,
  })

  if (error) throw new Error(error.message)

  if (novoStatus === 'montada' && mecanicoId) {
    await db.update(motos)
      .set({
        responsavelMontagemId: mecanicoId,
        dataMontagem: dataMontagem ?? new Date().toISOString().split('T')[0],
      })
      .where(eq(motos.id, motoId))
  }

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}

export async function editarMotoAction(
  motoId: string,
  dados: {
    chassi?: string
    cor?: string
    motor?: string
    modeloId?: string
    lojaId?: string
    notaFiscalEntrada?: string
    status?: string
    disponibilidade?: string | null
  },
) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    throw new Error('Sem permissão para editar moto')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  const updates: Record<string, unknown> = {}
  if (dados.chassi !== undefined && dados.chassi !== moto.chassi) updates.chassi = dados.chassi
  if (dados.cor !== undefined && dados.cor !== moto.cor) updates.cor = dados.cor
  if (dados.motor !== undefined && dados.motor !== moto.motor) updates.motor = dados.motor || null
  if (dados.modeloId !== undefined && dados.modeloId !== moto.modeloId) updates.modeloId = dados.modeloId
  if (dados.lojaId !== undefined && dados.lojaId !== moto.lojaId) updates.lojaId = dados.lojaId
  if (dados.notaFiscalEntrada !== undefined && dados.notaFiscalEntrada !== moto.notaFiscalEntrada) updates.notaFiscalEntrada = dados.notaFiscalEntrada
  if (dados.status !== undefined && dados.status !== moto.status) updates.status = dados.status
  if (dados.disponibilidade !== undefined && dados.disponibilidade !== moto.disponibilidade) updates.disponibilidade = dados.disponibilidade

  if (Object.keys(updates).length === 0) return

  await db.update(motos).set(updates).where(eq(motos.id, motoId))

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}

export async function alterarDisponibilidadeAction(motoId: string, novaDisp: string, observacao?: string) {
  const usuario = await getUsuarioLogado()

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')

  if (!(novaDisp in disponibilidadeLabel)) throw new Error('Disponibilidade inválida')
  const disp = novaDisp as Disponibilidade

  const isMinhaLoja = usuario.lojaId === moto.lojaId
  const permitidas = getTransicoesDisponibilidadePermitidas(
    moto.status as Status,
    moto.disponibilidade as Disponibilidade | null,
    usuario.papel,
    isMinhaLoja,
  )

  if (!permitidas.includes(disp)) {
    throw new Error(`Transição de disponibilidade não permitida`)
  }

  await db.update(motos).set({ disponibilidade: disp }).where(eq(motos.id, motoId))

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}
