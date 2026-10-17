import { and, asc, eq, inArray } from 'drizzle-orm'
import Link from 'next/link'
import { db } from '@/lib/db'
import { grupos, mensalidades } from '@/lib/db/schema'
import { getUsuarioLogado } from '@/lib/auth'
import { getGrupoAtivo, listarGruposVisiveis } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { formatarNumeroBR } from '@/lib/numero-br'
import { logoutAction } from '@/app/(auth)/login/actions'
import { GroupSelector } from '@/components/layout/group-selector'
import { estaBloqueado, podePagarMensalidade, valorAtualizado } from '@/lib/mensalidade/regras'
import { BotaoPagar } from './botao-pagar'

const dataBR = (d: string) => d.split('-').reverse().join('/')

// Fora do layout do painel de propósito: é a única tela aberta para o grupo bloqueado.
// O bloqueio é do grupo ativo; quem paga vê as mensalidades de todos os grupos que enxerga
// e troca de grupo pelo seletor para sair de um bloqueado.
export default async function MensalidadePage() {
  const usuario = await getUsuarioLogado()
  const ativo = await getGrupoAtivo(usuario).catch(() => null)
  const paga = podePagarMensalidade(usuario.papel)
  const visiveis = paga ? await listarGruposVisiveis(usuario).catch(() => []) : ativo ? [ativo] : []
  const ids = visiveis.map(g => g.id)
  const abertas = ids.length
    ? await db.select({ m: mensalidades, grupoNome: grupos.nome })
      .from(mensalidades).innerJoin(grupos, eq(grupos.id, mensalidades.grupoId))
      .where(and(inArray(mensalidades.grupoId, ids), eq(mensalidades.status, 'aberta')))
      .orderBy(asc(mensalidades.vencimento))
    : []
  const hoje = hojeBrt()
  const doAtivo = abertas.filter(a => a.m.grupoId === ativo?.id)
  const bloqueado = estaBloqueado(doAtivo.map(a => a.m.vencimento), hoje)

  return (
    <div className="min-h-screen bg-background">
      <GroupSelector usuario={usuario} />
      <div className="flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-card rounded-lg border p-6 space-y-4">
          <h1 className="text-xl font-bold">{bloqueado ? 'Acesso suspenso' : 'Mensalidade do MOVA'}</h1>
          {bloqueado && ativo && (
            <p className="text-sm text-muted-foreground">
              A mensalidade de {ativo.nome} está vencida há mais de 5 dias. Os dados estão guardados e o
              acesso volta sozinho assim que o pagamento for confirmado.
            </p>
          )}

          {!paga ? (
            <p className="text-sm">Fale com o responsável da sua empresa para regularizar.</p>
          ) : abertas.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mensalidade em aberto.</p>
          ) : (
            <ul className="space-y-3">
              {abertas.map(({ m, grupoNome }) => {
                const { acrescimo, total } = valorAtualizado(Number(m.valor), m.vencimento, hoje)
                return (
                  <li key={m.id} className="rounded-md border p-3 flex items-center justify-between gap-3">
                    <div className="text-sm">
                      <div className="font-medium">R$ {formatarNumeroBR(total)}</div>
                      <div className="text-muted-foreground">
                        {visiveis.length > 1 && `${grupoNome} · `}Vence {dataBR(m.vencimento)}
                        {acrescimo > 0 && ` · inclui R$ ${formatarNumeroBR(acrescimo)} de multa e juros`}
                      </div>
                    </div>
                    <BotaoPagar mensalidadeId={m.id} />
                  </li>
                )
              })}
            </ul>
          )}

          <div className="flex justify-between text-sm pt-2">
            {!bloqueado ? <Link href="/dashboard" className="text-primary-text underline">Voltar ao sistema</Link> : <span />}
            <form action={logoutAction}><button type="submit" className="text-muted-foreground underline">Sair</button></form>
          </div>
        </div>
      </div>
    </div>
  )
}
