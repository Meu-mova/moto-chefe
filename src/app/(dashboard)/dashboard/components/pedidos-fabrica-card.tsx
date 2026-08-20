'use client'
import { useState, useTransition } from 'react'
import { AlertTriangle, EyeOff, PackageX, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { atualizarPedidosFabricaAction } from '../actions'
import type { PedidosFabricaDoGrupo } from '@/lib/queries/pedidos-fabrica'

const URL_PORTAL = 'https://motochefebrasil.store/clientes/pedidos?aba=compras'

function reais(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function quando(d: Date | null): string {
  if (!d) return 'nunca'
  return new Date(d).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
  })
}

const MOTIVO: Record<string, string> = {
  sem_credencial: 'sem login da fábrica cadastrado',
  erro: 'falha no último acesso ao portal',
  nunca: 'nunca foi lida',
}

/**
 * Pedidos de peças aguardando pagamento na fábrica.
 *
 * A fábrica cancela por prazo, então o custo de não ver é perder o pedido. Por
 * isso o card aparece mesmo com zero pendências quando alguma loja do grupo não
 * está sendo lida: nesse caso o zero não significa "tudo pago".
 *
 * O botão relê o portal na hora. O resultado entra em estado local em vez de
 * `revalidatePath`: quando a releitura zera tudo, o card sumiria no meio do
 * clique e quem apertou não veria nada acontecer.
 */
export function PedidosFabricaCard({ dados: iniciais }: { dados: PedidosFabricaDoGrupo }) {
  const [dados, setDados] = useState(iniciais)
  const [erro, setErro] = useState<string | null>(null)
  const [releu, setReleu] = useState(false)
  const [lendo, iniciarLeitura] = useTransition()

  const { pendentes, total, valorTotal, lojasSemLeitura, ultimaLeitura } = dados

  function atualizar() {
    setErro(null)
    iniciarLeitura(async () => {
      try {
        const r = await atualizarPedidosFabricaAction()
        if ('erro' in r) { setErro(r.erro); return }
        setDados(r.dados)
        setReleu(true)
      } catch (e) {
        setErro(e instanceof Error ? e.message : 'Falha ao ler o portal da fábrica')
      }
    })
  }

  // `releu` segura o card na tela quando a leitura manual zerou tudo — some
  // sozinho no próximo carregamento da página.
  if (total === 0 && lojasSemLeitura.length === 0 && !releu) return null

  const critico = pendentes.some(p => p.dias >= 3)

  return (
    <section className={`rounded-lg border p-4 space-y-2 ${
      total > 0 ? 'bg-amber-50 border-amber-200' : 'bg-slate-50 border-slate-200'
    }`}>
      <div className="flex items-start justify-between gap-2">
        <h2 className={`font-semibold text-sm flex items-center gap-1.5 ${
          total > 0 ? 'text-amber-800' : 'text-slate-700'
        }`}>
          {total > 0
            ? <AlertTriangle size={15} className="text-amber-600" />
            : <PackageX size={15} className="text-slate-400" />}
          Pedidos de peças aguardando pagamento na fábrica
        </h2>
        <Button
          variant="outline"
          size="sm"
          onClick={atualizar}
          disabled={lendo}
          className="shrink-0 bg-white"
        >
          <RefreshCw className={lendo ? 'animate-spin' : undefined} />
          {lendo ? 'Lendo o portal…' : 'Atualizar'}
        </Button>
      </div>

      {total > 0 && (
        <>
          <p className="text-sm text-amber-900">
            <b>{total}</b> pedido{total !== 1 ? 's' : ''} · <b>{reais(valorTotal)}</b>
            {critico && ' · há 3 dias ou mais'}
          </p>
          <ul className="space-y-0.5">
            {pendentes.slice(0, 6).map(p => (
              <li key={p.loja + p.numeroPedido} className="text-sm text-amber-900">
                <span className="font-mono">#{p.numeroPedido}</span>
                {' · '}{p.loja}
                {p.valor != null && <> · {reais(p.valor)}</>}
                {' · '}
                <span className={p.dias >= 3 ? 'font-semibold' : ''}>
                  {p.dias === 0 ? 'visto hoje' : p.dias === 1 ? 'há 1 dia' : `há ${p.dias} dias`}
                </span>
              </li>
            ))}
            {pendentes.length > 6 && (
              <li className="text-xs text-amber-700">e mais {pendentes.length - 6}…</li>
            )}
          </ul>
          <p className="text-xs text-amber-700">
            A fábrica cancela por prazo de pagamento.{' '}
            <a href={URL_PORTAL} target="_blank" rel="noopener noreferrer" className="underline">
              Abrir o portal
            </a>
          </p>
        </>
      )}

      {total === 0 && (
        <p className="text-sm text-slate-600">
          Nenhum pedido pendente nas lojas que o sistema consegue ler.
        </p>
      )}

      {lojasSemLeitura.length > 0 && (
        <div className="flex items-start gap-1.5 rounded border border-slate-300 bg-white px-2 py-1.5">
          <EyeOff size={13} className="mt-0.5 shrink-0 text-slate-400" />
          <p className="text-xs text-slate-600">
            Sem leitura:{' '}
            {lojasSemLeitura.map(l => `${l.loja} (${MOTIVO[l.status] ?? l.status})`).join(', ')}.
            {' '}O zero dessas lojas não quer dizer que está tudo pago.
          </p>
        </div>
      )}

      {erro && <p className="text-xs text-destructive">{erro}</p>}

      <p className="text-[11px] text-slate-400">
        Última leitura do portal: {quando(ultimaLeitura)}
        {lendo && ' · lendo agora…'}
      </p>
    </section>
  )
}
