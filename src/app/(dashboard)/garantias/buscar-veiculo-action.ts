'use server'
import { getUsuarioLogado } from '@/lib/auth'
import { podeAgirNaLoja } from '@/lib/acesso-registro'
import { db } from '@/lib/db'
import { motos, modelos, lojas, vendas, clientes, historicoEstoque } from '@/lib/db/schema'
import { eq, ilike } from 'drizzle-orm'

const ADMINS = ['admin_geral', 'admin_socio', 'aux_adm']

export type VeiculoGarantia = {
  motoId: string
  chassi: string
  marca: string
  modelo: string
  cor: string
  status: string
  lojaId: string
  lojaNome: string
  clienteNome?: string | null
}

// Busca em toda a base de motos (estoque, vendidas, qualquer loja/grupo — mesmo
// escopo do módulo Radar), pois a garantia é sempre aberta na loja da própria moto.
export async function buscarVeiculoGarantiaAction(chassi: string): Promise<VeiculoGarantia[]> {
  await getUsuarioLogado()
  const termo = chassi.trim().toUpperCase()
  if (termo.length < 3) return []

  const resultados = await db
    .select({
      motoId:      motos.id,
      chassi:      motos.chassi,
      marca:       modelos.marca,
      modelo:      modelos.modelo,
      cor:         motos.cor,
      status:      motos.status,
      lojaId:      motos.lojaId,
      lojaNome:    lojas.nome,
      clienteNome: clientes.nome,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas,   eq(motos.lojaId,   lojas.id))
    .leftJoin(vendas,   eq(vendas.motoId,  motos.id))
    .leftJoin(clientes, eq(vendas.clienteId, clientes.id))
    .where(ilike(motos.chassi, `%${termo}%`))
    .limit(10)

  return resultados
}

export async function cadastrarVeiculoGarantiaAction(input: {
  chassi: string
  modeloId: string
  cor: string
  lojaId: string
  notaFiscalEntrada: string
}): Promise<VeiculoGarantia> {
  const usuario = await getUsuarioLogado()
  if (!ADMINS.includes(usuario.papel)) throw new Error('Sem permissão')

  const chassi = input.chassi.trim().toUpperCase()
  if (!chassi) throw new Error('Chassi é obrigatório')
  if (!input.modeloId) throw new Error('Modelo é obrigatório')
  if (!input.cor.trim()) throw new Error('Cor é obrigatória')
  if (!input.notaFiscalEntrada.trim()) throw new Error('Nota fiscal de entrada é obrigatória')

  // aux_adm só cadastra na própria loja; admins escolhem a loja no formulário
  const lojaId = ['admin_geral', 'admin_socio'].includes(usuario.papel)
    ? input.lojaId
    : usuario.lojaId
  if (!lojaId) throw new Error('Loja é obrigatória')
  if (!(await podeAgirNaLoja(usuario, lojaId))) throw new Error('Sem permissão para esta loja')

  try {
    const [nova] = await db.insert(motos).values({
      chassi,
      modeloId: input.modeloId,
      lojaId,
      status: 'montada', // já elegível para abrir garantia imediatamente
      cor: input.cor.trim().toUpperCase(),
      notaFiscalEntrada: input.notaFiscalEntrada.trim(),
      // Só existe para registrar a garantia de um veículo externo — NUNCA é
      // estoque. O filtro em listarMotos a mantém fora do Showroom.
      somenteGarantia: true,
    }).returning({ id: motos.id, lojaId: motos.lojaId, status: motos.status, cor: motos.cor, chassi: motos.chassi })

    await db.insert(historicoEstoque).values({
      motoId: nova.id,
      lojaDestinoId: lojaId,
      usuarioId: usuario.id,
      tipo: 'entrada',
      statusNovo: 'montada',
      observacao: 'Cadastro via abertura de garantia',
    })

    const [modelo] = await db
      .select({ marca: modelos.marca, modelo: modelos.modelo })
      .from(modelos)
      .where(eq(modelos.id, input.modeloId))
      .limit(1)

    const [loja] = await db
      .select({ nome: lojas.nome })
      .from(lojas)
      .where(eq(lojas.id, lojaId))
      .limit(1)

    return {
      motoId:   nova.id,
      chassi:   nova.chassi,
      marca:    modelo?.marca ?? '',
      modelo:   modelo?.modelo ?? '',
      cor:      nova.cor,
      status:   nova.status,
      lojaId:   nova.lojaId,
      lojaNome: loja?.nome ?? '',
    }
  } catch (e: any) {
    const isDup = e.code === '23505' || e.cause?.code === '23505' ||
      e.message?.includes('unique') || e.message?.includes('duplicate key')
    if (isDup) throw new Error('Já existe uma moto cadastrada com esse chassi')
    throw e
  }
}
