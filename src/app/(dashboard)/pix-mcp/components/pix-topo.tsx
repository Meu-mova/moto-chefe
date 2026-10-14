'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResumoFaixa, type ItemResumo } from '@/components/resumo-faixa'
import { PeriodoAtalhos } from '@/components/periodo-atalhos'
import { sincronizarPixAction } from '../actions'

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
  const [pendente, iniciar] = useTransition()
  const [erro, setErro] = useState<string | null>(null)
  const disparou = useRef(false)

  function sincronizar(forcar: boolean) {
    setErro(null)
    iniciar(async () => {
      try {
        const r = await sincronizarPixAction(forcar)
        if (!r.ok) setErro(r.erro)
        else if (r.contasPuladas.length > 0) setErro(`conta não lida: ${r.contasPuladas.join(', ')}`)
      } catch {
        setErro('falha ao falar com o servidor')
      }
      router.refresh()
    })
  }

  useEffect(() => {
    if (sincronizarAoAbrir && !disparou.current) {
      disparou.current = true
      sincronizar(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const botaoMobile = (
    <button
      type="button"
      onClick={() => sincronizar(true)}
      disabled={pendente}
      className="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-card px-2.5 text-xs font-medium text-muted-foreground disabled:opacity-60"
    >
      <RefreshCw className={cn('size-3', pendente && 'animate-spin')} /> {pendente ? 'Sincronizando…' : 'Atualizar'}
    </button>
  )

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
      {/* Aviso discreto: o motivo técnico fica no tooltip para não poluir a tela. */}
      {erro && (
        <p className="text-xs text-muted-foreground" title={erro}>
          Não foi possível sincronizar agora. Mostrando os dados já salvos.
        </p>
      )}
    </div>
  )
}
