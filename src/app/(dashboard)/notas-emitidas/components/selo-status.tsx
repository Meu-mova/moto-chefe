import { Badge } from '@/components/ui/badge'
import type { CategoriaNota } from '@/lib/notas-emitidas'

export const STATUS: Record<CategoriaNota, { texto: string; cor: string }> = {
  autorizada:   { texto: 'Autorizada', cor: 'bg-primary-soft text-primary-text' },
  cancelada:    { texto: 'Cancelada', cor: 'bg-muted text-muted-foreground' },
  recusada:     { texto: 'Recusada', cor: 'bg-destructive/10 text-destructive' },
  em_andamento: { texto: 'Em andamento', cor: 'bg-warning/10 text-warning' },
  descartada:   { texto: 'Descartada', cor: 'bg-muted text-muted-foreground' },
}

/** Selo do status da nota, o mesmo na tabela e no cartão; o status cru da API fica no title. */
export function SeloStatus({ nota }: { nota: { categoria: CategoriaNota; status: string } }) {
  return <Badge className={STATUS[nota.categoria].cor} title={nota.status}>{STATUS[nota.categoria].texto}</Badge>
}
