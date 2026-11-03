import { Card } from '@/components/ui/card'
import { fmtBRL } from '@/lib/preco-minimo'
import type { FolhaDoMes } from '@/lib/queries/folha'

// Totais do mês: o destaque (Total geral e o que de fato saiu) e as 5 partes. As partes só ficam
// lado a lado quando os valores cabem inteiros (>= 720 px de conteúdo); antes, 2 por linha.
export function FolhaMesResumo({ totais, ativos }: { totais: FolhaDoMes['totais']; ativos: number }) {
  const partes: { rotulo: string; valor: string; classe?: string }[] = [
    { rotulo: 'Salários', valor: fmtBRL(totais.salarios) },
    { rotulo: 'Comissões', valor: fmtBRL(totais.comissoes) },
    { rotulo: 'Premiações', valor: fmtBRL(totais.premiacoes) },
    { rotulo: 'Ajuda de custo', valor: fmtBRL(totais.ajudaCusto) },
    totais.adiantamentos > 0
      ? { rotulo: 'Adiantamentos', valor: `-${fmtBRL(totais.adiantamentos)}`, classe: 'text-warning' }
      : { rotulo: 'Adiantamentos', valor: fmtBRL(0), classe: 'text-muted-foreground' },
  ]
  return (
    <section aria-label="Totais do mês" className="space-y-2">
      <Card className="flex-row flex-wrap gap-x-8 gap-y-3 px-4 py-3.5">
        <div>
          <p className="text-[13px] text-muted-foreground">Total geral</p>
          <p className="text-[22px] font-bold leading-tight tabular-nums text-success">{fmtBRL(totais.geral)}</p>
        </div>
        {/* Soma o valor real de quem já teve o valor informado e o calculado de quem não teve:
            é este número que o compromisso de folha usa em Contas a Pagar, e por isso ele nunca
            fica menor do que a realidade só porque a coluna ainda está pela metade. */}
        <div>
          <p className="text-[13px] text-muted-foreground">Pago real</p>
          <p className="text-[22px] font-bold leading-tight tabular-nums text-info">{fmtBRL(totais.efetivo)}</p>
          <p className="text-xs text-muted-foreground">{totais.reaisInformados} de {ativos} informados</p>
        </div>
      </Card>
      <div className="grid grid-cols-2 gap-2 @[720px]/folha:grid-cols-5">
        {partes.map(p => (
          <Card key={p.rotulo} className="gap-0 px-3 py-2.5 last:col-span-full @[720px]/folha:last:col-auto">
            <p className="text-xs text-muted-foreground">{p.rotulo}</p>
            <p className={`text-base font-bold tabular-nums ${p.classe ?? ''}`}>{p.valor}</p>
          </Card>
        ))}
      </div>
    </section>
  )
}
