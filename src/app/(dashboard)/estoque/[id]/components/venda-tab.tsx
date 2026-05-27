import { db } from '@/lib/db'
import { pedidosVenda } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createClient } from '@/lib/supabase/server'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'

export async function VendaTab({ motoId, papel }: { motoId: string; papel: string }) {
  const supabase = await createClient()

  const [vendaResult, pedido] = await Promise.all([
    supabase
      .from('vendas_seguras')
      .select('*')
      .eq('moto_id', motoId)
      .maybeSingle(),
    db
      .select({ status: pedidosVenda.status, dataPedido: pedidosVenda.dataPedido })
      .from(pedidosVenda)
      .where(eq(pedidosVenda.motoId, motoId))
      .limit(1)
      .then(rows => rows[0] ?? null),
  ])

  const vendaData = vendaResult.data

  if (!vendaData && !pedido) {
    return <p className="text-sm text-slate-400">Nenhum pedido ou venda registrado.</p>
  }

  return (
    <div className="space-y-4 text-sm">
      {pedido && (
        <div className="space-y-1">
          <p className="font-medium text-slate-700">Pedido de Venda</p>
          <p>Status: <span className="font-medium">{pedido.status}</span></p>
          <p>Data: {pedido.dataPedido ? format(new Date(pedido.dataPedido), "dd/MM/yyyy HH:mm", { locale: ptBR }) : '—'}</p>
        </div>
      )}
      {vendaData && (
        <div className="space-y-1">
          <p className="font-medium text-slate-700">Venda Efetivada</p>
          <p>Cliente: <span className="font-medium">{vendaData.cliente_nome}</span></p>
          <p>CPF: <span className="font-mono">{vendaData.cliente_cpf}</span></p>
          <p>Valor: <span className="font-medium">R$ {Number(vendaData.valor).toFixed(2)}</span></p>
          <p>Pagamento: {vendaData.forma_pagamento}</p>
          <p>Data: {format(new Date(vendaData.data_venda), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
        </div>
      )}
    </div>
  )
}
