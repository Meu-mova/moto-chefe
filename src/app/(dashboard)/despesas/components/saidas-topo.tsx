'use client'
import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ResumoFaixa, type ItemResumo } from '@/components/resumo-faixa'
import { PeriodoAtalhos } from '@/components/periodo-atalhos'
import { BotaoAtualizar } from '@/components/botao-atualizar'
import type { ModoSync, ResultadoSyncSaidas } from '../open-finance'

type Props = {
  itens: ItemResumo[]
  from: string
  to: string
  hoje: string
  rotuloSync: string
  /** Modo pedido na URL (?sync=1 forçado, ?sync=completo): vale na abertura da tela. */
  modoInicial: ModoSync
  sincronizarAoAbrir: boolean
  /** URL sem o parâmetro `sync`: depois de um sync pedido por ele, para o F5 não repetir. */
  urlSemSync: string
}

// A sincronização com o mcp.ai leva de segundos a mais de 2 min: roda aqui, depois de a tela já ter
// aparecido com o que está no banco (mesmo desenho da PIX, #126/#129).
export function SaidasTopo({ itens, from, to, hoje, rotuloSync, modoInicial, sincronizarAoAbrir, urlSemSync }: Props) {
  const router = useRouter()
  const [pendente, setPendente] = useState(false)
  // falha = nada sincronizou; parcial = alguma conta não foi lida.
  const [aviso, setAviso] = useState<{ tipo: 'falha' | 'parcial'; detalhe: string } | null>(null)
  const disparou = useRef(false)

  async function sincronizar(modo: ModoSync) {
    setAviso(null)
    setPendente(true)
    let semAviso = true
    try {
      const resp = await fetch('/api/despesas/sincronizar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modo }),
      })
      const r = (await resp.json()) as ResultadoSyncSaidas | { error: string }
      if ('error' in r) { setAviso({ tipo: 'falha', detalhe: r.error }); semAviso = false }
      else if (!r.ok) { setAviso({ tipo: 'falha', detalhe: r.erro }); semAviso = false }
      else if (r.contasPuladas.length > 0) { setAviso({ tipo: 'parcial', detalhe: r.contasPuladas.join(', ') }); semAviso = false }
    } catch {
      setAviso({ tipo: 'falha', detalhe: 'falha ao falar com o servidor' })
      semAviso = false
    } finally {
      setPendente(false)
      // URL com ?sync= e um sync concluído sem falha (o da abertura ou o do botão, o modo não importa): tira o
      // parâmetro, senão o F5 repetiria o sync pedido por ele (como o redirect do servidor fazia).
      // Com falha ou conta pulada fica na página, para o aviso continuar aparecendo.
      if (semAviso && modoInicial !== 'normal') router.replace(urlSemSync)
      else router.refresh()
    }
  }

  useEffect(() => {
    if (sincronizarAoAbrir && !disparou.current) {
      disparou.current = true
      sincronizar(modoInicial)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const linha = (
    <p className="flex items-center gap-x-3 text-xs text-muted-foreground">
      {pendente ? 'Sincronizando com o banco… pode levar alguns minutos' : rotuloSync}
      <button
        type="button"
        onClick={() => sincronizar('forcado')}
        disabled={pendente}
        className="inline-flex h-11 items-center gap-1 underline hover:text-foreground disabled:opacity-50 disabled:no-underline md:h-8"
      >
        <RefreshCw size={11} className={cn(pendente && 'animate-spin')} /> Atualizar agora
      </button>
    </p>
  )

  return (
    <div className="space-y-6">
      {aviso?.tipo === 'falha' && (
        // Aviso discreto: o motivo técnico fica no tooltip para não poluir a tela.
        <p className="text-xs text-muted-foreground" title={aviso.detalhe}>
          Não foi possível sincronizar agora. Mostrando os dados já salvos.
        </p>
      )}
      {aviso?.tipo === 'parcial' && (
        <div className="border-l-2 border-destructive py-1 pl-3 text-sm text-destructive">
          O mcp.ai não respondeu para: {aviso.detalhe}. As saídas recentes dessas contas podem estar faltando.
          O sistema mantém a data do último sync e tenta de novo nas próximas visitas.
        </div>
      )}
      <ResumoFaixa itens={itens} acaoMobile={<BotaoAtualizar onClick={() => sincronizar('forcado')} pendente={pendente} />} />
      <PeriodoAtalhos from={from} to={to} hoje={hoje} chaveDe="sfrom" chaveAte="sto" direita={linha} />
    </div>
  )
}
