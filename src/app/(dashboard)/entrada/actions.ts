'use server'

import { db } from '@/lib/db'
import { motos, lojas, historicoEstoque } from '@/lib/db/schema'
import { eq, ilike } from 'drizzle-orm'
import { getUsuarioLogado } from '@/lib/auth'
import { revalidatePath } from 'next/cache'

type MotoEntrada = {
  chassi: string
  cor: string
  motor?: string
}

export async function registrarEntrada(formData: {
  notaFiscal: string
  modeloId: string
  valor: string
  motos: MotoEntrada[]
}) {
  const usuario = await getUsuarioLogado()
  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    return { error: 'Sem permissão' }
  }

  if (!formData.notaFiscal || !formData.modeloId || !formData.motos.length) {
    return { error: 'Preencha todos os campos obrigatórios' }
  }

  const [galpao] = await db
    .select({ id: lojas.id })
    .from(lojas)
    .where(ilike(lojas.nome, '%galpão%'))
    .limit(1)

  if (!galpao) {
    return { error: 'Loja Galpão não encontrada no sistema' }
  }

  const chassisExistentes = new Set<string>()
  const duplicados: string[] = []

  for (const moto of formData.motos) {
    const chassiNorm = moto.chassi.trim().toUpperCase()
    if (!chassiNorm) {
      return { error: 'Chassi não pode ser vazio' }
    }
    if (chassisExistentes.has(chassiNorm)) {
      duplicados.push(chassiNorm)
    }
    chassisExistentes.add(chassiNorm)
  }

  if (duplicados.length) {
    return { error: `Chassis duplicados na lista: ${duplicados.join(', ')}` }
  }

  let inseridos = 0
  const erros: string[] = []

  for (const moto of formData.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    try {
      const [novaMoto] = await db.insert(motos).values({
        chassi,
        modeloId: formData.modeloId,
        lojaId: galpao.id,
        status: 'caixa',
        cor: moto.cor.trim().toUpperCase(),
        notaFiscalEntrada: formData.notaFiscal.trim(),
        motor: moto.motor?.trim() || null,
      }).returning({ id: motos.id })

      await db.insert(historicoEstoque).values({
        motoId: novaMoto.id,
        lojaDestinoId: galpao.id,
        usuarioId: usuario.id,
        tipo: 'entrada',
        statusNovo: 'caixa',
        observacao: `Entrada NF ${formData.notaFiscal.trim()}`,
      })

      inseridos++
    } catch (e: any) {
      if (e.message?.includes('unique') || e.code === '23505') {
        erros.push(`${chassi}: chassi já existe no sistema`)
      } else {
        erros.push(`${chassi}: ${e.message}`)
      }
    }
  }

  revalidatePath('/estoque')
  revalidatePath('/dashboard')
  revalidatePath('/entrada')

  if (erros.length && inseridos === 0) {
    return { error: `Nenhuma moto inserida. Erros:\n${erros.join('\n')}` }
  }

  if (erros.length) {
    return { success: `${inseridos} moto(s) inserida(s). Erros:\n${erros.join('\n')}` }
  }

  return { success: `${inseridos} moto(s) inserida(s) com sucesso!` }
}
