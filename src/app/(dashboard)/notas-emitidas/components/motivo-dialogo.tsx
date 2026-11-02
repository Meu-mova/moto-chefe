'use client'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { diaBrt } from '@/lib/data-venda'
import type { DecisaoInutilizacao } from '@/lib/notagateway/inutilizacao'
import { motivoDaSefaz } from '@/lib/notas-emitidas'
import type { NotaEmitidaComInutilizacao } from '@/lib/queries/notas-emitidas'
import { STATUS } from './selo-status'

/** A situação da inutilização por extenso, como o servidor devolve; nada para a elegível sem histórico. */
function fraseDaInutilizacao(d: DecisaoInutilizacao): string | null {
  if (d.tipo === 'pode') return d.ultimaNegada ? `Negada: ${d.ultimaNegada}. Pode pedir de novo.` : null
  if (d.tipo === 'nenhuma') return null
  return d.erro
}

/** "Recusada em 01/11/2026"; a nota em andamento ainda não tem um "em": fica "desde". */
function quandoDaNota(nota: NotaEmitidaComInutilizacao): string {
  const quando = diaBrt(nota.criadoEm)
  return nota.categoria === 'em_andamento' ? `Em andamento desde ${quando}` : `${STATUS[nota.categoria].texto} em ${quando}`
}

/** "Ver motivo completo" do menu da linha (#597): o motivo da SEFAZ inteiro e a situação da inutilização. */
export function MotivoDialogo({ nota, onFechar }: { nota: NotaEmitidaComInutilizacao | null; onFechar: () => void }) {
  const motivo = nota ? motivoDaSefaz(nota.motivoStatus) : null
  const inutilizacao = nota ? fraseDaInutilizacao(nota.inutilizacao) : null
  return (
    <Dialog open={nota !== null} onOpenChange={aberto => { if (!aberto) onFechar() }}>
      <DialogContent className="sm:max-w-md">
        {nota && (
          <>
            <DialogHeader>
              <DialogTitle>Motivo da nota {nota.numero ?? ''}</DialogTitle>
              <DialogDescription>
                Série {nota.serie ?? '-'}{nota.vendaNumero != null && `, venda #${nota.vendaNumero}`}. {quandoDaNota(nota)}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3 rounded-lg border border-border bg-muted px-3 py-2.5 text-sm">
              <div>
                <p className="text-xs font-semibold text-muted-foreground">Motivo da SEFAZ{motivo?.codigo != null && ` (${motivo.codigo})`}</p>
                <p className="whitespace-pre-line break-words">{motivo?.texto ?? 'Sem motivo registrado.'}</p>
              </div>
              {inutilizacao && (
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">Inutilização</p>
                  <p className={nota.inutilizacao.tipo === 'pode' ? 'text-destructive' : undefined}>{inutilizacao}</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={onFechar}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
