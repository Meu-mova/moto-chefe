// src/app/(dashboard)/estoque/[id]/actions.ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { hojeBrt } from '@/lib/data-venda'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { motos, usuarios, reservas, vendas } from '@/lib/db/schema'
import { eq, and, desc } from 'drizzle-orm'
import {
  getTransicoesStatusPermitidas,
  getTransicoesDisponibilidadePermitidas,
  motivoBloqueioPorVenda,
  statusLabel,
  disponibilidadeLabel,
  type Status,
  type Disponibilidade,
  type VendaVinculada,
} from '@/lib/estado-moto'
import { revalidatePath } from 'next/cache'
import { garantias, historicoEstoque } from '@/lib/db/schema'

/**
 * A venda não cancelada desta moto, se houver. Cancelar venda apaga a linha
 * (ver cancelarVendaCompletaAction), então qualquer linha aqui é venda de pé.
 */
async function vendaDaMoto(motoId: string): Promise<VendaVinculada | null> {
  const [venda] = await db
    .select({ numero: vendas.numero, notaFiscalSaida: vendas.notaFiscalSaida })
    .from(vendas)
    .where(eq(vendas.motoId, motoId))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)
  return venda ?? null
}

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

  // Moto vendida não volta a ser estoque. A checagem de transição abaixo olha só
  // o motos.status e não pega o caso em que o status já foi revertido por fora —
  // foi assim que a LYDAE3936T1207627 acabou remontada depois de faturada.
  const bloqueioVenda = motivoBloqueioPorVenda(await vendaDaMoto(motoId), { status: novoStatus })
  if (bloqueioVenda) throw new Error(bloqueioVenda)

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
    // Uma moto em "caixa" pode já ter sido reservada antes de montar — não
    // pisar nessa reserva forçando disponibilidade pra 'disponivel'.
    const [reservaAtiva] = await db
      .select({ id: reservas.id })
      .from(reservas)
      .where(and(eq(reservas.motoId, motoId), eq(reservas.status, 'ativa')))
      .limit(1)

    await db.update(motos)
      .set({
        responsavelMontagemId: mecanicoId,
        dataMontagem: dataMontagem ?? hojeBrt(),
        disponibilidade: reservaAtiva ? 'reservada' : 'disponivel',
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

  // Esta action é a ferramenta de correção do admin, e por isso aceita pular a
  // máquina de estados. O que ela NÃO pode fazer é aceitar valor fora do enum
  // nem tirar do estado vendido uma moto que tem venda de pé.
  const statusEditaveis = new Set([...Object.keys(statusLabel), 'vendida'])
  if (dados.status !== undefined && !statusEditaveis.has(dados.status)) {
    throw new Error('Status inválido')
  }
  if (
    dados.disponibilidade !== undefined &&
    dados.disponibilidade !== null &&
    !(dados.disponibilidade in disponibilidadeLabel)
  ) {
    throw new Error('Disponibilidade inválida')
  }

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

  // Só chaves presentes em updates chegam aqui — campo não mexido não vira
  // bloqueio, então corrigir cor/chassi de uma moto vendida segue liberado.
  const bloqueioVenda = motivoBloqueioPorVenda(await vendaDaMoto(motoId), {
    status: updates.status as string | undefined,
    disponibilidade: updates.disponibilidade as string | null | undefined,
  })
  if (bloqueioVenda) throw new Error(bloqueioVenda)

  // Toda edição por aqui deixa rastro. A alteração silenciosa de 24/08/2026 na
  // LYDAE3936T1207627 saiu desta action e não gerou linha nenhuma no histórico:
  // sem rastro, a reconstrução do que houve virou dedução em vez de leitura.
  const rotulos: Record<string, string> = {
    chassi: 'Chassi', cor: 'Cor', motor: 'Motor', modeloId: 'Modelo',
    lojaId: 'Loja', notaFiscalEntrada: 'NF de entrada',
    status: 'Status', disponibilidade: 'Disponibilidade',
  }
  const valor = (v: unknown) => (v === null || v === undefined || v === '' ? '(vazio)' : String(v))
  const descricao = Object.keys(updates)
    .map(campo => `${rotulos[campo] ?? campo}: ${valor((moto as Record<string, unknown>)[campo])} → ${valor(updates[campo])}`)
    .join(' — ')

  await db.transaction(async (tx) => {
    await tx.update(motos).set(updates).where(eq(motos.id, motoId))

    await tx.insert(historicoEstoque).values({
      motoId,
      usuarioId: usuario.id,
      tipo: 'mudanca_status',
      statusAnterior: updates.status ? (moto.status as any) : null,
      statusNovo: updates.status ? (updates.status as any) : null,
      observacao: `Edição manual (admin) — ${descricao}`,
    })
  })

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
}

export async function resolverGarantiaSemRegistroAction(motoId: string, observacao?: string) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio', 'aux_adm'].includes(usuario.papel)) {
    throw new Error('Sem permissão')
  }

  const [moto] = await db.select().from(motos).where(eq(motos.id, motoId)).limit(1)
  if (!moto) throw new Error('Moto não encontrada')
  if (moto.status !== 'em_garantia') throw new Error('Moto não está em garantia')

  const [garantiaAtiva] = await db
    .select({ id: garantias.id })
    .from(garantias)
    .where(eq(garantias.motoId, motoId))
    .limit(1)

  if (garantiaAtiva) throw new Error('Esta moto tem garantia formal registrada. Use o fluxo de encerramento de garantia.')

  await db.update(motos)
    .set({ status: 'montada', disponibilidade: 'disponivel' })
    .where(eq(motos.id, motoId))

  await db.insert(historicoEstoque).values({
    motoId,
    usuarioId: usuario.id,
    tipo: 'mudanca_status',
    statusAnterior: 'em_garantia',
    statusNovo: 'montada',
    observacao: observacao || 'Garantia resolvida (sem registro formal)',
  })

  revalidatePath(`/estoque/${motoId}`)
  revalidatePath('/estoque')
  revalidatePath('/dashboard')
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
