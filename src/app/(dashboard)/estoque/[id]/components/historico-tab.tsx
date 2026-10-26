// src/app/(dashboard)/estoque/[id]/components/historico-tab.tsx
import { buscarHistoricoMoto } from '@/lib/queries/motos'
import { format } from 'date-fns'
import { ptBR } from 'date-fns/locale'
import { FileText } from 'lucide-react'

const tipoLabel: Record<string, string> = {
  entrada:                'Entrada no estoque',
  saida:                  'Saída (Venda)',
  transferencia_enviada:  'Transferência enviada',
  transferencia_recebida: 'Transferência recebida',
  mudanca_status:         'Mudança de status',
}

const statusLabel: Record<string, string> = {
  caixa:       'Caixa',
  montada:     'Montada',
  em_garantia: 'Garantia',
  faturada:    'Caixa',
  disponivel:  'Disponível',
  reservada:   'Reservada',
  vendida:     'Vendida',
}

type Props = {
  motoId: string
  notaFiscalEntrada: string
}

export async function HistoricoTab({ motoId, notaFiscalEntrada }: Props) {
  const historico = await buscarHistoricoMoto(motoId)

  return (
    <div className="space-y-3">
      {/* NF de entrada — sempre exibida como primeiro item fixo */}
      <div className="flex items-start justify-between p-3 border rounded-lg bg-muted">
        <div className="flex items-start gap-2">
          <FileText size={15} className="text-muted-foreground mt-0.5 shrink-0" />
          <div>
            <p className="text-sm font-medium text-foreground">Nota Fiscal de Entrada</p>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">{notaFiscalEntrada}</p>
          </div>
        </div>
      </div>

      {historico.map(h => (
        <div key={h.id} className="flex items-start justify-between p-3 border rounded-lg">
          <div className="space-y-0.5">
            <p className="text-sm font-medium">{tipoLabel[h.tipo] ?? h.tipo}</p>
            {h.statusAnterior && h.statusNovo && (
              <p className="text-xs text-muted-foreground">
                {statusLabel[h.statusAnterior] ?? h.statusAnterior}
                {' → '}
                {statusLabel[h.statusNovo] ?? h.statusNovo}
              </p>
            )}
            {h.observacao && (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{h.observacao}</p>
            )}
            <p className="text-xs text-muted-foreground">por {h.usuarioNome ?? 'Usuário removido'}</p>
          </div>
          <span className="text-xs text-muted-foreground whitespace-nowrap ml-4">
            {h.data ? format(new Date(h.data), "dd/MM/yy HH:mm", { locale: ptBR }) : '—'}
          </span>
        </div>
      ))}

      {historico.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">Nenhum evento registrado.</p>
      )}
    </div>
  )
}
