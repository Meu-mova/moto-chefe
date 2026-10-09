import { db } from '@/lib/db'
import { vendas, pedidosVenda, usuarios } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { DanfeButton } from './danfe-button'
import { tipoPessoaDoDocumento } from '@/lib/documento'

const formatCurrency = (v: string | number) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const tipoLabel: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de Crédito',
  cartao_debito: 'Cartão de Débito',
  financiamento: 'Financiamento',
  link_pagamento: 'Link de Pagamento',
  transferencia: 'Transferência Bancária',
}

export async function VendaTab({ motoId, papel }: { motoId: string; papel: string }) {
  const [venda] = await db
    .select({
      id: vendas.id,
      dataVenda: vendas.dataVenda,
      valor: vendas.valor,
      formaPagamento: vendas.formaPagamento,
      pagamentos: vendas.pagamentos,
      notaFiscalSaida: vendas.notaFiscalSaida,
      blingNfeId: vendas.blingNfeId,
      clienteNome: vendas.clienteNome,
      clienteCpf: vendas.clienteCpf,
      clienteCelular: vendas.clienteCelular,
      clienteEmail: vendas.clienteEmail,
      clienteCep: vendas.clienteCep,
      clienteLogradouro: vendas.clienteLogradouro,
      clienteNumero: vendas.clienteNumero,
      clienteComplemento: vendas.clienteComplemento,
      clienteBairro: vendas.clienteBairro,
      clienteCidade: vendas.clienteCidade,
      clienteEstado: vendas.clienteEstado,
      vendedorNome: usuarios.nome,
    })
    .from(vendas)
    .innerJoin(usuarios, eq(vendas.vendedorId, usuarios.id))
    .where(eq(vendas.motoId, motoId))
    .orderBy(desc(vendas.dataVenda))
    .limit(1)

  const [pedido] = await db
    .select({ status: pedidosVenda.status, dataPedido: pedidosVenda.dataPedido })
    .from(pedidosVenda)
    .where(eq(pedidosVenda.motoId, motoId))
    .orderBy(desc(pedidosVenda.dataPedido))
    .limit(1)

  if (!venda && !pedido) {
    return <p className="text-sm text-slate-400">Nenhum pedido ou venda registrado.</p>
  }

  const pagamentos = (venda?.pagamentos as { tipo: string; valor: number; operadora?: string; parcelas?: number }[]) ?? []

  return (
    <div className="space-y-5 text-sm">
      {pedido && (
        <div className="space-y-1">
          <p className="font-semibold text-slate-700">Pedido de Venda</p>
          <div className="grid grid-cols-2 gap-1 text-slate-600">
            <p>Status: <span className="font-medium text-slate-900">{pedido.status}</span></p>
            <p>Data: <span className="text-slate-900">{pedido.dataPedido ? format(new Date(pedido.dataPedido), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</span></p>
          </div>
        </div>
      )}

      {venda && (
        <>
          <div className="h-px bg-slate-100" />

          <div className="space-y-1.5">
            <p className="font-semibold text-slate-700">Venda</p>
            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
              <p>Data: <span className="text-slate-900">{format(new Date(venda.dataVenda), "dd/MM/yyyy HH:mm", { locale: ptBR })}</span></p>
              <p>Vendedor: <span className="text-slate-900">{venda.vendedorNome}</span></p>
              <p className="flex items-center gap-2 flex-wrap">
                NF Saída: <span className="text-slate-900">{venda.notaFiscalSaida ?? '—'}</span>
                {venda.notaFiscalSaida && (
                  <DanfeButton motoId={motoId} />
                )}
                {venda.notaFiscalSaida && (
                  <>
                    <a
                      href={`/vendas/${venda.id}/checklist-entrega`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Checklist de Entrega
                    </a>
                    <a
                      href={`/vendas/${venda.id}/certificado-bateria`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Certificado Bateria
                    </a>
                  </>
                )}
              </p>
              <p>Valor: <span className="text-green-700 font-bold">{formatCurrency(venda.valor)}</span></p>
            </div>
          </div>

          <div className="h-px bg-slate-100" />

          <div className="space-y-1.5">
            <p className="font-semibold text-slate-700">Pagamento</p>
            {pagamentos.length > 0 ? (
              <div className="space-y-1">
                {pagamentos.map((p, i) => (
                  <div key={i} className="flex justify-between items-center bg-slate-50 rounded px-3 py-1.5">
                    <span className="text-slate-600">
                      {tipoLabel[p.tipo] ?? p.tipo}
                      {p.operadora ? ` (${p.operadora})` : ''}
                      {p.parcelas ? ` ${p.parcelas}x` : ''}
                    </span>
                    <span className="font-medium">{formatCurrency(p.valor)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-slate-600">{tipoLabel[venda.formaPagamento] ?? venda.formaPagamento} — {formatCurrency(venda.valor)}</p>
            )}
          </div>

          <div className="h-px bg-slate-100" />

          <div className="space-y-1.5">
            <p className="font-semibold text-slate-700">Cliente</p>
            <div className="grid grid-cols-2 gap-1.5 text-slate-600">
              <p className="col-span-2">Nome: <span className="text-slate-900 font-medium">{venda.clienteNome}</span></p>
              <p>{tipoPessoaDoDocumento(venda.clienteCpf) === 'juridica' ? 'CNPJ' : 'CPF'}: <span className="text-slate-900 font-mono">{venda.clienteCpf}</span></p>
              <p>Celular: <span className="text-slate-900">{venda.clienteCelular ?? '—'}</span></p>
              <p className="col-span-2">E-mail: <span className="text-slate-900">{venda.clienteEmail ?? '—'}</span></p>
              {(venda.clienteLogradouro || venda.clienteCidade) && (
                <p className="col-span-2">
                  Endereço: <span className="text-slate-900">
                    {[venda.clienteLogradouro, venda.clienteNumero, venda.clienteComplemento, venda.clienteBairro].filter(Boolean).join(', ')}
                    {venda.clienteCidade ? ` — ${venda.clienteCidade}/${venda.clienteEstado}` : ''}
                    {venda.clienteCep ? ` (${venda.clienteCep})` : ''}
                  </span>
                </p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
