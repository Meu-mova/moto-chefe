// src/lib/queries/motos.ts
import { db } from '@/lib/db'
import { motos, modelos, lojas, usuarios, historicoEstoque, transferencias, reservas, vendas, aprovacoesVenda, ordensServico, clientes } from '@/lib/db/schema'
import { eq, and, or, isNull, ilike, sql, inArray, desc } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import type { PagamentoEntrada } from '@/lib/pagamentos-entrada'
import { motoNaoVendida } from './showroom'

export type MotoComDetalhes = Awaited<ReturnType<typeof listarMotos>>[0]

type OrdenacaoCampo = 'modelo' | 'cor' | 'loja' | 'status' | 'disponibilidade'

export async function listarMotos(filtros?: {
  status?: string[]
  disponibilidade?: string[]
  excluirVendidas?: boolean   // true = modo padrão: mostra null + disponivel + reservada, oculta vendida
  chassiBusca?: string
  lojaId?: string[]
  modeloId?: string[]
  cor?: string[]
  apenasTransferencia?: boolean   // só motos com transferência de loja pendente
  ord?: OrdenacaoCampo
  dir?: 'asc' | 'desc'
}) {
  const { asc, desc } = await import('drizzle-orm')
  const campoMap = {
    modelo:         modelos.modelo,
    cor:            motos.cor,
    loja:           lojas.nome,
    status:         motos.status,
    disponibilidade: motos.disponibilidade,
  } as const

  const campo = campoMap[filtros?.ord ?? 'modelo']
  const ordenar = filtros?.dir === 'desc' ? desc(campo) : asc(campo)

  return db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      disponibilidade: motos.disponibilidade,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      modeloId: motos.modeloId,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      transferenciaPendente: sql<boolean>`EXISTS (
        SELECT 1 FROM transferencias
        WHERE transferencias.moto_id = ${motos.id}
        AND transferencias.status = 'pendente'
      )`,
      // Loja destino da transferência pendente, para o tooltip do ícone na tabela.
      transferenciaDestino: sql<string | null>`(
        SELECT ld.nome FROM transferencias t
        JOIN lojas ld ON ld.id = t.loja_destino_id
        WHERE t.moto_id = ${motos.id} AND t.status = 'pendente'
        ORDER BY t.data_solicitacao DESC LIMIT 1
      )`,
      reservaId: sql<string | null>`(
        SELECT r.id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorEntrada: sql<string | null>`(
        SELECT r.valor_reserva FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorTotal: sql<string | null>`(
        SELECT r.valor_total_venda FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteNome: sql<string | null>`(
        SELECT r.cliente_nome FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCpf: sql<string | null>`(
        SELECT r.cliente_cpf FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCelular: sql<string | null>`(
        SELECT r.cliente_celular FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteEmail: sql<string | null>`(
        SELECT r.cliente_email FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCep: sql<string | null>`(
        SELECT r.cliente_cep FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteLogradouro: sql<string | null>`(
        SELECT r.cliente_logradouro FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteNumero: sql<string | null>`(
        SELECT r.cliente_numero FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteComplemento: sql<string | null>`(
        SELECT r.cliente_complemento FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteBairro: sql<string | null>`(
        SELECT r.cliente_bairro FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCidade: sql<string | null>`(
        SELECT r.cliente_cidade FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteEstado: sql<string | null>`(
        SELECT r.cliente_estado FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaVendedorId: sql<string | null>`(
        SELECT r.vendedor_id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaMeioPagamento: sql<string | null>`(
        SELECT r.meio_pagamento FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaCartaoOperadora: sql<string | null>`(
        SELECT r.cartao_operadora FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaCartaoParcelas: sql<string | null>`(
        SELECT r.cartao_parcelas::text FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      // Formas de pagamento da entrada (migração 0088). Nulo em reserva antiga —
      // normalizarPagamentos resolve com as colunas acima.
      reservaPagamentos: sql<PagamentoEntrada[] | null>`(
        SELECT r.pagamentos FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      blingNfeId: sql<string | null>`(
        SELECT v.bling_nfe_id FROM vendas v
        WHERE v.moto_id = ${motos.id} AND v.nota_fiscal_saida IS NULL
        ORDER BY v.data_venda DESC LIMIT 1
      )`,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .where(
      and(
        // Motos cadastradas só para garantia de veículo externo nunca são estoque.
        eq(motos.somenteGarantia, false),
        filtros?.status?.length          ? inArray(motos.status, filtros.status as any[])                   : undefined,
        filtros?.excluirVendidas ? motoNaoVendida() : undefined,
        filtros?.disponibilidade?.length
          ? inArray(motos.disponibilidade, filtros.disponibilidade as any[])
          : undefined,
        filtros?.chassiBusca?.trim()
          ? ilike(motos.chassi, `%${filtros.chassiBusca.trim()}%`)
          : undefined,
        filtros?.lojaId !== undefined    ? inArray(motos.lojaId, filtros.lojaId)                            : undefined,
        filtros?.modeloId?.length        ? inArray(motos.modeloId, filtros.modeloId)                        : undefined,
        filtros?.cor?.length             ? inArray(motos.cor, filtros.cor)                                  : undefined,
        filtros?.apenasTransferencia
          ? sql`EXISTS (SELECT 1 FROM transferencias WHERE transferencias.moto_id = ${motos.id} AND transferencias.status = 'pendente')`
          : undefined,
      )
    )
    .orderBy(ordenar)
}

export async function contarPorStatus() {
  return db
    .select({
      status: motos.status,
      total: sql<number>`count(*)::int`,
    })
    .from(motos)
    .groupBy(motos.status)
}

export async function buscarMoto(id: string) {
  const mecanico = alias(usuarios, 'mecanico')

  const [moto] = await db
    .select({
      id: motos.id,
      chassi: motos.chassi,
      cor: motos.cor,
      status: motos.status,
      disponibilidade: motos.disponibilidade,
      notaFiscalEntrada: motos.notaFiscalEntrada,
      dataMontagem: motos.dataMontagem,
      modeloId: motos.modeloId,
      lojaId: motos.lojaId,
      lojaNome: lojas.nome,
      marca: modelos.marca,
      modelo: modelos.modelo,
      categoria: modelos.categoria,
      potenciaW: modelos.potenciaW,
      motor: sql<string>`COALESCE(${motos.motor}, ${modelos.motor})`.as('motor'),
      precoCompra: motos.precoCompra,
      mecanicoNome: mecanico.nome,
      transferenciaPendente: sql<boolean>`EXISTS (
        SELECT 1 FROM transferencias
        WHERE transferencias.moto_id = ${motos.id}
        AND transferencias.status = 'pendente'
      )`,
      // Loja destino da transferência pendente, para o tooltip do ícone na tabela.
      transferenciaDestino: sql<string | null>`(
        SELECT ld.nome FROM transferencias t
        JOIN lojas ld ON ld.id = t.loja_destino_id
        WHERE t.moto_id = ${motos.id} AND t.status = 'pendente'
        ORDER BY t.data_solicitacao DESC LIMIT 1
      )`,
      reservaId: sql<string | null>`(
        SELECT r.id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorEntrada: sql<string | null>`(
        SELECT r.valor_reserva FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaValorTotal: sql<string | null>`(
        SELECT r.valor_total_venda FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteNome: sql<string | null>`(
        SELECT r.cliente_nome FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCpf: sql<string | null>`(
        SELECT r.cliente_cpf FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCelular: sql<string | null>`(
        SELECT r.cliente_celular FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteEmail: sql<string | null>`(
        SELECT r.cliente_email FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCep: sql<string | null>`(
        SELECT r.cliente_cep FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteLogradouro: sql<string | null>`(
        SELECT r.cliente_logradouro FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteNumero: sql<string | null>`(
        SELECT r.cliente_numero FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteComplemento: sql<string | null>`(
        SELECT r.cliente_complemento FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteBairro: sql<string | null>`(
        SELECT r.cliente_bairro FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteCidade: sql<string | null>`(
        SELECT r.cliente_cidade FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaClienteEstado: sql<string | null>`(
        SELECT r.cliente_estado FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaVendedorId: sql<string | null>`(
        SELECT r.vendedor_id FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaMeioPagamento: sql<string | null>`(
        SELECT r.meio_pagamento FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaCartaoOperadora: sql<string | null>`(
        SELECT r.cartao_operadora FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      reservaCartaoParcelas: sql<string | null>`(
        SELECT r.cartao_parcelas::text FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      // Formas de pagamento da entrada (migração 0088). Nulo em reserva antiga —
      // normalizarPagamentos resolve com as colunas acima.
      reservaPagamentos: sql<PagamentoEntrada[] | null>`(
        SELECT r.pagamentos FROM reservas r
        WHERE r.moto_id = ${motos.id} AND r.status = 'ativa'
        ORDER BY r.criado_em DESC LIMIT 1
      )`,
      aprovacaoPendenteId: sql<string | null>`(
        SELECT a.id FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteValor: sql<string | null>`(
        SELECT a.valor::text FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteMotivo: sql<string | null>`(
        SELECT a.motivo FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteTipo: sql<string | null>`(
        SELECT a.tipo FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteVendedorId: sql<string | null>`(
        SELECT a.vendedor_id FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
      aprovacaoPendenteDataSolicitacao: sql<string | null>`(
        SELECT a.data_solicitacao::text FROM aprovacoes_venda a
        WHERE a.moto_id = ${motos.id} AND a.status = 'pendente'
        ORDER BY a.data_solicitacao DESC LIMIT 1
      )`,
    })
    .from(motos)
    .innerJoin(modelos, eq(motos.modeloId, modelos.id))
    .innerJoin(lojas, eq(motos.lojaId, lojas.id))
    .leftJoin(mecanico, eq(motos.responsavelMontagemId, mecanico.id))
    .where(eq(motos.id, id))
    .limit(1)

  return moto ?? null
}

export type AprovacaoPendente = Awaited<ReturnType<typeof listarAprovacoesPendentes>>[0]

export async function listarAprovacoesPendentes(lojaIds: string[]) {
  if (lojaIds.length === 0) return []
  const clientesOS = alias(clientes, 'clientes_os')
  return db
    .select({
      id:              aprovacoesVenda.id,
      origem:          aprovacoesVenda.origem,
      motoId:          aprovacoesVenda.motoId,
      osId:            aprovacoesVenda.osId,
      lojaId:          aprovacoesVenda.lojaId,
      valor:           aprovacoesVenda.valor,
      motivo:          aprovacoesVenda.motivo,
      tipo:            aprovacoesVenda.tipo,
      dadosVenda:      aprovacoesVenda.dadosVenda,
      dataSolicitacao: aprovacoesVenda.dataSolicitacao,
      vendedorNome:    usuarios.nome,
      lojaNome:        lojas.nome,
      // moto (null quando origem != 'moto')
      chassi:          motos.chassi,
      cor:             motos.cor,
      marca:           modelos.marca,
      modelo:          modelos.modelo,
      // os (null quando origem != 'os')
      osNumero:        ordensServico.numero,
      osClienteNome:   sql<string | null>`COALESCE(${clientesOS.nome}, ${ordensServico.clienteNomeExterno})`,
    })
    .from(aprovacoesVenda)
    .leftJoin(motos,       eq(aprovacoesVenda.motoId, motos.id))
    .leftJoin(modelos,     eq(motos.modeloId, modelos.id))
    .leftJoin(ordensServico, eq(aprovacoesVenda.osId, ordensServico.id))
    .leftJoin(clientesOS,  eq(ordensServico.clienteId, clientesOS.id))
    .innerJoin(lojas,      eq(aprovacoesVenda.lojaId, lojas.id))
    .innerJoin(usuarios,   eq(aprovacoesVenda.vendedorId, usuarios.id))
    .where(and(eq(aprovacoesVenda.status, 'pendente'), inArray(aprovacoesVenda.lojaId, lojaIds)))
    .orderBy(desc(aprovacoesVenda.dataSolicitacao))
}

export async function buscarHistoricoMoto(motoId: string) {
  return db
    .select({
      id: historicoEstoque.id,
      tipo: historicoEstoque.tipo,
      statusAnterior: historicoEstoque.statusAnterior,
      statusNovo: historicoEstoque.statusNovo,
      data: historicoEstoque.data,
      observacao: historicoEstoque.observacao,
      usuarioNome: usuarios.nome,
    })
    .from(historicoEstoque)
    .leftJoin(usuarios, eq(historicoEstoque.usuarioId, usuarios.id))
    .where(eq(historicoEstoque.motoId, motoId))
    .orderBy(sql`${historicoEstoque.data} DESC`)
}
