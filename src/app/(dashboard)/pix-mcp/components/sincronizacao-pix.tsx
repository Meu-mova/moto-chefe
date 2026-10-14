'use client'
import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import { sincronizarPixAction } from '../actions'

// A sincronização com o mcp.ai leva de segundos a mais de 1 min, então roda
// aqui, depois de a tabela já ter aparecido com o que está no banco (#126).
export function SincronizacaoPix({ rotuloSync, sincronizarAoAbrir }: { rotuloSync: string; sincronizarAoAbrir: boolean }) {
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

  return (
    <>
      <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
        {pendente ? 'Sincronizando com o banco… pode levar cerca de 1 min' : rotuloSync}
        <button
          type="button"
          onClick={() => sincronizar(true)}
          disabled={pendente}
          className="inline-flex items-center gap-1 text-slate-500 hover:text-slate-800 underline disabled:opacity-50 disabled:no-underline"
        >
          <RefreshCw size={11} className={pendente ? 'animate-spin' : ''} /> Atualizar agora
        </button>
      </p>
      {erro && (
        <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Não foi possível sincronizar com o mcp.ai agora ({erro}) — mostrando os dados já salvos.
        </div>
      )}
    </>
  )
}
