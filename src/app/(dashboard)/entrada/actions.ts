'use server'

import { db } from '@/lib/db'
import { motos, lojas, historicoEstoque, modelos } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getUsuarioLogado, podeRegistrarEntradaMotos } from '@/lib/auth'
import { getGrupoIdDaLoja } from '@/lib/grupo'
import { revalidatePath } from 'next/cache'

type Usuario = Awaited<ReturnType<typeof getUsuarioLogado>>

// Resolve a loja de destino garantindo que ela existe e que o usuário pode usá-la.
// Admin escolhe qualquer loja (o seletor já é filtrado pelo grupo ativo do cookie);
// quem entra pela exceção nominal fica restrito ao grupo da própria loja, para que
// um lojaId forjado no payload não jogue moto no estoque de outro grupo.
async function resolverLojaDestino(usuario: Usuario, lojaId: string) {
  const [loja] = await db
    .select({ id: lojas.id, grupoId: lojas.grupoId })
    .from(lojas)
    .where(eq(lojas.id, lojaId))
    .limit(1)

  if (!loja) return { error: 'Loja não encontrada' as const }

  if (!['admin_geral', 'admin_socio'].includes(usuario.papel)) {
    if (!usuario.lojaId) return { error: 'Usuário sem loja associada' as const }
    const grupoUsuario = await getGrupoIdDaLoja(usuario.lojaId)
    if (grupoUsuario !== loja.grupoId) return { error: 'Loja fora do seu grupo' as const }
  }

  return { loja }
}

type MotoEntrada = {
  chassi: string
  cor: string
  motor?: string
}

export async function registrarEntrada(formData: {
  notaFiscal: string
  modeloId: string
  precoCompra: string
  lojaId: string
  motos: MotoEntrada[]
}) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) {
    return { error: 'Sem permissão' }
  }

  if (!formData.notaFiscal || !formData.modeloId || !formData.precoCompra || !formData.lojaId || !formData.motos.length) {
    return { error: 'Preencha todos os campos obrigatórios' }
  }

  const precoCompra = formData.precoCompra.replace(',', '.')

  const destino = await resolverLojaDestino(usuario, formData.lojaId)
  if ('error' in destino) return { error: destino.error }
  const { loja } = destino

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
        lojaId: loja.id,
        status: 'caixa',
        cor: moto.cor.trim().toUpperCase(),
        notaFiscalEntrada: formData.notaFiscal.trim(),
        motor: moto.motor?.trim() || null,
        precoCompra,
      }).returning({ id: motos.id })

      await db.insert(historicoEstoque).values({
        motoId: novaMoto.id,
        lojaDestinoId: loja.id,
        usuarioId: usuario.id,
        tipo: 'entrada',
        statusNovo: 'caixa',
        observacao: `Entrada NF ${formData.notaFiscal.trim()}`,
      })

      inseridos++
    } catch (e: any) {
      const isDup = e.code === '23505' || e.cause?.code === '23505' ||
        e.message?.includes('unique') || e.message?.includes('duplicate key')
      if (isDup) {
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

type MotoEntradaLote = {
  chassi: string
  cor: string
  motor?: string
  modeloNome: string
  notaFiscal: string
}

export async function registrarEntradaLote(formData: {
  lojaId: string
  motos: MotoEntradaLote[]
}) {
  const usuario = await getUsuarioLogado()
  if (!podeRegistrarEntradaMotos(usuario)) {
    return { error: 'Sem permissão' }
  }

  if (!formData.lojaId) {
    return { error: 'Selecione a loja de destino' }
  }

  if (!formData.motos.length) {
    return { error: 'Importe as motos da planilha' }
  }

  const destino = await resolverLojaDestino(usuario, formData.lojaId)
  if ('error' in destino) return { error: destino.error }
  const { loja } = destino

  const allModelos = await db
    .select({ id: modelos.id, modelo: modelos.modelo, precoCompraPadrao: modelos.precoCompraPadrao })
    .from(modelos)

  const normalize = (s: string) => s.toUpperCase().replace(/[-_]/g, ' ').replace(/\s+/g, ' ').trim()
  const modeloMap = new Map(allModelos.map(m => [normalize(m.modelo), m]))

  const chassisExistentes = new Set<string>()
  const duplicados: string[] = []

  for (const moto of formData.motos) {
    const chassiNorm = moto.chassi.trim().toUpperCase()
    if (!chassiNorm) continue
    if (chassisExistentes.has(chassiNorm)) {
      duplicados.push(chassiNorm)
    }
    chassisExistentes.add(chassiNorm)
  }

  if (duplicados.length) {
    return { error: `Chassis duplicados na planilha: ${duplicados.join(', ')}` }
  }

  let inseridos = 0
  const erros: string[] = []
  const modelosNaoEncontrados = new Set<string>()

  for (const moto of formData.motos) {
    const chassi = moto.chassi.trim().toUpperCase()
    if (!chassi) continue

    const modeloInfo = modeloMap.get(normalize(moto.modeloNome))

    if (!modeloInfo) {
      modelosNaoEncontrados.add(moto.modeloNome)
      erros.push(`${chassi}: modelo "${moto.modeloNome}" não encontrado`)
      continue
    }

    const nf = moto.notaFiscal.trim()

    try {
      const [novaMoto] = await db.insert(motos).values({
        chassi,
        modeloId: modeloInfo.id,
        lojaId: loja.id,
        status: 'caixa',
        cor: moto.cor.trim().toUpperCase(),
        notaFiscalEntrada: nf,
        motor: moto.motor?.trim() || null,
        precoCompra: modeloInfo.precoCompraPadrao,
      }).returning({ id: motos.id })

      await db.insert(historicoEstoque).values({
        motoId: novaMoto.id,
        lojaDestinoId: loja.id,
        usuarioId: usuario.id,
        tipo: 'entrada',
        statusNovo: 'caixa',
        observacao: `Entrada NF ${nf}`,
      })

      inseridos++
    } catch (e: any) {
      const isDup = e.code === '23505' || e.cause?.code === '23505' ||
        e.message?.includes('unique') || e.message?.includes('duplicate key')
      if (isDup) {
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
