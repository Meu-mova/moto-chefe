import { Badge } from '@/components/ui/badge'
import { formatarNumeroBR } from '@/lib/numero-br'
import { estaBloqueado } from '@/lib/mensalidade/regras'
import type { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { dataPuraBr } from '@/lib/data-venda'
import { LinhaPagavel } from './linha-pagavel'

type Aberta = Awaited<ReturnType<typeof abertasCobraveis>>[number]
export type LinhaMensalidade = Aberta & { acrescimo: number; total: number }

function Situacao({ cobranca, hoje }: { cobranca: Aberta['m']; hoje: string }) {
  // A adesão bloqueia desde o 1º dia: o selo "Bloqueado" não diria nada a mais.
  if (cobranca.tipo === 'mensalidade' && estaBloqueado([cobranca], hoje)) return <Badge variant="outline" className="border-destructive text-destructive">Bloqueado</Badge>
  if (cobranca.tipo === 'mensalidade' && cobranca.vencimento < hoje) return <Badge variant="outline" className="border-destructive text-destructive">Vencida</Badge>
  return <Badge variant="outline" className="border-warning text-warning">Em aberto</Badge>
}

/** Topo da /mensalidade: adesão do grupo ativo em aberto, acesso suspenso pela mensalidade ou a lista comum. */
export function CabecalhoMensalidade({ grupo, adesaoEmAberto, bloqueado, totalAberto, paga }: {
  grupo: string | null; adesaoEmAberto: boolean; bloqueado: boolean; totalAberto: number; paga: boolean
}) {
  const suspenso = bloqueado && !adesaoEmAberto
  const [titulo, texto] = adesaoEmAberto
    ? ['Adesão ao MOVA', `O acesso de ${grupo} é liberado assim que o pagamento da adesão for confirmado.`]
    : suspenso && grupo
      ? ['Acesso suspenso', `A mensalidade de ${grupo} está vencida há mais de 5 dias. Os dados estão guardados e o acesso volta sozinho assim que o pagamento for confirmado.`]
      : ['Mensalidade do MOVA', 'Mensalidades em aberto dos grupos da sua empresa.']
  return (
    <section className={`border-b ${suspenso ? 'bg-destructive/10' : 'bg-card'}`}>
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
        <div className="max-w-2xl">
          <h1 className={`text-2xl font-bold ${suspenso ? 'text-destructive' : ''}`}>{titulo}</h1>
          <p className={`mt-1 text-sm ${suspenso ? 'text-destructive' : 'text-muted-foreground'}`}>{texto}</p>
        </div>
        {paga && totalAberto > 0 && (
          <div className="flex items-baseline justify-between gap-4 border-t pt-4 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
            <div className="text-sm text-muted-foreground">Total em aberto</div>
            <div className="whitespace-nowrap text-2xl font-extrabold sm:text-3xl">R$ {formatarNumeroBR(totalAberto)}</div>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Lista da /mensalidade: aviso para quem não paga, erro de leitura, vazio ou uma linha por cobrança
 * em aberto. Leitura que falhou não vira "nenhuma em aberto": o cliente acharia que está em dia (#773).
 */
export function ListaMensalidades({ paga, linhas, hoje, leituraFalhou }: {
  paga: boolean; linhas: LinhaMensalidade[]; hoje: string; leituraFalhou: boolean
}) {
  if (!paga) {
    const adesao = linhas.find(l => l.m.tipo === 'adesao')
    return (
      <p className="rounded-lg border bg-card p-4 text-sm">
        {adesao
          ? `O acesso ao MOVA de ${adesao.grupoNome} é liberado depois que o responsável pagar a adesão.`
          : 'Fale com o responsável da sua empresa para regularizar.'}
      </p>
    )
  }
  if (leituraFalhou) {
    return (
      <p role="alert" className="rounded-lg border border-destructive bg-card p-4 text-sm text-destructive">
        Não deu para carregar as mensalidades agora. Atualize a página em alguns minutos.
      </p>
    )
  }
  if (linhas.length === 0) return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Nenhuma mensalidade em aberto.</p>
  return linhas.map(({ m, grupoNome, acrescimo, total }) => (
    <LinhaPagavel key={m.id} mensalidadeId={m.id}>
      <div className="col-span-2 md:col-span-1">
        <div className="font-semibold">{grupoNome}</div>
        <div className="text-sm text-muted-foreground">{m.competencia ? `Competência ${dataPuraBr(m.competencia)}` : 'Adesão'}</div>
      </div>
      <div className="space-y-1 text-sm">
        <div>{m.vencimento < hoje ? 'Venceu em' : 'Vence em'} {dataPuraBr(m.vencimento)}</div>
        <Situacao cobranca={m} hoje={hoje} />
      </div>
      <div className="text-right md:text-left">
        <div className="whitespace-nowrap text-lg font-extrabold">R$ {formatarNumeroBR(total)}</div>
        {acrescimo > 0 && (
          <div className="text-xs text-muted-foreground">inclui R$ {formatarNumeroBR(acrescimo)} de multa e juros</div>
        )}
      </div>
    </LinhaPagavel>
  ))
}
