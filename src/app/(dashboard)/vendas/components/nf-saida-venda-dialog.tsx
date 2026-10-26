'use client'
import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { situacaoCancelamento } from '@/lib/notagateway/status'
import { NfSaidaCard } from '../../estoque/components/nf-saida-card'
import { consultarNfePropriaAction, notasDaVendaAction, type NotaResumo } from '../nfe-propria-actions'

export type NfDaVenda = { vendaId: string; vendaNumero: number; numeroNf: string; descricao: string }

const comNota = (nota: NotaResumo) => (notas: NotaResumo[] | null) => notas && notas.map(n => (n.id === nota.id ? nota : n))

export function NfSaidaVendaDialog({ nf, onFechar }: { nf: NfDaVenda; onFechar: () => void }) {
  const [notas, setNotas] = useState<NotaResumo[] | null>(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let ativo = true
    notasDaVendaAction(nf.vendaId)
      .then(r => {
        if (!ativo) return
        if (!r.ok) {
          setErro(r.error)
          return
        }
        setNotas(r.notas)
        // Nota de antes de a data de autorização ser gravada: a consulta traz a
        // data e o card passa a mostrar o prazo. Se ela falhar, o card oferece "Consultar".
        for (const n of r.notas.filter(n => situacaoCancelamento(n, new Date()) === 'sem_data')) {
          consultarNfePropriaAction(n.id).then(c => { if (ativo && c.ok) setNotas(comNota(c.nota)) }).catch(() => null)
        }
      })
      .catch(() => { if (ativo) setErro('Não deu para carregar a nota: feche e abra de novo.') })
    return () => { ativo = false }
  }, [nf.vendaId])

  // O número da venda só vem de nota de produção (ou do Bling); a homologação tem numeração própria.
  const daNf = notas?.filter(n => n.ambiente === 'Producao' && n.numero === nf.numeroNf) ?? []
  const outras = notas?.filter(n => !daNf.includes(n)) ?? []

  return (
    <Dialog open onOpenChange={aberto => { if (!aberto) onFechar() }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>NF de saída {nf.numeroNf}</DialogTitle>
          <DialogDescription>Venda #{nf.vendaNumero} · {nf.descricao}</DialogDescription>
        </DialogHeader>
        {erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : !notas ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin text-info" /> Carregando a nota…
          </p>
        ) : (
          <div className="space-y-3">
            {daNf.length ? (
              <div className="space-y-2">
                {daNf.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={nota => setNotas(comNota(nota))} />)}
              </div>
            ) : (
              <p className="rounded-md border border-border bg-muted p-3 text-sm text-foreground">
                Esta NF não foi emitida pelo MOVA: veio do Bling ou foi registrada em &quot;Nota já emitida&quot;. O MOVA
                não acompanha o status dela, e o cancelamento é feito onde ela foi emitida (em geral, no Bling).
              </p>
            )}
            {outras.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Outras notas do MOVA desta venda</p>
                {outras.map(n => <NfSaidaCard key={n.id} nota={n} onAtualizada={nota => setNotas(comNota(nota))} />)}
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
