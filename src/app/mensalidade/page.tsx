import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao, listarGruposVisiveis } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { formatarNumeroBR } from '@/lib/numero-br'
import { logoutAction } from '@/app/(auth)/login/actions'
import { GroupSelector } from '@/components/layout/group-selector'
import { Badge } from '@/components/ui/badge'
import { estaBloqueado, podePagarMensalidade, valorAtualizado } from '@/lib/mensalidade/regras'
import { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { BotaoPagar } from './botao-pagar'

const dataBR = (d: string) => d.split('-').reverse().join('/')
const competenciaBR = (c: string) => c.split('-').reverse().join('/')

function Situacao({ vencimento, hoje }: { vencimento: string; hoje: string }) {
  if (estaBloqueado([vencimento], hoje)) return <Badge variant="outline" className="border-destructive text-destructive">Bloqueado</Badge>
  if (vencimento < hoje) return <Badge variant="outline" className="border-destructive text-destructive">Vencida</Badge>
  return <Badge variant="outline" className="border-warning text-warning">Em aberto</Badge>
}

// Fora do layout do painel de propósito: é a única tela aberta para o grupo bloqueado.
// O bloqueio é do grupo ativo; quem paga vê as mensalidades de todos os grupos que enxerga
// e troca de grupo pelo seletor para sair de um bloqueado. Layout: variante 3 (19/10/2026).
export default async function MensalidadePage() {
  const usuario = await getUsuarioLogado()
  const ativo = await grupoAtivoDaRequisicao(usuario).catch(() => null)
  const paga = podePagarMensalidade(usuario.papel)
  // admin_geral enxerga todos os grupos: aqui fica só o ativo, senão o total somaria a
  // mensalidade de todos os clientes. A visão geral é /admin/mensalidades.
  const visiveis = paga && usuario.papel !== 'admin_geral'
    ? await listarGruposVisiveis(usuario).catch(() => [])
    : ativo ? [ativo] : []
  const abertas = await abertasCobraveis({ grupoIds: visiveis.map(g => g.id) })
  const hoje = hojeBrt()
  const bloqueado = estaBloqueado(abertas.filter(a => a.m.grupoId === ativo?.id).map(a => a.m.vencimento), hoje)
  const linhas = abertas.map(a => ({ ...a, ...valorAtualizado(Number(a.m.valor), a.m.vencimento, hoje) }))
  const totalAberto = linhas.reduce((s, l) => s + l.total, 0)

  return (
    <div className="min-h-screen bg-background">
      <GroupSelector usuario={usuario} />

      <section className={`border-b ${bloqueado ? 'bg-destructive/10' : 'bg-card'}`}>
        <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 sm:py-8">
          <div className="max-w-2xl">
            <h1 className={`text-2xl font-bold ${bloqueado ? 'text-destructive' : ''}`}>
              {bloqueado ? 'Acesso suspenso' : 'Mensalidade do MOVA'}
            </h1>
            <p className={`mt-1 text-sm ${bloqueado ? 'text-destructive' : 'text-muted-foreground'}`}>
              {bloqueado && ativo
                ? `A mensalidade de ${ativo.nome} está vencida há mais de 5 dias. Os dados estão guardados e o acesso volta sozinho assim que o pagamento for confirmado.`
                : 'Mensalidades em aberto dos grupos da sua empresa.'}
            </p>
          </div>
          {paga && linhas.length > 0 && (
            <div className="flex items-baseline justify-between gap-4 border-t pt-4 sm:block sm:border-t-0 sm:pt-0 sm:text-right">
              <div className="text-sm text-muted-foreground">Total em aberto</div>
              <div className="whitespace-nowrap text-2xl font-extrabold sm:text-3xl">R$ {formatarNumeroBR(totalAberto)}</div>
            </div>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6">
        {!paga ? (
          <p className="rounded-lg border bg-card p-4 text-sm">Fale com o responsável da sua empresa para regularizar.</p>
        ) : linhas.length === 0 ? (
          <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Nenhuma mensalidade em aberto.</p>
        ) : (
          linhas.map(({ m, grupoNome, acrescimo, total }) => (
            <div key={m.id} className="grid grid-cols-2 items-center gap-3 rounded-lg border bg-card p-4 md:grid-cols-[1.4fr_1fr_1fr_auto] md:gap-4 md:px-5">
              <div className="col-span-2 md:col-span-1">
                <div className="font-semibold">{grupoNome}</div>
                <div className="text-sm text-muted-foreground">Competência {competenciaBR(m.competencia)}</div>
              </div>
              <div className="space-y-1 text-sm">
                <div>{m.vencimento < hoje ? 'Venceu em' : 'Vence em'} {dataBR(m.vencimento)}</div>
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
        )}

        <div className="flex justify-between pt-2 text-sm">
          {!bloqueado ? <Link href="/dashboard" className="text-primary-text underline">Voltar ao sistema</Link> : <span />}
          <form action={logoutAction}><button type="submit" className="text-muted-foreground underline">Sair</button></form>
        </div>
      </main>
    </div>
  )
}
