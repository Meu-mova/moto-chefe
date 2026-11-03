'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, Pencil, Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { oQueABaseFaz, type OQueABaseFaz } from '@/lib/base-do-cargo'
import { rotuloDoPapelGravado } from '@/lib/rotulo-do-papel'
import { PAPEIS_BASE_DO_CARGO, type PapelBase } from '@/lib/gestao-usuarios'
import { apagarCargoAction, criarCargoAction, editarCargoAction } from '../cargos-actions'

export type CargoDaConta = { id: string; nome: string; papelBase: PapelBase; contaId: string }
export type Cargo = CargoDaConta & { usuarios: number }

const COLUNAS = ['Aprova venda', 'Cancela venda', 'Opera caixa', 'Emite NF']

function resumoDasTelas(base: PapelBase | ''): string {
  if (!base) return 'Escolha uma base para ver as telas.'
  const { telas, soOBasico } = oQueABaseFaz(base)
  return soOBasico ? `Telas: só o básico (${telas.join(', ')}).` : `Telas: as ${telas.length} telas do papel ${rotuloDoPapelGravado(base)}.`
}

const textoUsuarios = (n: number) => n === 0 ? 'nenhum usuário' : `${n} ${n === 1 ? 'usuário' : 'usuários'}`

function Sim({ extra }: { extra?: string }) {
  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1 font-semibold text-primary-text">
      <Check size={16} aria-hidden /><span className="sr-only">sim</span>
      {extra && <span className="text-xs font-normal text-muted-foreground">{extra}</span>}
    </span>
  )
}

function Celulas({ faz }: { faz: OQueABaseFaz }) {
  const nao = <span className="text-muted-foreground">não</span>
  return (
    <>
      <td className="px-1 py-2.5 text-center sm:px-2">{faz.aprovaVenda ? <Sim /> : nao}</td>
      <td className="px-1 py-2.5 text-center sm:px-2">{faz.cancelaVenda === 'nao' ? nao : <Sim extra={faz.cancelaVenda === 'sem-nf' ? 'sem NF' : undefined} />}</td>
      <td className="px-1 py-2.5 text-center sm:px-2">{faz.operaCaixa ? <Sim /> : nao}</td>
      <td className="px-1 py-2.5 text-center sm:px-2">{faz.emiteNF ? <Sim /> : nao}</td>
    </>
  )
}

// Uma linha por base, com o que ela faz hoje (lido das regras reais em oQueABaseFaz).
function EscolhaDaBase({ base, onChange, travado }: { base: PapelBase | ''; onChange: (b: PapelBase) => void; travado: boolean }) {
  return (
    <fieldset className="min-w-0 space-y-1.5">
      <legend className="text-sm font-medium">Papel base</legend>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[20rem] text-sm">
          <thead className="bg-muted text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 pl-3 text-left font-medium">Base</th>
              {COLUNAS.map(c => <th key={c} scope="col" className="px-1 py-2 text-center font-medium sm:px-2">{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {PAPEIS_BASE_DO_CARGO.map(b => (
              <tr key={b} className={`border-t ${b === base ? 'bg-primary/10' : ''}`}>
                <th scope="row" className="py-0 pl-3 text-left font-normal">
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <input type="radio" name="papel-base" value={b} checked={b === base} onChange={() => onChange(b)} disabled={travado} className="size-4 accent-primary" />
                    {rotuloDoPapelGravado(b)}
                  </label>
                </th>
                <Celulas faz={oQueABaseFaz(b)} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted-foreground">Escolha a linha. Quem tem o cargo faz o que a base faz, com as mesmas regras. Aprovar venda vale só nos grupos marcados no cadastro do usuário.</p>
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
        {resumoDasTelas(base)} Ajustar as telas do cargo (tirar e acrescentar) chega em breve.
      </p>
    </fieldset>
  )
}

// Lista e formulário no mesmo diálogo (variante B): `editando` null = lista; {} = cargo novo.
export function CargosDialog({ open, onOpenChange, cargos }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  cargos: Cargo[]
}) {
  const [editando, setEditando] = useState<Partial<Cargo> | null>(null)
  const [nome, setNome] = useState('')
  const [papelBase, setPapelBase] = useState<PapelBase | ''>('')
  const [pending, startTransition] = useTransition()

  function abrir(c: Partial<Cargo>) {
    setEditando(c); setNome(c.nome ?? ''); setPapelBase(c.papelBase ?? '')
  }

  function salvar() {
    if (!nome.trim()) { toast.error('Informe o nome do cargo'); return }
    if (!papelBase) { toast.error('Escolha o papel base do cargo'); return }
    startTransition(async () => {
      const dados = { nome, papelBase }
      const r = editando?.id ? await editarCargoAction(editando.id, dados) : await criarCargoAction(dados)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success(editando?.id ? 'Cargo atualizado' : 'Cargo criado')
      setEditando(null)
    })
  }

  function apagar(c: Cargo) {
    startTransition(async () => {
      const r = await apagarCargoAction(c.id)
      if (!r.ok) { toast.error(r.erro); return }
      toast.success('Cargo apagado')
    })
  }

  return (
    <Dialog open={open} onOpenChange={v => { onOpenChange(v); if (!v) setEditando(null) }}>
      <DialogContent className="flex max-h-[calc(100dvh-2rem)] max-w-[calc(100%-1rem)] flex-col gap-0 p-0 sm:max-w-3xl">
        <DialogHeader className="border-b py-4 pr-12 pl-4 sm:pl-6">
          <DialogTitle>{editando ? (editando.id ? 'Editar cargo' : 'Novo cargo') : 'Cargos da Conta'}</DialogTitle>
          {!editando && <p className="text-sm text-muted-foreground">Cada cargo faz o que o papel base dele faz.</p>}
        </DialogHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-6">
          {editando ? (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="nome-cargo">Nome do cargo</Label>
                <Input id="nome-cargo" value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Gerente" disabled={pending} />
              </div>
              <EscolhaDaBase base={papelBase} onChange={setPapelBase} travado={pending} />
            </div>
          ) : cargos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum cargo criado.</p>
          ) : (
            <ul className="divide-y">
              {cargos.map(c => (
                <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                  <div className="min-w-0">
                    <p className="font-medium">{c.nome}</p>
                    <p className="truncate text-xs text-muted-foreground">Base {rotuloDoPapelGravado(c.papelBase)}, {textoUsuarios(c.usuarios)}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Button variant="ghost" size="icon" aria-label={`Editar ${c.nome}`} onClick={() => abrir(c)} disabled={pending}><Pencil size={14} /></Button>
                    <Button variant="ghost" size="icon" aria-label={`Apagar ${c.nome}`} onClick={() => apagar(c)} disabled={pending}><Trash2 size={14} /></Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <DialogFooter className="mx-0 mb-0 rounded-b-xl px-4 sm:px-6">
          {editando ? (
            <>
              <Button variant="outline" onClick={() => setEditando(null)} disabled={pending}>Voltar</Button>
              <Button onClick={salvar} disabled={pending}>{editando.id ? 'Salvar' : 'Criar cargo'}</Button>
            </>
          ) : (
            <Button onClick={() => abrir({})} className="gap-2"><Plus size={16} /> Novo cargo</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
