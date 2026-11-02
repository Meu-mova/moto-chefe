import { Badge } from '@/components/ui/badge'
import type { DecisaoInutilizacao } from '@/lib/notagateway/inutilizacao'

const SELO: Partial<Record<DecisaoInutilizacao['tipo'], { texto: string; cor: string }>> = {
  pendente:            { texto: 'Inutilização pendente', cor: 'bg-warning/10 text-warning' },
  autorizada:          { texto: 'Número inutilizado', cor: 'bg-muted text-muted-foreground' },
  numero_usado:        { texto: 'Número já usado', cor: 'bg-muted text-muted-foreground' },
  ambiente_divergente: { texto: 'Grupo em outro ambiente', cor: 'bg-muted text-muted-foreground' },
  sem_configuracao:    { texto: 'Nota Gateway não configurada', cor: 'bg-muted text-muted-foreground' },
}

/**
 * Situação da inutilização como selo de uma linha (C5, C8): o mesmo componente na tabela e no
 * cartão. A frase inteira está em "Ver motivo completo", no menu da linha; o title só ajuda.
 */
export function SituacaoInutilizacao({ decisao }: { decisao: DecisaoInutilizacao }) {
  if (decisao.tipo === 'pode') {
    if (!decisao.ultimaNegada) return null
    return <Badge className="bg-destructive/10 text-destructive" title={`Negada: ${decisao.ultimaNegada}`}>Inutilização negada</Badge>
  }
  const selo = SELO[decisao.tipo]
  if (!selo) return null
  return <Badge className={selo.cor} title={decisao.erro}>{selo.texto}</Badge>
}
