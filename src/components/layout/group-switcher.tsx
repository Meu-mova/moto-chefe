'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Building2, ChevronsUpDown, Check, ArrowRightLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { corDoGrupo } from '@/lib/grupo-cores'
import { BotaoTema } from '@/components/theme-provider'
import { trocarGrupoAtivoAction } from './group-selector-actions'
import type { BlocoDoSeletor } from '@/lib/blocos-seletor'

export function GroupSwitcher({ blocos, ativoId }: { blocos: BlocoDoSeletor[]; ativoId: string }) {
  const grupos = blocos.flatMap(b => b.grupos)
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [selecionado, setSelecionado] = useState<string>(ativoId)
  const [pending, start] = useTransition()

  const ativo = grupos.find(g => g.id === ativoId) ?? grupos[0]
  const corAtivo = corDoGrupo(ativo)
  const alvo = grupos.find(g => g.id === selecionado)
  const vaiTrocar = selecionado !== ativoId

  function abrir() { setSelecionado(ativoId); setOpen(true) }

  function confirmar() {
    if (!vaiTrocar || !alvo) return
    start(async () => {
      try {
        await trocarGrupoAtivoAction(alvo.id)
        setOpen(false)
        toast.success(`Agora você está em ${alvo.nome}`)
        router.refresh()
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao trocar de grupo')
      }
    })
  }

  return (
    <>
      {/* Barra colorida do grupo ativo — sempre visível */}
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
            className={`shrink-0 inline-flex items-center gap-1.5 rounded-md bg-grupo-realce hover:bg-grupo-realce-hover px-3 py-1.5 text-sm font-medium transition-colors`}
          >
            <ArrowRightLeft size={14} /> Trocar
            <ChevronsUpDown size={14} className="opacity-70" />
          </button>
        </div>
      </div>

      {/* Diálogo de troca — dois passos deliberados: selecionar + confirmar */}
      <Dialog open={open} onOpenChange={o => !pending && setOpen(o)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Trocar de empresa / grupo</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-muted-foreground -mt-1">
            Escolha a empresa. Todos os novos lançamentos (caixa, entrada, vendas, despesas) passam a ser registrados nela.
          </p>

          <div className="space-y-3 py-1">
            {blocos.map((bloco, i) => (
            <div key={bloco.titulo ?? i} className="space-y-2">
            {bloco.titulo && <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{bloco.titulo}</p>}
            {bloco.grupos.map(g => {
              const cor = corDoGrupo(g)
              const isAtivo = g.id === ativoId
              const isSel = g.id === selecionado
              return (
                <button
                  key={g.id}
                  onClick={() => setSelecionado(g.id)}
                  className={`w-full flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                    isSel ? 'border-foreground bg-muted ring-1 ring-foreground' : 'border-border hover:bg-muted'
                  }`}
                >
                  <span className={`h-3.5 w-3.5 rounded-full shrink-0 ${cor.dot}`} />
                  <span className="font-medium flex-1">
                    {g.nome}
                    {g.mostrarConta && g.contaNome && <span className="font-normal text-muted-foreground"> ({g.contaNome})</span>}
                  </span>
                  {isAtivo && <span className="text-xs text-muted-foreground">Atual</span>}
                  {isSel && !isAtivo && <Check size={16} className="text-foreground" />}
                </button>
              )
            })}
            </div>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancelar</Button>
            <Button onClick={confirmar} disabled={pending || !vaiTrocar}>
              {pending ? 'Trocando…' : vaiTrocar ? `Trocar para ${alvo?.nome}` : 'Selecione outra empresa'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
