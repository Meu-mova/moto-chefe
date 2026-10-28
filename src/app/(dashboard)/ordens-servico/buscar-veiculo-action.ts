'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { db } from '@/lib/db'
import { veiculosHistorico, clientes } from '@/lib/db/schema'
import { and, eq, ilike } from 'drizzle-orm'
import { contaDoGrupoAtivo } from '@/lib/grupo'
import { buscarMotosPorChassi, buscarHistoricoPorChassi } from '@/lib/busca-chassi'

export type VeiculoEncontrado = {
  fonte: 'estoque' | 'historico'
  motoId?: string
  chassi: string
  numeroMotor?: string | null
  marca: string
  modelo: string
  cor?: string | null
  ano?: number | null
  clienteId?: string | null
  clienteNome?: string | null
  clienteCpf?: string | null
  clienteFone?: string | null
}

export async function buscarVeiculoPorChassisAction(chassi: string): Promise<VeiculoEncontrado[]> {
  const usuario = await getUsuarioLogado()
  const termo = chassi.trim().toUpperCase()
  if (termo.length < 3) return []

  const padrao = `%${termo}%`

  // 1. Busca no estoque (motos cadastradas): só da Conta; admin_geral acha de qualquer uma (#325)
  const conta = await contaDoGrupoAtivo(usuario)
  const motosBD = (await buscarMotosPorChassi(termo, {
    contaDasMotos: usuario.papel === 'admin_geral' ? null : conta,
    contaDoComprador: conta,
    limite: 8,
  })).map(m => ({ ...m, id: m.motoId }))

  // 2. Busca no banco histórico (chassis que não estão no estoque)
  const chassisEstoque = new Set(motosBD.map(m => m.chassi).filter(Boolean) as string[])

  const historico = await buscarHistoricoPorChassi(termo, usuario.papel === 'admin_geral' ? null : conta, 8)

  const resultados: VeiculoEncontrado[] = [
    ...motosBD.map(m => ({
      fonte:       'estoque' as const,
      motoId:      m.id,
      chassi:      m.chassi ?? termo,
      marca:       m.marca,
      modelo:      m.modelo,
      cor:         m.cor,
      clienteId:   m.clienteId,
      clienteNome: m.clienteNome,
      clienteCpf:  m.clienteCpf,
      clienteFone: m.clienteFone,
    })),
    // histórico: só inclui os que não estão no estoque (evita duplicata)
    ...historico
      .filter(h => !chassisEstoque.has(h.chassi))
      .map(h => ({
        fonte:       'historico' as const,
        chassi:      h.chassi,
        numeroMotor: h.numeroMotor,
        marca:       h.marca,
        modelo:      h.modelo,
        cor:         h.cor,
        ano:         h.ano,
      })),
  ].slice(0, 10)

  return resultados
}

export async function buscarClientePorCpfAction(cpf: string) {
  const usuario = await getUsuarioLogado()
  const cpfNorm = cpf.replace(/\D/g, '')
  if (cpfNorm.length < 11) return null

  const [cliente] = await db
    .select({ id: clientes.id, nome: clientes.nome, cpfCnpj: clientes.cpfCnpj, celular: clientes.celular, email: clientes.email })
    .from(clientes)
    .where(and(ilike(clientes.cpfCnpj, `%${cpfNorm}%`), eq(clientes.contaId, await contaDoGrupoAtivo(usuario))))
    .limit(1)

  return cliente ?? null
}

export async function cadastrarVeiculoHistoricoAction(input: {
  chassi: string
  marca: string
  modelo: string
  cor?: string | null
  numeroMotor?: string | null
}): Promise<VeiculoEncontrado> {
  const usuario = await getUsuarioLogado()
  // Lista positiva: papel novo (como 'cargo') não entra por omissão.
  if (!['admin_geral', 'admin_socio', 'aux_adm', 'vendedor', 'motorista'].includes(usuario.papel)) throw new Error('Sem permissão')

  const chassi = input.chassi.trim().toUpperCase()
  const marca  = input.marca.trim()
  const modelo = input.modelo.trim()
  if (!chassi) throw new Error('Chassi é obrigatório')
  if (!marca)  throw new Error('Marca é obrigatória')
  if (!modelo) throw new Error('Modelo é obrigatório')

  try {
    const [novo] = await db.insert(veiculosHistorico).values({
      chassi,
      marca,
      modelo,
      cor:         input.cor?.trim() || null,
      numeroMotor: input.numeroMotor?.trim() || null,
      contaId:     await contaDoGrupoAtivo(usuario),
    }).returning()

    return {
      fonte:       'historico',
      chassi:      novo.chassi,
      numeroMotor: novo.numeroMotor,
      marca:       novo.marca,
      modelo:      novo.modelo,
      cor:         novo.cor,
      ano:         novo.ano,
    }
  } catch (e: any) {
    const isDup = e.code === '23505' || e.cause?.code === '23505' ||
      e.message?.includes('unique') || e.message?.includes('duplicate key')
    if (isDup) throw new Error('Já existe um veículo cadastrado com esse chassi')
    throw e
  }
}
