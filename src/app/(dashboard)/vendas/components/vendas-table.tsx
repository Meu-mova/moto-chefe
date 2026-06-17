import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { GarantiaButton } from '../../estoque/components/garantia-button'
import { NfSaidaButton } from '../../estoque/components/nf-saida-button'
import type { VendaComDetalhes } from '@/lib/queries/vendas'

const podeGarantia = new Set(['admin_geral', 'admin_socio', 'aux_adm'])

function formatarValor(v: string) {
  return Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function formatarData(d: Date) {
  return new Date(d).toLocaleDateString('pt-BR')
}

type Props = {
  vendas: VendaComDetalhes[]
  papel: string
}

export function VendasTable({ vendas, papel }: Props) {
  const podeFazerGarantia = podeGarantia.has(papel)
  const colSpan = podeFazerGarantia ? 10 : 9

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Data</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead className="text-xs text-slate-500">Chassi</TableHead>
          <TableHead>Cor</TableHead>
          <TableHead>Loja</TableHead>
          <TableHead>Vendedor</TableHead>
          <TableHead>NF Saída</TableHead>
          <TableHead>Valor</TableHead>
          <TableHead className="text-right">Ações</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {vendas.map(v => (
          <TableRow key={v.id}>
            <TableCell className="text-slate-500 text-sm whitespace-nowrap">
              {formatarData(v.dataVenda)}
            </TableCell>
            <TableCell className="font-medium">{v.modelo}</TableCell>
            <TableCell className="font-mono text-xs text-slate-500">{v.chassi}</TableCell>
            <TableCell>{v.cor}</TableCell>
            <TableCell>{v.lojaNome}</TableCell>
            <TableCell>{v.vendedorNome}</TableCell>
            <TableCell className="text-slate-500">{v.notaFiscalSaida ?? '—'}</TableCell>
            <TableCell className="font-medium tabular-nums">{formatarValor(v.valor)}</TableCell>
            <TableCell className="text-right">
              <div className="flex items-center gap-1 justify-end">
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
              </div>
            </TableCell>
          </TableRow>
        ))}
        {vendas.length === 0 && (
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
