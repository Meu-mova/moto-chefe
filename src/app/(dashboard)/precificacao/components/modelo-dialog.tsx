'use client'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { AlertTriangle } from 'lucide-react'
import { fmtBRL } from '@/lib/preco-minimo'
import { destaqueAvista12x, lerTotal12x } from '@/lib/simulador-padrao'
import { salvarPrecoAction } from '../actions'

type Modelo = {
  precId: string | null
  doCatalogo: boolean
  nome: string
  marca: string | null
  valorMinimo: string | null
  custo: string | null
  valor12x: string | null
}

type Props = {
  modelo?: Modelo | null
  /** Grupo no padrão 'avista_12x': o campo do total em 12x aparece. */
  com12x: boolean
  onClose: () => void
}

export function ModeloDialog({ modelo, com12x, onClose }: Props) {
  const [nome, setNome] = useState(modelo?.nome ?? '')
  const [valorMinimo, setValorMinimo] = useState(modelo?.valorMinimo ?? '')
  const [custo, setCusto] = useState(modelo?.custo ?? '')
  const [valor12x, setValor12x] = useState(modelo?.valor12x ?? '')
  const [loading, setLoading] = useState(false)
  const id = useId()

  // Modelo do catálogo tem o nome travado: é ele que liga o preço ao cadastro
  // de /admin/modelos (e às vendas, que casam por nome). Renomear aqui soltaria
  // o preço do modelo sem ninguém perceber. Para renomear, edite em Modelos.
  const nomeTravado = modelo?.doCatalogo ?? false
  const primeiroPreco = !!modelo && modelo.precId === null

  const vMin = parseFloat(valorMinimo || '0')
  const vCusto = parseFloat(custo || '0')
  const margemR = vMin > 0 && vCusto > 0 ? vMin - vCusto : null
  const margemPct = vMin > 0 && margemR !== null ? (margemR / vMin) * 100 : null
  const total12x = lerTotal12x(valor12x)
  const d = destaqueAvista12x(vMin, total12x === 'invalido' ? null : total12x)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nome.trim() || !valorMinimo) {
      toast.error('Preencha nome e valor mínimo')
      return
    }
    setLoading(true)
    try {
      const r = await salvarPrecoAction({
        precId: modelo?.precId ?? null,
        nome,
        valorMinimo,
        custo: custo || undefined,
        // Campo escondido (padrão 'taxas'): não manda, e o valor gravado fica como está.
        valor12x: com12x ? valor12x : undefined,
      })
      if (!r.ok) {
        toast.error(r.erro)
        return
      }
      toast.success(primeiroPreco || !modelo ? 'Preço definido' : 'Modelo atualizado')
      onClose()
    } catch {
      toast.error('Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  const titulo = !modelo ? 'Novo Modelo' : primeiroPreco ? 'Definir preço' : 'Editar Modelo'

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className={com12x ? 'sm:max-w-md' : 'sm:max-w-sm'}>
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-nome`}>Nome do modelo *</Label>
            <Input
              id={`${id}-nome`}
              value={nome}
              onChange={e => setNome(e.target.value)}
              placeholder="Ex: JETMAX PRO"
              autoFocus={!nomeTravado}
              disabled={nomeTravado}
            />
            {nomeTravado && (
              <p className="text-xs text-muted-foreground">
                {modelo?.marca ? `${modelo.marca} · ` : ''}Cadastrado em Modelos — para renomear, edite lá.
              </p>
            )}
          </div>
          <div className={com12x ? 'grid gap-4 sm:grid-cols-2' : ''}>
            <div className="space-y-1.5">
              <Label htmlFor={`${id}-pix`}>Valor mínimo PIX (R$) *</Label>
              <CurrencyInput id={`${id}-pix`} value={valorMinimo} onChange={setValorMinimo} placeholder="0,00" autoFocus={nomeTravado} />
            </div>
            {com12x && (
              <div className="space-y-1.5">
                <Label htmlFor={`${id}-12x`}>Total em 12x (R$)</Label>
                <CurrencyInput id={`${id}-12x`} value={valor12x} onChange={setValor12x} placeholder="Vazio: sem 12x" />
              </div>
            )}
          </div>
          {com12x && <Conta12x d={d} comPix={vMin > 0} />}
          <div className="space-y-1.5">
            <Label htmlFor={`${id}-custo`}>Custo (R$)</Label>
            <CurrencyInput id={`${id}-custo`} value={custo} onChange={setCusto} placeholder="0,00" />
            <p className="text-xs text-muted-foreground">Valor que pagamos pela moto</p>
          </div>
          {margemR !== null && margemPct !== null && (
            <div className={`rounded-lg p-3 text-sm ${margemPct >= 20 ? 'bg-success/10 border border-success/30' : margemPct >= 10 ? 'bg-warning/10 border border-warning/30' : 'bg-destructive/10 border border-destructive/30'}`}>
              <span className="font-medium">Margem: </span>
              <span className={`font-bold ${margemPct >= 20 ? 'text-success' : margemPct >= 10 ? 'text-warning' : 'text-destructive'}`}>
                {margemPct.toFixed(1)}%
              </span>
              <span className={`ml-2 ${margemPct >= 20 ? 'text-success' : margemPct >= 10 ? 'text-warning' : 'text-destructive'}`}>
                ({margemR.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })})
              </span>
            </div>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Salvando...' : primeiroPreco || !modelo ? 'Definir preço' : 'Salvar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/** O que o cliente vai ver no simulador com o 12x digitado; 12x igual ou abaixo do PIX avisa e deixa salvar. */
function Conta12x({ d, comPix }: { d: ReturnType<typeof destaqueAvista12x>; comPix: boolean }) {
  if (d.total12x === null || d.parcela12x === null) {
    return <p className="text-xs text-muted-foreground">Sem total em 12x, o simulador mostra só o PIX deste modelo.</p>
  }
  if (d.pixAcimaDo12x) {
    return (
      <p className="flex gap-2 rounded-lg border border-warning/35 bg-warning/10 p-3 text-sm text-foreground">
        <AlertTriangle size={16} className="text-warning shrink-0 mt-0.5" />
        O 12x está igual ou abaixo do PIX. Dá para salvar, mas confira o valor.
      </p>
    )
  }
  return (
    <dl className="grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 rounded-lg bg-muted px-3 py-2.5 text-sm">
      <dt className="text-muted-foreground">Cliente vê</dt>
      <dd className="font-bold text-right tabular-nums">12x de {fmtBRL(d.parcela12x)}</dd>
      {/* Sem o PIX digitado ainda, a "economia" seria o 12x inteiro. */}
      {comPix && d.economiaPix !== null && (
        <>
          <dt className="text-muted-foreground">Desconto do PIX</dt>
          <dd className="font-bold text-right text-success tabular-nums">
            {d.descontoPix !== null ? `${d.descontoPix}% (${fmtBRL(d.economiaPix)})` : fmtBRL(d.economiaPix)}
          </dd>
        </>
      )}
    </dl>
  )
}
