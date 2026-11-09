import { Badge } from '@/components/ui/badge'
import { formatarNumeroBR } from '@/lib/numero-br'
import { estaBloqueado } from '@/lib/mensalidade/regras'
import type { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { dataPuraBr } from '@/lib/data-venda'
import { BotaoPagar } from './botao-pagar'

type Aberta = Awaited<ReturnType<typeof abertasCobraveis>>[number]
export type LinhaMensalidade = Aberta & { acrescimo: number; total: number }

function Situacao({ vencimento, hoje }: { vencimento: string; hoje: string }) {
  if (estaBloqueado([vencimento], hoje)) return <Badge variant="outline" className="border-destructive text-destructive">Bloqueado</Badge>
  if (vencimento < hoje) return <Badge variant="outline" className="border-destructive text-destructive">Vencida</Badge>
  return <Badge variant="outline" className="border-warning text-warning">Em aberto</Badge>
}

/**
 * Lista da /mensalidade: aviso para quem não paga, erro de leitura, vazio ou uma linha por mensalidade
 * em aberto. Leitura que falhou não vira "nenhuma em aberto": o cliente acharia que está em dia (#773).
 */
export function ListaMensalidades({ paga, linhas, hoje, leituraFalhou }: {
  paga: boolean; linhas: LinhaMensalidade[]; hoje: string; leituraFalhou: boolean
}) {
  if (!paga) return <p className="rounded-lg border bg-card p-4 text-sm">Fale com o responsável da sua empresa para regularizar.</p>
  if (leituraFalhou) {
    return (
      <p role="alert" className="rounded-lg border border-destructive bg-card p-4 text-sm text-destructive">
        Não deu para carregar as mensalidades agora. Atualize a página em alguns minutos.
      </p>
    )
  }
  if (linhas.length === 0) return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Nenhuma mensalidade em aberto.</p>
  return linhas.map(({ m, grupoNome, acrescimo, total }) => (
    <div key={m.id} className="grid grid-cols-2 items-center gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:gap-4 md:px-5">
      <div className="col-span-2 md:col-span-1">
        <div className="font-semibold">{grupoNome}</div>
        <div className="text-sm text-muted-foreground">Competência {dataPuraBr(m.competencia)}</div>
      </div>
      <div className="space-y-1 text-sm">
        <div>{m.vencimento < hoje ? 'Venceu em' : 'Vence em'} {dataPuraBr(m.vencimento)}</div>
        <Situacao vencimento={m.vencimento} hoje={hoje} />
      </div>
      <div className="text-right md:text-left">
        <div className="whitespace-nowrap text-lg font-extrabold">R$ {formatarNumeroBR(total)}</div>
        {acrescimo > 0 && (
          <div className="text-xs text-muted-foreground">inclui R$ {formatarNumeroBR(acrescimo)} de multa e juros</div>
        )}
      </div>
      <div className="col-span-2 md:col-span-1 [&>button]:w-full md:[&>button]:w-auto">
        <BotaoPagar mensalidadeId={m.id} />
      </div>
    </div>
  ))
}
