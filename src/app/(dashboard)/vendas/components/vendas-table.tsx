'use client'
import { useSearchParams } from 'next/navigation'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GarantiaButton } from '../../estoque/components/garantia-button'
import { NfSaidaButton } from '../../estoque/components/nf-saida-button'
import { DanfeButton } from '../../estoque/[id]/components/danfe-button'
import { CancelarVendaButton } from './cancelar-venda-button'
import { DetalhesVendaDialog } from './detalhes-venda-dialog'
import { EditarVendaDialog } from './editar-venda-dialog'
import type { VendaComDetalhes } from '@/lib/queries/vendas'

const podeGarantia = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const podeCancelar = new Set(['admin_geral', 'admin_socio'])
const podeEditar   = new Set(['admin_geral', 'admin_socio', 'aux_adm'])
const ADMINS       = new Set(['admin_geral', 'admin_socio'])

const TIPOS_CARTAO = new Set(['cartao_credito', 'cartao_debito', 'link_pagamento'])

type StatusConc = 'na' | 'pendente' | 'parcial' | 'conciliada'

function calcStatus(
  pagamentos: unknown,
  conciliadoValor: number,
  pixConciliadoValor: number,
  valorVenda: string,
  statusConciliacao: string,
): StatusConc {
  const pgtos = (pagamentos ?? []) as { tipo: string; valor: number }[]
  const totalCartao = pgtos
    .filter(p => TIPOS_CARTAO.has(p.tipo))
    .reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalPix = pgtos
    .filter(p => p.tipo === 'pix')
    .reduce((a, p) => a + (Number(p.valor) || 0), 0)
  const totalLancado = pgtos.reduce((a, p) => a + (Number(p.valor) || 0), 0)

  // Sem pagamentos lançados: usa o status salvo no banco
  if (totalLancado < 0.01) {
    if (statusConciliacao === 'pendente')   return 'pendente'
    if (statusConciliacao === 'parcial')    return 'parcial'
    if (statusConciliacao === 'aprovado')   return 'conciliada'
    return 'na'
  }

  // pagamentos lançados não cobrem o valor total da venda → parcial
  if (totalLancado < Number(valorVenda) - 0.05) return 'parcial'

  const totalNecessa = totalCartao + totalPix
  if (totalNecessa < 0.01) return 'conciliada' // só dinheiro/financiamento

  const conciliado = (Number(conciliadoValor) || 0) + (Number(pixConciliadoValor) || 0)
  if (conciliado < 0.01) return 'pendente'
  if (conciliado >= totalNecessa - 0.05) return 'conciliada'
  return 'parcial'
}

const BADGE: Record<StatusConc, { label: string; cls: string } | null> = {
  na:          null,
  pendente:    { label: 'Pendente',   cls: 'bg-red-50 text-red-700 border-red-200' },
  parcial:     { label: 'Parcial',    cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  conciliada:  { label: '✓ OK',       cls: 'bg-green-50 text-green-700 border-green-200' },
}

function ConcBadge({ status }: { status: StatusConc }) {
  const b = BADGE[status]
  if (!b) return <span className="text-slate-300 text-xs">—</span>
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full border text-xs font-medium whitespace-nowrap ${b.cls}`}>
      {b.label}
    </span>
  )
}

function formatarValor(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

type Props = {
  vendas: VendaComDetalhes[]
  papel: string
  lojaIdUsuario?: string | null
  vendedores: { id: string; nome: string }[]
}

export function VendasTable({ vendas, papel, lojaIdUsuario, vendedores }: Props) {
  const podeFazerGarantia  = podeGarantia.has(papel)
  const isAdmin            = ADMINS.has(papel)
  const podeEditarVenda    = podeEditar.has(papel)
  const podeConciliacao    = isAdmin || papel === 'aux_adm'
  const colSpan = podeFazerGarantia ? (podeConciliacao ? 11 : 10) : (podeConciliacao ? 10 : 9)

  const searchParams = useSearchParams()
  const concFiltro = (searchParams.get('conc') ?? '').split(',').filter(Boolean)

  const vendasComStatus = vendas.map(v => ({
    venda: v,
    status: calcStatus(v.pagamentos, v.conciliadoValor as number, v.pixConciliadoValor as number, v.valor, v.statusConciliacao),
  }))
  const vendasFiltradas = concFiltro.length > 0
    ? vendasComStatus.filter(({ status }) => concFiltro.includes(status))
    : vendasComStatus

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Nº</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead className="text-xs text-slate-500 w-36">Chassi</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>NF Saída</TableHead>
          <TableHead>Valor</TableHead>
          {podeConciliacao && <TableHead>Conciliação</TableHead>}
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendasFiltradas.map(({ venda: v, status }) => {
          return (
            <TableRow key={v.id}>
              <TableCell className="font-mono font-medium text-slate-700">#{v.numero}</TableCell>
              <TableCell className="text-slate-500 text-sm whitespace-nowrap">
                {formatarData(v.dataVenda)}
              </TableCell>
              <TableCell className="font-medium">{v.modelo}</TableCell>
              <TableCell className="font-mono text-xs text-slate-500 max-w-36">
                <span className="block truncate" title={v.chassi}>{v.chassi}</span>
              </TableCell>
              <TableCell>{v.cor}</TableCell>
              <TableCell>{v.lojaNome}</TableCell>
              <TableCell>{v.vendedorNome}</TableCell>
              <TableCell className="text-slate-500">
                <span className="flex items-center gap-1.5">
                  {v.notaFiscalSaida ?? '—'}
                  {v.notaFiscalSaida && v.blingNfeId && (
                    <DanfeButton motoId={v.motoId} />
                  )}
                </span>
              </TableCell>
              <TableCell className="font-medium tabular-nums">{formatarValor(v.valor)}</TableCell>
              {podeConciliacao && (
                <TableCell>
                  <ConcBadge status={status} />
                </TableCell>
              )}
              <TableCell className="text-right">
                <div className="flex items-center gap-1 justify-end">
                  <DetalhesVendaDialog venda={v} isAdmin={podeConciliacao} />
                  {podeEditarVenda && (!lojaIdUsuario || v.lojaId === lojaIdUsuario) && <EditarVendaDialog venda={v} papel={papel} vendedores={vendedores} />}
                  {!v.notaFiscalSaida && podeFazerGarantia && (
                    <NfSaidaButton
                      motoId={v.motoId}
                      descricao={`${v.modelo} — ${v.chassi}`}
                    />
                  )}
                  {podeFazerGarantia && (
                    <GarantiaButton
                      motoId={v.motoId}
                      descricao={`${v.modelo} — ${v.cor} (${v.lojaNome})`}
                    />
                  )}
                  {podeCancelar.has(papel) && (
                    <CancelarVendaButton
                      vendaId={v.id}
                      descricao={`${v.modelo} — ${v.chassi} — ${v.clienteNome}`}
                    />
                  )}
                </div>
              </TableCell>
            </TableRow>
          )
        })}
        {vendasFiltradas.length === 0 && (
          <TableRow>
            <TableCell colSpan={colSpan} className="text-center text-slate-400 py-8">
              Nenhuma venda encontrada.
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  )
}
