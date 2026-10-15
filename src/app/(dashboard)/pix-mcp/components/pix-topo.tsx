'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResumoFaixa, type ItemResumo } from '@/components/resumo-faixa'
import { PeriodoAtalhos } from '@/components/periodo-atalhos'
import { BotaoAtualizar } from '@/components/botao-atualizar'
import type { ResultadoSyncPix } from '@/lib/pix-sync'

type Props = {
  itens: ItemResumo[]
  from: string
  to: string
  hoje: string
  min: string
  rotuloSync: string
  sincronizarAoAbrir: boolean
}

// A sincronização com o mcp.ai leva de segundos a mais de 1 min, então roda aqui, depois de a
// tabela já ter aparecido com o que está no banco (#126). O mesmo estado alimenta o botão do
// celular (sobre o fio do resumo) e a linha do tablet para cima (ao lado do período).
export function PixTopo({ itens, from, to, hoje, min, rotuloSync, sincronizarAoAbrir }: Props) {
  const router = useRouter()
  const [pendente, setPendente] = useState(false)
  // falha = nada sincronizou; parcial = alguma conta não foi lida (aviso com a conta, visível também no celular).
  const [aviso, setAviso] = useState<{ tipo: 'falha' | 'parcial'; detalhe: string } | null>(null)
  const disparou = useRef(false)

  async function sincronizar(forcar: boolean) {
    setAviso(null)
    setPendente(true)
    try {
      // fetch para um Route Handler, não Server Action: o Next despacha as ações uma por vez, e uma
      // sincronização de minutos travaria a fila (trocar de grupo, vincular PIX).
      const resp = await fetch('/api/pix-mcp/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ forcar }),
      })
      const r = (await resp.json()) as ResultadoSyncPix | { error: string }
      if ('error' in r) setAviso({ tipo: 'falha', detalhe: r.error })
      else if (!r.ok) setAviso({ tipo: 'falha', detalhe: r.erro })
      else if (r.contasPuladas.length > 0) setAviso({ tipo: 'parcial', detalhe: r.contasPuladas.join(', ') })
    } catch {
      setAviso({ tipo: 'falha', detalhe: 'falha ao falar com o servidor' })
    }
    setPendente(false)
    router.refresh()
  }

  useEffect(() => {
    if (sincronizarAoAbrir && !disparou.current) {
      disparou.current = true
      sincronizar(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const botaoMobile = <BotaoAtualizar onClick={() => sincronizar(true)} pendente={pendente} />

  const linha = (
    <p className="flex items-center gap-3 text-xs text-muted-foreground">
      {pendente ? 'Sincronizando com o banco… pode levar cerca de 1 min' : rotuloSync}
      <button
        type="button"
        onClick={() => sincronizar(true)}
        disabled={pendente}
        className="inline-flex h-8 items-center gap-1.5 underline hover:text-foreground disabled:opacity-50 disabled:no-underline"
      >
        <RefreshCw className={cn('size-3.5', pendente && 'animate-spin')} /> Atualizar agora
      </button>
    </p>
  )

  return (
    <div className="space-y-4">
      <ResumoFaixa itens={itens} acaoMobile={botaoMobile} />
      <PeriodoAtalhos from={from} to={to} hoje={hoje} min={min} direita={linha} />
      {aviso && (
        <p className="text-xs text-muted-foreground" title={aviso.tipo === 'falha' ? aviso.detalhe : undefined}>
          {aviso.tipo === 'falha'
            ? 'Não foi possível sincronizar agora. Mostrando os dados já salvos.'
            : `Conta não lida: ${aviso.detalhe}. Os dados dela podem estar desatualizados.`}
        </p>
      )}
    </div>
  )
}
