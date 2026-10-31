'use client'
import { useEffect, useMemo, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Building2, ChevronsUpDown, Check, ArrowRightLeft, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { corDoGrupo } from '@/lib/grupo-cores'
import { BotaoTema } from '@/components/theme-provider'
import { trocarGrupoAtivoAction } from './group-selector-actions'
import { contem, filtrarBlocos, iniciaisDoGrupo, mesmoNome, type BlocoDoSeletor } from '@/lib/blocos-seletor'

const CHAVE_RECENTES = 'mova:grupos-recentes'
// Abaixo disso a lista inteira cabe na tela e "Usados por último" só repetiria linhas.
const MINIMO_PARA_RECENTES = 7

type Grupo = BlocoDoSeletor['grupos'][number]

function lerRecentes(): string[] {
  try { return JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') } catch { return [] }
}

export function GroupSwitcher({ blocos, ativoId }: { blocos: BlocoDoSeletor[]; ativoId: string }) {
  const grupos = blocos.flatMap(b => b.grupos)
  const [open, setOpen] = useState(false)
  const [busca, setBusca] = useState('')
  const [foco, setFoco] = useState(0)
  const [recentes, setRecentes] = useState<string[]>([])
  const [pending, start] = useTransition()
  const listaRef = useRef<HTMLDivElement>(null)

  const ativo = grupos.find(g => g.id === ativoId) ?? grupos[0]
  const corAtivo = corDoGrupo(ativo)

  // Atalho Alt 1 a 8: pela ordem da lista inteira, sem busca.
  const atalhos = useMemo(() => grupos.slice(0, 8).map(g => g.id), [grupos])

  const secoes = useMemo(() => {
    const filtrados = filtrarBlocos(blocos, busca)
    if (busca.trim() || grupos.length < MINIMO_PARA_RECENTES) return filtrados
    const usados = recentes.map(id => grupos.find(g => g.id === id)).filter((g): g is Grupo => !!g).slice(0, 3)
    return usados.length ? [{ titulo: 'Usados por último', grupos: usados }, ...filtrados] : filtrados
  }, [blocos, busca, grupos, recentes])
  const ordem = secoes.flatMap(s => s.grupos)

  function abrir() {
    setBusca('')
    setRecentes(lerRecentes())
    setOpen(true)
  }

  useEffect(() => {
    if (!open) return
    const i = ordem.findIndex(g => g.id === ativoId)
    setFoco(i >= 0 && !busca ? i : 0)
    // Só ao abrir e a cada busca: as setas mexem no foco depois disso.
  }, [open, busca])

  useEffect(() => {
    listaRef.current?.querySelector('[data-foco="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [foco])

  function trocar(g: Grupo) {
    if (pending) return
    if (g.id === ativoId) { setOpen(false); return }
    start(async () => {
      try {
        await trocarGrupoAtivoAction(g.id)
        localStorage.setItem(CHAVE_RECENTES, JSON.stringify([g.id, ...lerRecentes().filter(id => id !== g.id)].slice(0, 5)))
        // Recarga completa, não router.refresh(): componente com estado próprio (ex.: o card de
        // pedidos na fábrica) seguiria mostrando dado da empresa anterior, de outra Conta.
        window.location.reload()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao trocar de empresa')
      }
    })
  }

  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); abrir(); return }
      // Alt 1 a 8 só no computador: no celular não há teclado físico.
      // e.code, não e.key: no macOS, Alt+1 vira "¡" em e.key.
      const digito = /^Digit([1-8])$/.exec(e.code)?.[1]
      if (e.altKey && digito && window.matchMedia('(min-width: 640px)').matches) {
        const id = atalhos[Number(digito) - 1]
        const g = grupos.find(x => x.id === id)
        if (g) { e.preventDefault(); trocar(g) }
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  })

  function teclaNaBusca(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setFoco(f => Math.min(f + 1, ordem.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setFoco(f => Math.max(f - 1, 0)) }
    if (e.key === 'Enter' && ordem[foco]) { e.preventDefault(); trocar(ordem[foco]) }
  }

  let indice = 0
  return (
    <>
      {/* Barra colorida do grupo ativo, sempre visível */}
      <div className={`${corAtivo.bar} ${corAtivo.text} flex items-center justify-between gap-4 px-6 py-2.5`}>
        <div className="flex items-center gap-3 min-w-0">
          <Building2 size={20} className="shrink-0 opacity-90" />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider leading-none">Empresa / grupo ativo</p>
            <p className="text-lg font-bold leading-tight truncate" title={ativo.nome}>{ativo.nome}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <BotaoTema local="barra" />
          <button
            onClick={abrir}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md bg-grupo-realce hover:bg-grupo-realce-hover px-3 py-1.5 text-sm font-medium transition-colors"
          >
            <ArrowRightLeft size={14} /> Trocar
            <ChevronsUpDown size={14} className="opacity-70" />
          </button>
        </div>
      </div>

      <Dialog open={open} onOpenChange={o => !pending && setOpen(o)}>
        <DialogContent
          showCloseButton={false}
          className="top-4 translate-y-0 gap-0 overflow-hidden rounded-md bg-card p-0 ring-border sm:top-24 sm:max-w-[560px]"
        >
          <DialogTitle className="sr-only">Trocar empresa</DialogTitle>
          <label className="flex h-12 items-center gap-3 border-b px-4 text-muted-foreground">
            <Search size={16} className="shrink-0" />
            <input
              autoFocus
              value={busca}
              onChange={e => setBusca(e.target.value)}
              onKeyDown={teclaNaBusca}
              placeholder="Buscar empresa, conta, cidade ou CNPJ"
              aria-label="Buscar empresa"
              role="combobox"
              aria-expanded="true"
              aria-controls="seletor-empresas"
              aria-activedescendant={ordem[foco] ? `seletor-${ordem[foco].id}-${foco}` : undefined}
              className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-muted-foreground"
            />
            <kbd className="hidden rounded-sm border px-1 text-[11px] sm:inline">Esc</kbd>
          </label>

          <div id="seletor-empresas" role="listbox" ref={listaRef} className="max-h-[60vh] overflow-y-auto p-1 sm:max-h-[480px]">
            {ordem.length === 0 && <p className="px-3 py-4 text-sm text-muted-foreground">Nenhuma empresa encontrada</p>}
            {secoes.map((s, si) => (
              <div key={(s.titulo ?? '') + si} role="group" aria-label={s.titulo ?? undefined}>
                {s.titulo && <p className="px-2 pt-2 pb-1 text-xs font-medium text-muted-foreground">{s.titulo}</p>}
                {s.grupos.map(g => {
                  const i = indice++
                  const atalho = atalhos.indexOf(g.id)
                  const isAtivo = g.id === ativoId
                  // Achou pela loja: mostra qual, senão a pessoa não entende por que o grupo apareceu.
                  const loja = busca.trim() && !mesmoNome(g.nome, busca) ? g.lojas.find(l => contem(l, busca)) : undefined
                  const meta = [g.mostrarConta && !mesmoNome(g.contaNome, g.nome) && g.contaNome, loja ? `Loja ${loja}` : g.cidade].filter(Boolean).join(', ')
                  return (
                    <button
                      key={`${g.id}-${i}`}
                      id={`seletor-${g.id}-${i}`}
                      role="option"
                      aria-selected={isAtivo}
                      data-foco={i === foco}
                      onMouseMove={() => i !== foco && setFoco(i)}
                      onClick={() => trocar(g)}
                      disabled={pending}
                      className={`flex w-full items-center gap-3 rounded-sm px-2 py-1.5 text-left ${i === foco ? 'bg-muted' : ''}`}
                    >
                      <span className="grid size-6 shrink-0 place-items-center rounded-sm border bg-muted text-[10px] font-semibold text-muted-foreground">
                        {iniciaisDoGrupo(g.nome)}
                      </span>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className={`truncate ${isAtivo ? 'font-semibold' : 'font-medium'}`}>{g.nome}</span>
                        {meta && <span className="truncate text-xs text-muted-foreground">{meta}</span>}
                      </span>
                      {atalho >= 0 && !busca && <kbd className="hidden rounded-sm border px-1 text-[11px] text-muted-foreground sm:inline">{atalho + 1}</kbd>}
                      <span className="w-4 shrink-0 text-primary-text">{isAtivo && <Check size={16} />}</span>
                    </button>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="hidden gap-4 border-t px-4 py-2 text-xs text-muted-foreground sm:flex">
            <span>↑ ↓ navegar</span><span>Enter trocar</span><span>Alt 1 a 8 troca direto</span><span>Ctrl K abre</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
