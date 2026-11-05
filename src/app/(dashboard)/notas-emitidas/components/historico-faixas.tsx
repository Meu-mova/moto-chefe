'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { diaEHoraBrt } from '@/lib/data-venda'
import { FAIXAS_NO_HISTORICO, type SituacaoInutilizacao } from '@/lib/notagateway/inutilizacao'
import { Secao } from '../../dashboard/components/painel-secoes'
import { consultarFaixaAction } from '../actions'

export type FaixaPedida = {
  id: string; serie: string; numeroInicial: number; numeroFinal: number; justificativa: string
  situacao: SituacaoInutilizacao; motivoStatus: string | null; protocolo: string | null; criadoEm: Date
}

const SELO: Record<SituacaoInutilizacao, { texto: string; cor: string }> = {
  pendente: { texto: 'Pendente', cor: 'bg-warning/10 text-warning' },
  autorizada: { texto: 'Autorizada', cor: 'bg-muted text-muted-foreground' },
  negada: { texto: 'Negada', cor: 'bg-destructive/10 text-destructive' },
}

/** Faixas pedidas neste grupo e ambiente; a pendente se consulta aqui, sem esperar outra ação (#655). */
export function HistoricoFaixas({ faixas }: { faixas: FaixaPedida[] }) {
  const router = useRouter()
  const [consultando, setConsultando] = useState<string | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  if (faixas.length === 0) return null

  async function consultar(id: string) {
    setConsultando(id)
    setErro(null)
    try {
      const r = await consultarFaixaAction(id)
      if (r.ok) router.refresh()
      else setErro(r.erro)
    } catch {
      setErro('Não deu para consultar agora. Tente de novo mais tarde.')
    } finally {
      setConsultando(null)
    }
  }

  return (
    <Secao titulo="Faixas inutilizadas">
      {faixas.length >= FAIXAS_NO_HISTORICO && <p className="text-sm text-muted-foreground">Mostra as {FAIXAS_NO_HISTORICO} mais recentes; as mais antigas não aparecem aqui.</p>}
      {erro && <p role="alert" className="text-sm text-destructive">{erro}</p>}
      <ul className="divide-y">
        {faixas.map(f => (
          <li key={f.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-0.5 text-sm">
              <p className="flex flex-wrap items-center gap-2 font-medium">
                Série {f.serie}, números {f.numeroInicial} a {f.numeroFinal}
                <Badge className={SELO[f.situacao].cor}>{SELO[f.situacao].texto}</Badge>
              </p>
              <p className="break-words text-muted-foreground">{f.justificativa} · {diaEHoraBrt(f.criadoEm.toISOString())}</p>
              {f.motivoStatus && <p className="break-words text-muted-foreground">{f.motivoStatus}</p>}
              {f.protocolo && <p className="text-muted-foreground">Protocolo {f.protocolo}</p>}
            </div>
            {f.situacao === 'pendente' && (
              <Button variant="outline" className="min-h-11 sm:min-h-8" disabled={consultando !== null} onClick={() => consultar(f.id)}>
                {consultando === f.id ? <Loader2 className="animate-spin" /> : <RefreshCw aria-hidden="true" />}
                Consultar resultado
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Secao>
  )
}
