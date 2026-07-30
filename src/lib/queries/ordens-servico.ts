import { db } from '@/lib/db'
import { ordensServico, osItens, motos, lojas, usuarios, modelos, clientes, servicosCatalogo } from '@/lib/db/schema'
import { eq, desc, and, or, ilike, inArray, sql, gte, lte } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'

export type OSComDetalhes  = Awaited<ReturnType<typeof listarTodasOS>>[0]
export type OSDetalhe      = Awaited<ReturnType<typeof buscarOS>>
export type OSItem         = Awaited<ReturnType<typeof listarItensOS>>[0]

function buildSelect(mecanico: ReturnType<typeof alias<typeof usuarios, 'mecanico'>>) {
  return {
    id:                  ordensServico.id,
    numero:              ordensServico.numero,
    status:              ordensServico.status,
    descricao:           ordensServico.descricao,
    diagnostico:         ordensServico.diagnostico,
    observacoesFinais:   ordensServico.observacoesFinais,
    valorTotal:          ordensServico.valorTotal,
    valorServicos:       ordensServico.valorServicos,
    valorPecas:          ordensServico.valorPecas,
    servicosResumo:      sql<string | null>`(
      SELECT string_agg(DISTINCT COALESCE(${servicosCatalogo.nome}, ${osItens.descricao}), ', ')
      FROM ${osItens}
      LEFT JOIN ${servicosCatalogo} ON ${servicosCatalogo.id} = ${osItens.servicoId}
      WHERE ${osItens.osId} = ${ordensServico.id} AND ${osItens.tipo} = 'servico'
    )`,
    formaPagamento:      ordensServico.formaPagamento,
    pagamentos:          ordensServico.pagamentos,
    conciliadoValor:     sql<number>`COALESCE((
      SELECT SUM(valor_bruto::numeric)
      FROM conciliacoes_cartao
      WHERE os_id = ${ordensServico.id}
      AND conciliado = true
    ), 0)`,
    pixConciliadoValor:  sql<number>`COALESCE((
      SELECT SUM(valor::numeric)
      FROM pix_recebimentos_mcp
      WHERE os_id = ${ordensServico.id}
    ), 0)`,
    dataPrevisao:        ordensServico.dataPrevisao,
    marcaExterna:        ordensServico.marcaExterna,
    modeloExterno:       ordensServico.modeloExterno,
    placa:               ordensServico.placa,
    km:                  ordensServico.km,
    clienteNomeExterno:  ordensServico.clienteNomeExterno,
    clienteFoneExterno:  ordensServico.clienteFoneExterno,
    dataAbertura:        ordensServico.dataAbertura,
    dataConclusao:       ordensServico.dataConclusao,
    oficinaEm:           ordensServico.oficinaEm,
    emAndamentoEm:       ordensServico.emAndamentoEm,
    finalizadaEm:        ordensServico.finalizadaEm,
    pendentePagamentoEm: ordensServico.pendentePagamentoEm,
    motoId:              ordensServico.motoId,
    lojaId:              ordensServico.lojaId,
    mecanicoId:          ordensServico.mecanicoId,
    clienteId:           ordensServico.clienteId,
    chassiOs:            ordensServico.chassiOs,
    motivoCancelamento:  ordensServico.motivoCancelamento,
    canceladaEm:         ordensServico.canceladaEm,
    canceladaPorNome:    sql<string | null>`(
      SELECT u_canc.nome FROM usuarios u_canc WHERE u_canc.id = ${ordensServico.canceladaPor}
    )`,
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
  busca?: string
  lojaId?: string[]
  dataInicio?: string
  dataFim?: string
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
      filtros?.lojaId !== undefined ? inArray(ordensServico.lojaId, filtros.lojaId) : undefined,
      filtros?.dataInicio       ? gte(ordensServico.dataAbertura, new Date(filtros.dataInicio)) : undefined,
      filtros?.dataFim          ? lte(ordensServico.dataAbertura, new Date(filtros.dataFim + 'T23:59:59.999Z')) : undefined,
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
