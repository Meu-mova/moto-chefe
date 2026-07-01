import { db } from '@/lib/db'
import { ordensServico, osItens, motos, lojas, usuarios, modelos, clientes } from '@/lib/db/schema'
import { eq, desc, and, or, ilike, inArray, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

export type OSComDetalhes  = Awaited<ReturnType<typeof listarTodasOS>>[0]
export type OSDetalhe      = Awaited<ReturnType<typeof buscarOS>>
export type OSItem         = Awaited<ReturnType<typeof listarItensOS>>[0]

function buildSelect(mecanico: ReturnType<typeof alias<typeof usuarios, 'mecanico'>>) {
  return {
    id:                  ordensServico.id,
    numero:              ordensServico.numero,
    status:              ordensServico.status,
    tipoOs:              ordensServico.tipoOs,
    descricao:           ordensServico.descricao,
    diagnostico:         ordensServico.diagnostico,
    observacoesFinais:   ordensServico.observacoesFinais,
    valorTotal:          ordensServico.valorTotal,
    formaPagamento:      ordensServico.formaPagamento,
    dataPrevisao:        ordensServico.dataPrevisao,
    marcaExterna:        ordensServico.marcaExterna,
    modeloExterno:       ordensServico.modeloExterno,
    placa:               ordensServico.placa,
    km:                  ordensServico.km,
    clienteNomeExterno:  ordensServico.clienteNomeExterno,
    clienteFoneExterno:  ordensServico.clienteFoneExterno,
    dataAbertura:        ordensServico.dataAbertura,
    dataConclusao:       ordensServico.dataConclusao,
    motoId:              ordensServico.motoId,
    lojaId:              ordensServico.lojaId,
    mecanicoId:          ordensServico.mecanicoId,
    clienteId:           ordensServico.clienteId,
    chassi:              motos.chassi,
    cor:                 motos.cor,
    marca:               modelos.marca,
    modelo:              modelos.modelo,
    lojaNome:            lojas.nome,
    abertaPorNome:       usuarios.nome,
    mecanicoNome:        mecanico.nome,
    clienteNome:         clientes.nome,
    clienteTelefone:     clientes.celular,
  }
}

export async function listarOSPorLoja(lojaId: string) {
  const mecanico = alias(usuarios, 'mecanico')
  return db
    .select(buildSelect(mecanico))
    .from(ordensServico)
    .innerJoin(lojas,    eq(ordensServico.lojaId,    lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor,  usuarios.id))
    .leftJoin(motos,     eq(ordensServico.motoId,    motos.id))
    .leftJoin(modelos,   eq(motos.modeloId,          modelos.id))
    .leftJoin(mecanico,  eq(ordensServico.mecanicoId, mecanico.id))
    .leftJoin(clientes,  eq(ordensServico.clienteId,  clientes.id))
    .where(eq(ordensServico.lojaId, lojaId))
    .orderBy(desc(ordensServico.dataAbertura))
}

export async function listarTodasOS(filtros?: {
  status?: string[]
  tipoOs?: string[]
  busca?: string
  lojaId?: string[]
}) {
  const mecanico = alias(usuarios, 'mecanico')
  return db
    .select(buildSelect(mecanico))
    .from(ordensServico)
    .innerJoin(lojas,    eq(ordensServico.lojaId,    lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor,  usuarios.id))
    .leftJoin(motos,     eq(ordensServico.motoId,    motos.id))
    .leftJoin(modelos,   eq(motos.modeloId,          modelos.id))
    .leftJoin(mecanico,  eq(ordensServico.mecanicoId, mecanico.id))
    .leftJoin(clientes,  eq(ordensServico.clienteId,  clientes.id))
    .where(and(
      filtros?.status?.length   ? inArray(ordensServico.status, filtros.status as any[]) : undefined,
      filtros?.tipoOs?.length   ? inArray(ordensServico.tipoOs, filtros.tipoOs) : undefined,
      filtros?.lojaId !== undefined ? inArray(ordensServico.lojaId, filtros.lojaId) : undefined,
      filtros?.busca?.trim()    ? or(
        ilike(motos.chassi,             `%${filtros.busca}%`),
        ilike(ordensServico.marcaExterna,  `%${filtros.busca}%`),
        ilike(ordensServico.modeloExterno, `%${filtros.busca}%`),
        ilike(ordensServico.placa,         `%${filtros.busca}%`),
        ilike(clientes.nome,              `%${filtros.busca}%`),
        ilike(ordensServico.clienteNomeExterno, `%${filtros.busca}%`),
        sql`${ordensServico.numero}::text ILIKE ${'%' + filtros.busca + '%'}`,
      ) : undefined,
    ))
    .orderBy(desc(ordensServico.dataAbertura))
}

export async function buscarOS(id: string) {
  const mecanico = alias(usuarios, 'mecanico')
  const [os] = await db
    .select(buildSelect(mecanico))
    .from(ordensServico)
    .innerJoin(lojas,    eq(ordensServico.lojaId,    lojas.id))
    .innerJoin(usuarios, eq(ordensServico.abertaPor,  usuarios.id))
    .leftJoin(motos,     eq(ordensServico.motoId,    motos.id))
    .leftJoin(modelos,   eq(motos.modeloId,          modelos.id))
    .leftJoin(mecanico,  eq(ordensServico.mecanicoId, mecanico.id))
    .leftJoin(clientes,  eq(ordensServico.clienteId,  clientes.id))
    .where(eq(ordensServico.id, id))
    .limit(1)
  return os ?? null
}

export async function listarItensOS(osId: string) {
  return db
    .select()
    .from(osItens)
    .where(eq(osItens.osId, osId))
    .orderBy(osItens.criadoEm)
}

export async function listarOSPorMoto(motoId: string) {
  const mecanico = alias(usuarios, 'mecanico')
  return db
    .select({
      id:            ordensServico.id,
      numero:        ordensServico.numero,
      status:        ordensServico.status,
      tipoOs:        ordensServico.tipoOs,
      descricao:     ordensServico.descricao,
      dataAbertura:  ordensServico.dataAbertura,
      dataConclusao: ordensServico.dataConclusao,
      valorTotal:    ordensServico.valorTotal,
      abertaPorNome: usuarios.nome,
      mecanicoNome:  mecanico.nome,
    })
    .from(ordensServico)
    .innerJoin(usuarios, eq(ordensServico.abertaPor,  usuarios.id))
    .leftJoin(mecanico,  eq(ordensServico.mecanicoId, mecanico.id))
    .where(eq(ordensServico.motoId, motoId))
    .orderBy(desc(ordensServico.dataAbertura))
}
