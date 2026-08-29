import { db } from '@/lib/db'
import { pedidosVenda, vendas, motos, lojas, grupos, usuarios, modelos, origensVenda } from '@/lib/db/schema'
import { eq, and, ilike, inArray, desc, sql, gte, lte } from 'drizzle-orm'
import { CORTE_MIGRACAO_PIX } from '@/lib/pix'
import { inicioDoDiaBrt, fimDoDiaBrt } from '@/lib/data-venda'

export type PedidoComDetalhes = Awaited<ReturnType<typeof listarPedidosPorLoja>>[0]
export type VendaComDetalhes  = Awaited<ReturnType<typeof listarVendas>>[0]

export async function listarVendas(filtros?: {
  lojaId?: string[]
  modeloId?: string[]
  vendedorId?: string[]
  chassiBusca?: string
  notaFiscal?: string
  dataInicio?: string
  dataFim?: string
}) {
  return db
    .select({
      id:               vendas.id,
      numero:           vendas.numero,
      motoId:           vendas.motoId,
      lojaId:           vendas.lojaId,
      vendedorId:       vendas.vendedorId,
      dataVenda:        vendas.dataVenda,
      valor:            vendas.valor,
      formaPagamento:   vendas.formaPagamento,
      pagamentos:       vendas.pagamentos,
      clienteNome:      vendas.clienteNome,
      clienteCpf:       vendas.clienteCpf,
      clienteCelular:   vendas.clienteCelular,
      clienteEmail:     vendas.clienteEmail,
      clienteCep:       vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero:    vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro:    vendas.clienteBairro,
      clienteCidade:    vendas.clienteCidade,
      clienteEstado:    vendas.clienteEstado,
      notaFiscalSaida:     vendas.notaFiscalSaida,
      blingNfeId:          vendas.blingNfeId,
      statusConciliacao:   vendas.statusConciliacao,
      conciliadoValor:  sql<number>`COALESCE((
        SELECT SUM(valor_bruto::numeric)
        FROM conciliacoes_cartao
        WHERE venda_id = ${vendas.id}
        AND conciliado = true
      ), 0)`,
      // A partir do corte, concilia só pelo PIX via mcp.ai (Open Finance); vendas
      // anteriores continuam pelo ValidaPix — ver CORTE_MIGRACAO_PIX.
      pixConciliadoValor: sql<number>`CASE WHEN ${vendas.dataVenda} >= ${CORTE_MIGRACAO_PIX.toISOString()}
        THEN COALESCE((SELECT SUM(valor::numeric) FROM pix_recebimentos_mcp WHERE venda_id = ${vendas.id}), 0)
        ELSE COALESCE((SELECT SUM(valor::numeric) FROM pix_recebimentos WHERE venda_id = ${vendas.id}), 0)
      END`,
      // Status de assinatura por tipo, para os ícones da lista. O ORDER BY
      // prioriza o assinado: se houve um cancelado antes e o seguinte foi
      // assinado, o que vale é o assinado.
      contratoStatus: sql<string | null>`(
        SELECT status FROM documentos_assinatura
        WHERE venda_id = ${vendas.id} AND tipo = 'contrato_venda'
        ORDER BY (status = 'assinado') DESC, criado_em DESC LIMIT 1
      )`,
      checklistStatus: sql<string | null>`(
        SELECT status FROM documentos_assinatura
        WHERE venda_id = ${vendas.id} AND tipo = 'checklist_entrega'
        ORDER BY (status = 'assinado') DESC, criado_em DESC LIMIT 1
      )`,
      nfLiberadaEm:     vendas.nfLiberadaEm,
      origemId:         vendas.origemId,
      origemDetalhe:    vendas.origemDetalhe,
      // LEFT JOIN: venda anterior ao deploy da origem não tem linha em origens_venda,
      // e um INNER aqui a apagaria da listagem.
      origemNome:       origensVenda.nome,
      chassi:           motos.chassi,
      cor:              motos.cor,
      modeloId:         motos.modeloId,
      modelo:           modelos.modelo,
      marca:            modelos.marca,
      lojaNome:         lojas.nome,
      vendedorNome:     usuarios.nome,
    })
    .from(vendas)
    .innerJoin(motos,    eq(vendas.motoId,     motos.id))
    .innerJoin(modelos,  eq(motos.modeloId,    modelos.id))
    .innerJoin(lojas,    eq(vendas.lojaId,     lojas.id))
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .leftJoin(origensVenda, eq(vendas.origemId, origensVenda.id))
    .where(
      and(
        filtros?.lojaId !== undefined ? inArray(vendas.lojaId,      filtros.lojaId)                         : undefined,
        filtros?.modeloId?.length    ? inArray(motos.modeloId,      filtros.modeloId)                       : undefined,
        filtros?.vendedorId?.length  ? inArray(vendas.vendedorId,   filtros.vendedorId)                     : undefined,
        filtros?.chassiBusca?.trim() ? ilike(motos.chassi,          `%${filtros.chassiBusca.trim()}%`)      : undefined,
        filtros?.notaFiscal?.trim()  ? ilike(vendas.notaFiscalSaida, `%${filtros.notaFiscal.trim()}%`)     : undefined,
        filtros?.dataInicio           ? gte(vendas.dataVenda, inicioDoDiaBrt(filtros.dataInicio))           : undefined,
        filtros?.dataFim              ? lte(vendas.dataVenda, fimDoDiaBrt(filtros.dataFim))                 : undefined,
      )
    )
    .orderBy(desc(vendas.dataVenda))
}

