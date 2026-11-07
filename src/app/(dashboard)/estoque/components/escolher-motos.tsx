'use client'

import { useRef, useState } from 'react'
import { Loader2, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { estadoDaSelecao, marcarVarias } from '@/lib/selecao'

/** A moto como a busca do Arquivar e do Remover devolve: `bloqueio` é a frase do servidor, ou null. */
export type MotoParaEscolher = { id: string; chassi: string; modelo: string | null; loja: string; nfEntrada: string | null; bloqueio: string | null }

/** Envio do lote sem resposta: a pessoa confere antes de mandar de novo. */
export const SEM_RESPOSTA = 'Sem resposta do servidor. Confira no Showroom se as motos saíram antes de tentar de novo.'

/** Estado do passo "Escolher" do Arquivar (#688) e do Remover moto (#692). */
export function useEscolhaDeMotos<M extends MotoParaEscolher>(buscarAction: (termo: string) => Promise<M[]>) {
  const [termo, setTermo] = useState('')
  const [achadas, setAchadas] = useState<M[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [erroDaBusca, setErroDaBusca] = useState<string | null>(null)
  // Ids marcados: a escolha continua quando a pessoa busca outra NF ou outro chassi.
  const [marcadas, setMarcadas] = useState<ReadonlySet<string>>(new Set())
  // Toda moto já vista nas buscas, para listar as marcadas nos passos seguintes.
  const [conhecidas, setConhecidas] = useState<ReadonlyMap<string, M>>(new Map())
  const ultimaBusca = useRef(0)

  async function buscar(e: React.FormEvent) {
    e.preventDefault()
    const vez = ++ultimaBusca.current
    setBuscando(true)
    setErroDaBusca(null)
    try {
      const lista = await buscarAction(termo)
      if (vez === ultimaBusca.current) {
        setAchadas(lista)
        setConhecidas(antes => new Map([...antes, ...lista.map(m => [m.id, m] as const)]))
        // Escolhida que agora está travada sai da escolha: a caixinha travada não teria como desmarcar.
        setMarcadas(antes => marcarVarias(antes, lista.filter(m => m.bloqueio).map(m => m.id), false))
      }
    } catch {
      if (vez === ultimaBusca.current) setErroDaBusca('Não deu para buscar. Tente de novo.')
    } finally {
      if (vez === ultimaBusca.current) setBuscando(false)
    }
  }

  const alternar = (ids: string[], marcar: boolean) => setMarcadas(antes => marcarVarias(antes, ids, marcar))
  const escolhidas = [...marcadas].flatMap(id => conhecidas.get(id) ?? [])
  return { termo, setTermo, achadas, buscando, erroDaBusca, marcadas, escolhidas, buscar, alternar }
}

type Escolha = ReturnType<typeof useEscolhaDeMotos<MotoParaEscolher>>

/** Busca por chassi ou NF de entrada e a lista com caixinha; a moto travada aparece apagada com a frase. */
export function EscolherMotos({ escolha, idDaBusca }: { escolha: Escolha; idDaBusca: string }) {
  const { termo, setTermo, achadas, buscando, erroDaBusca, marcadas, buscar, alternar } = escolha
  const livres = (achadas ?? []).filter(m => !m.bloqueio)
  const idsLivres = livres.map(m => m.id)
  return (
    <>
      <form onSubmit={buscar} className="space-y-1.5">
        <Label htmlFor={idDaBusca}>Buscar por chassi ou NF de entrada</Label>
        <div className="flex gap-2">
          <Input id={idDaBusca} value={termo} onChange={e => setTermo(e.target.value)} autoComplete="off" className="text-base sm:text-sm" />
          <Button type="submit" variant="outline" disabled={buscando || !termo.trim()}>
            {buscando ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Buscar
          </Button>
        </div>
      </form>
      {erroDaBusca && <p role="alert" className="border-l-2 border-l-destructive pl-3 text-sm text-destructive">{erroDaBusca}</p>}
      {achadas === null ? (
        <p className="text-sm text-muted-foreground">Digite um chassi ou o número da NF de entrada e aperte Buscar.</p>
      ) : achadas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma moto encontrada.</p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {livres.length > 1 && (
            <li className="bg-muted">
              <label className="flex items-center gap-3 px-3 py-2.5 text-sm font-medium">
                <input type="checkbox" className="size-4 accent-primary" checked={estadoDaSelecao(idsLivres, marcadas) === 'todas'} onChange={e => alternar(idsLivres, e.target.checked)} aria-label={`Marcar todas que podem (${livres.length})`} />
                Marcar todas que podem ({livres.length})
              </label>
            </li>
          )}
          {achadas.map(m => (
            <li key={m.id}>
              <label className={cn('flex gap-3 px-3 py-2.5', m.bloqueio && 'opacity-60')}>
                <input type="checkbox" className="mt-0.5 size-4 accent-primary" disabled={!!m.bloqueio} checked={marcadas.has(m.id)} onChange={e => alternar([m.id], e.target.checked)} aria-label={m.chassi} />
                <span className="min-w-0 text-sm">
                  <span className="font-mono">{m.chassi}</span> <span className="text-muted-foreground">{m.modelo}</span>
                  <span className="block text-xs text-muted-foreground">{m.loja}{m.nfEntrada && ` · NF de entrada ${m.nfEntrada}`}</span>
                  {m.bloqueio && <span className="block text-xs text-destructive">{m.bloqueio}</span>}
                </span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
