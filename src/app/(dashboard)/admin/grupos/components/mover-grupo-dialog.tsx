'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRightLeft } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { contasDestinoAction, moverGrupoAction, previaMoverGrupoAction } from '../actions'
import type { PreviaMover } from '@/lib/mover-grupo'

type Conta = { id: string; nome: string; grupos: string[] }

const ROTULOS: [keyof PreviaMover['vaiJunto'], string][] = [
  ['usuarios', 'Usuários'], ['clientes', 'Clientes'], ['modelos', 'Modelos próprios'], ['apelidos', 'Apelidos de modelo'],
  ['veiculos', 'Histórico de veículos'], ['pecas', 'Peças do catálogo'], ['vinculosPeca', 'Vínculos de peça com fornecedor'],
  ['notasEntrada', 'Notas de entrada de peças'], ['cargos', 'Cargos'],
]

const CONFLITOS: [keyof PreviaMover['conflitos'], string][] = [
  ['apelidos', 'Apelido de modelo'], ['chassis', 'Chassi no histórico'], ['vinculosPeca', 'Vínculo de peça'], ['ajustesModelo', 'Ajuste de modelo'], ['cargos', 'Cargo'],
]

export function MoverGrupoButton({ grupo }: { grupo: { id: string; nome: string; contaId: string } }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [contas, setContas] = useState<Conta[]>([])
  const [destino, setDestino] = useState('')
  const [previa, setPrevia] = useState<PreviaMover | null>(null)
  const [carregando, carregar] = useTransition()
  const [movendo, mover] = useTransition()

  function abrir() {
    setDestino(''); setPrevia(null); setOpen(true)
    carregar(async () => setContas((await contasDestinoAction()).filter(c => c.id !== grupo.contaId)))
  }

  function verPrevia(id: string) {
    setDestino(id); setPrevia(null)
    if (!id) return
    carregar(async () => setPrevia(await previaMoverGrupoAction(grupo.id, id)))
  }

  const contaEscolhida = contas.find(c => c.id === destino)
  const bloqueado = !previa || !!previa.recusa || Object.values(previa.conflitos).some(l => l.length > 0)

  function confirmar() {
    mover(async () => {
      const r = await moverGrupoAction(grupo.id, destino)
      if (!r.ok) {
        toast.error(r.erro)
        if (r.previa) setPrevia(r.previa)
        return
      }
      toast.success(`${grupo.nome} agora está na Conta ${r.previa.destino.nome}`)
      setOpen(false)
      router.refresh()
    })
  }

  return (
    <>
      <button type="button" onClick={abrir} className="text-muted-foreground hover:text-foreground p-1" title="Mover para outra Conta">
        <ArrowRightLeft size={14} />
      </button>
      <Dialog open={open} onOpenChange={o => !movendo && setOpen(o)}>
        <DialogContent className="flex max-h-[calc(100dvh-2rem)] flex-col gap-0 p-0 sm:max-w-xl">
          <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
            <DialogTitle>Mover {grupo.nome} para outra Conta</DialogTitle>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 text-sm sm:px-6">
            <div className="space-y-1.5">
              <Label htmlFor="mover-destino" className="text-xs">Conta de destino</Label>
              {/* <select> nativo: o do design system mostraria o id da Conta no lugar do nome. */}
              <select
                id="mover-destino"
                value={destino}
                onChange={e => verPrevia(e.target.value)}
                disabled={movendo}
                className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="">Escolha a Conta</option>
                {contas.map(c => (
                  <option key={c.id} value={c.id}>{c.nome} ({c.grupos.length} {c.grupos.length === 1 ? 'grupo' : 'grupos'})</option>
                ))}
              </select>
              {/* Os grupos da Conta escolhida ficam embaixo, e não na opção: com muitos, a opção ficava ilegível. */}
              {contaEscolhida && contaEscolhida.grupos.length > 0 && (
                <div className="flex flex-wrap gap-1 pt-1">
                  {contaEscolhida.grupos.map(nome => (
                    <span key={nome} className="rounded-sm border bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{nome}</span>
                  ))}
                </div>
              )}
            </div>

            {carregando && destino && <p className="text-muted-foreground">Conferindo...</p>}

            {previa && (
              <>
                {previa.recusa && <p className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">{previa.recusa}</p>}

                <div className="space-y-1">
                  <p className="font-medium">Vai junto para {previa.destino.nome}</p>
                  <ul className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted-foreground">
                    {ROTULOS.map(([k, rotulo]) => <li key={k}>{rotulo}: <span className="tabular-nums text-foreground">{previa.vaiJunto[k] as number}</span></li>)}
                  </ul>
                  {previa.vaiJunto.marcasNovas.length > 0 && <p className="text-muted-foreground">Marcas que a Conta passa a ver: {previa.vaiJunto.marcasNovas.join(', ')}</p>}
                  {previa.vaiJunto.liberacoesViramAcesso > 0 && (
                    <p className="text-muted-foreground">
                      {previa.vaiJunto.liberacoesViramAcesso} usuário(s) de {previa.destino.nome} tinham este grupo liberado e passam a vê-lo como grupo da própria Conta.
                    </p>
                  )}
                  <p className="text-muted-foreground">Vendas, estoque, NF, caixa, lojas e a configuração da Nota Gateway são do grupo e não mudam. A Conta {previa.origem.nome} fica desativada.</p>
                </div>

                {previa.conflitos.clientes.length > 0 && (
                  <div className="space-y-1">
                    <p className="font-medium text-destructive">Clientes com o mesmo CPF/CNPJ nas duas Contas</p>
                    <ul className="text-muted-foreground">
                      {previa.conflitos.clientes.map(c => <li key={c.cpfCnpj}><span className="font-mono">{c.cpfCnpj}</span>: {c.nomeOrigem} / {c.nomeDestino}</li>)}
                    </ul>
                  </div>
                )}
                {CONFLITOS.filter(([k]) => previa.conflitos[k].length > 0).map(([k, rotulo]) => (
                  <div key={k} className="space-y-1">
                    <p className="font-medium text-destructive">{rotulo} repetido na Conta de destino</p>
                    <p className="text-muted-foreground">{(previa.conflitos[k] as string[]).join(', ')}</p>
                  </div>
                ))}
                {!previa.recusa && bloqueado && <p className="text-destructive">Resolva os casos acima antes de mover. Nada foi gravado.</p>}
              </>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t bg-muted/40 px-4 py-3 sm:px-6">
            <Button variant="outline" onClick={() => setOpen(false)} disabled={movendo}>Cancelar</Button>
            <Button onClick={confirmar} disabled={bloqueado || carregando || movendo}>
              {movendo ? 'Movendo...' : previa ? `Mover para ${previa.destino.nome}` : 'Mover'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