export async function listarPedidosPorLoja(lojaId: string) {
  return db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.lojaId, lojaId))
    .orderBy(pedidosVenda.dataPedido)
}

export async function listarTodosPedidos(lojaIds?: string[]) {
  return db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(lojaIds !== undefined ? inArray(pedidosVenda.lojaId, lojaIds) : undefined)
    .orderBy(pedidosVenda.dataPedido)
}

export async function buscarPedido(id: string) {
  const [pedido] = await db
    .select({
      id: pedidosVenda.id,
      numero: pedidosVenda.numero,
      status: pedidosVenda.status,
      dataPedido: pedidosVenda.dataPedido,
      observacao: pedidosVenda.observacao,
      motoId: pedidosVenda.motoId,
      lojaId: pedidosVenda.lojaId,
      chassi: motos.chassi,
      cor: motos.cor,
      motoStatus: motos.status,
      motoLojaId: motos.lojaId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      lojaNome: lojas.nome,
      vendedorId: pedidosVenda.vendedorId,
      vendedorNome: usuarios.nome,
    })
    .from(pedidosVenda)
    .innerJoin(motos, eq(pedidosVenda.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(pedidosVenda.lojaId, lojas.id))
    .innerJoin(usuarios, eq(pedidosVenda.vendedorId, usuarios.id))
    .where(eq(pedidosVenda.id, id))
    .limit(1)
  return pedido ?? null
}

export type VendaComDocumento = Awaited<ReturnType<typeof buscarVenda>>

export async function buscarVenda(id: string) {
  const [venda] = await db
    .select({
      id: vendas.id,
      dataVenda: vendas.dataVenda,
      notaFiscalSaida: vendas.notaFiscalSaida,
      motoId: vendas.motoId,
      lojaId: vendas.lojaId,
      lojaNome: lojas.nome,
      lojaCidade: lojas.cidade,
      grupoNome: grupos.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      chassi: motos.chassi,
      cor: motos.cor,
      motor: sql<string>`COALESCE(${motos.motor}, ${modelos.motor})`.as('motor'),
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
    })
    .from(vendas)
    .innerJoin(motos, eq(vendas.motoId, motos.id))
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(vendas.lojaId, lojas.id))
    .innerJoin(grupos, eq(lojas.grupoId, grupos.id))
    .where(eq(vendas.id, id))
    .limit(1)
  return venda ?? null
}
