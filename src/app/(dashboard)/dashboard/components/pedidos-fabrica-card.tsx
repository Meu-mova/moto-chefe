'use client'
import { useState, useTransition } from 'react'
import { RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { atualizarPedidosFabricaAction } from '../actions'
import type { PedidosFabricaDoGrupo } from '@/lib/queries/pedidos-fabrica'
import { LinhaValor, TituloGrupo } from './painel-secoes'

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
    <div>
      <TituloGrupo acao={
        <Button variant="outline" size="sm" onClick={atualizar} disabled={lendo} className="h-7 shrink-0">
          <RefreshCw className={lendo ? 'animate-spin' : undefined} />
          {lendo ? 'Lendo o portal…' : 'Atualizar'}
        </Button>
      }>
        Pedidos de peças na fábrica
      </TituloGrupo>
      <LinhaValor rotulo="Aguardando pagamento" alerta={total > 0}>{total > 0 ? `${total} · ${reais(valorTotal)}` : 'Nenhum'}</LinhaValor>
      {total > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {pendentes.slice(0, 6).map(p => (
            <li key={p.loja + p.numeroPedido} className="flex items-baseline justify-between gap-3 py-2 text-sm">
              <span className="min-w-0 truncate">
                <span className="font-mono text-muted-foreground">#{p.numeroPedido}</span> {p.loja}
              </span>
              <span className="shrink-0 tabular-nums">
                {p.valor != null && <>{reais(p.valor)} · </>}
                <span className={p.dias >= 3 ? 'font-semibold text-warning' : 'text-muted-foreground'}>
                  {p.dias === 0 ? 'visto hoje' : p.dias === 1 ? 'há 1 dia' : `há ${p.dias} dias`}
                </span>
              </span>
            </li>
          ))}
          {pendentes.length > 6 && <li className="py-2 text-xs text-muted-foreground">e mais {pendentes.length - 6}…</li>}
        </ul>
      )}
      <LinhaValor rotulo="Última leitura do portal">{quando(ultimaLeitura)}{lendo && ' · lendo…'}</LinhaValor>
      {total > 0 && (
        <p className="mt-2 text-xs text-muted-foreground">
          A fábrica cancela por prazo de pagamento{critico ? ', e há pedido parado há 3 dias ou mais' : ''}.{' '}
          <a href={URL_PORTAL} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-text hover:underline">Abrir o portal</a>
        </p>
      )}
      {lojasSemLeitura.length > 0 && (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Sem leitura em {lojasSemLeitura.length} {lojasSemLeitura.length === 1 ? 'loja' : 'lojas'}:{' '}
          {lojasSemLeitura.map(l => `${l.loja} (${MOTIVO[l.status] ?? l.status})`).join(', ')}. Para elas, o zero não garante que está tudo pago.
        </p>
      )}
      {erro && <p className="mt-2 text-xs text-destructive">{erro}</p>}
    </div>
  )
}
