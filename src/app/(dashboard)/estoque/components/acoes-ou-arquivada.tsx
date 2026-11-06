import { Archive } from 'lucide-react'
import { diaBrt } from '@/lib/data-venda'

type Arquivada = { em: Date; por: string | null; motivo: string | null }

/**
 * Detalhe da moto (#688): a arquivada não aceita gravação nova, então a barra de ações (vender,
 * garantia, transferir, montar...) dá lugar ao aviso. Editar e Corrigir preço ficam no card, fora daqui.
 */
export function AcoesOuArquivada({ arquivada, children }: { arquivada: Arquivada | null; children: React.ReactNode }) {
  if (!arquivada) return children
  return (
    <div role="status" className="flex h-fit gap-3 rounded-lg border border-border border-l-4 border-l-info bg-card p-4 text-sm">
      <Archive className="mt-0.5 size-5 shrink-0 text-info" />
      <div className="space-y-1">
        <p className="font-medium">Moto arquivada em {diaBrt(arquivada.em.toISOString())}{arquivada.por ? ` por ${arquivada.por}` : ''}.</p>
        {arquivada.motivo && <p className="text-muted-foreground">Motivo: {arquivada.motivo}</p>}
        <p className="text-muted-foreground">Para vender, reservar, transferir ou abrir garantia, desarquive pelo RADAR.</p>
      </div>
    </div>
  )
}
