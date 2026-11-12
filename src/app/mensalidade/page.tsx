import Link from 'next/link'
import { getUsuarioLogado } from '@/lib/auth'
import { grupoAtivoDaRequisicao } from '@/lib/grupo'
import { hojeBrt } from '@/lib/data-venda'
import { logoutAction } from '@/app/(auth)/login/actions'
import { GroupSelector } from '@/components/layout/group-selector'
import { estaBloqueado, podePagarMensalidade, valorAtualizado } from '@/lib/mensalidade/regras'
import { abertasCobraveis } from '@/lib/mensalidade/bloqueio'
import { gruposDaMensalidade } from '@/lib/mensalidade/grupos'
import { CabecalhoMensalidade, ListaMensalidades } from './lista'

// Fora do layout do painel de propósito: é a única tela aberta para o grupo bloqueado.
// O bloqueio é do grupo ativo; quem paga vê as mensalidades de todos os grupos que enxerga
// e troca de grupo pelo seletor para sair de um bloqueado. Layout: variante 3 (19/10/2026).
export default async function MensalidadePage() {
  const usuario = await getUsuarioLogado()
  const ativo = await grupoAtivoDaRequisicao(usuario).catch(() => null)
  const paga = podePagarMensalidade(usuario.papel)
  const leitura = await gruposDaMensalidade(usuario, async () => ativo)
    .then(grupos => abertasCobraveis({ grupoIds: grupos.map(g => g.id) }))
    .then(abertas => ({ abertas, falhou: false }), (e: unknown) => {
      console.error('[mensalidade] leitura da página:', e instanceof Error ? e.message : e)
      return { abertas: [], falhou: true }
    })
  const { abertas } = leitura
  const hoje = hojeBrt()
  const doAtivo = abertas.filter(a => a.m.grupoId === ativo?.id).map(a => a.m)
  const bloqueado = estaBloqueado(doAtivo, hoje)
  const adesaoEmAberto = doAtivo.some(m => m.tipo === 'adesao')
  const linhas = abertas.map(a => ({ ...a, ...valorAtualizado(a.m, hoje) }))
  const totalAberto = linhas.reduce((s, l) => s + l.total, 0)

  return (
    <div className="min-h-screen bg-background">
      <GroupSelector usuario={usuario} />

      <CabecalhoMensalidade grupo={ativo?.nome ?? null} adesaoEmAberto={adesaoEmAberto} bloqueado={bloqueado} totalAberto={totalAberto} paga={paga} />

      <main className="mx-auto max-w-6xl space-y-3 px-4 py-6 sm:px-6">
        <ListaMensalidades paga={paga} linhas={linhas} hoje={hoje} leituraFalhou={leitura.falhou} />

        <div className="flex justify-between pt-2 text-sm">
          {!bloqueado ? <Link href="/dashboard" className="text-primary-text underline">Voltar ao sistema</Link> : <span />}
          <form action={logoutAction}><button type="submit" className="text-muted-foreground underline">Sair</button></form>
        </div>
      </main>
    </div>
  )
}
