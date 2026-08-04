'use client'
import { useState, useRef, useEffect } from 'react'
import { solicitarImportacaoAction, consultarImportacaoAction } from '../actions'
import { Button } from '@/components/ui/button'
import type { SituacaoPedido } from '@/lib/importacao-cartao'

const NOMES: Record<string, string> = {
  infinitypay: 'InfinitePay',
  stone: 'Stone',
  pagueveloz: 'PagueVeloz',
}

type Resultado = Record<string, { importadas: number; duplicadas: number; conciliadas: number }>

export function ImportarCartaoButton() {
  const [situacao, setSituacao] = useState<SituacaoPedido | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [erro, setErro] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => () => { if (timer.current) clearInterval(timer.current) }, [])

  function parar() {
    if (timer.current) { clearInterval(timer.current); timer.current = null }
  }

  async function importar() {
    setResultado(null); setErro(null); setSituacao('pendente')

    let pedido: Awaited<ReturnType<typeof solicitarImportacaoAction>>
    try {
      pedido = await solicitarImportacaoAction()
    } catch (e) {
      setSituacao('erro'); setErro(e instanceof Error ? e.message : 'Falha ao pedir a importação')
      return
    }
    if ('erro' in pedido) { setSituacao('erro'); setErro(pedido.erro); return }
    const pedidoId = pedido.id

    parar()
    timer.current = setInterval(async () => {
      // Sem este try/catch, uma falha da action (rede caindo, deploy no meio)
      // vira promessa rejeitada e o botão fica preso em "Importando…" até
      // alguém recarregar a página.
      try {
        const atual = await consultarImportacaoAction(pedidoId)
        setSituacao(atual.situacao)
        if (['concluida', 'erro', 'offline', 'travado'].includes(atual.situacao)) {
          parar()
          setResultado(atual.resultado)
          setErro(atual.erro)
        }
      } catch (e) {
        parar()
        setSituacao('erro')
        setErro(e instanceof Error ? e.message : 'Falha ao consultar a importação')
      }
    }, 2000)
  }

  const rodando = situacao === 'pendente' || situacao === 'rodando'

  return (
    <div className="flex flex-col gap-2">
      <Button variant="outline" onClick={importar} disabled={rodando}>
        {rodando ? 'Importando…' : 'Importar vendas de cartão'}
      </Button>

      {situacao === 'offline' && (
        <p className="text-sm text-muted-foreground">
          Agente offline no PC da loja — ninguém respondeu ao pedido.
        </p>
      )}
      {situacao === 'travado' && (
        <p className="text-sm text-muted-foreground">
          A importação travou no meio. Tente de novo.
        </p>
      )}
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {resultado && (
        <p className="text-sm text-muted-foreground">
          {Object.entries(resultado)
            .map(([op, r]) => `${NOMES[op] ?? op}: ${r.importadas} importadas, ${r.conciliadas} conciliadas`)
            .join(' • ')}
        </p>
      )}
    </div>
  )
}
