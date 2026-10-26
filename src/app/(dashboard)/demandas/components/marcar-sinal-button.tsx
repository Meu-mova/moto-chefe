'use client'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { CurrencyInput } from '@/components/ui/currency-input'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Printer } from 'lucide-react'
import { marcarSinalDemandaAction, desmarcarSinalDemandaAction } from '../actions'
import { ClienteCampos, CLIENTE_VAZIO, clienteCompleto, type ClienteForm } from './cliente-campos'
import { PagamentosFields, pgtoIncompleto, type Pgto } from '../../estoque/components/pagamentos-fields'

type Props = {
  demandaId: string
  sinalRecebido: boolean
  valorSinal: string | null
  isAdmin: boolean
}

const fmt = (v: string) => parseFloat(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export function MarcarSinalButton({ demandaId, sinalRecebido, valorSinal, isAdmin }: Props) {
  const [open, setOpen] = useState(false)
  const [valor, setValor] = useState('')
  // O sinal pode ser dividido em mais de uma forma — mesmas linhas da venda.
  const [pgtos, setPgtos] = useState<Pgto[]>([{ id: '1', tipo: '', valor: '' }])
  const [cliente, setCliente] = useState<ClienteForm>(CLIENTE_VAZIO)
  const [pending, startTransition] = useTransition()

  const valorNum = parseFloat(valor) || 0
  const soma = pgtos.reduce((a, p) => a + (parseFloat(p.valor) || 0), 0)
  const somaOk = valorNum > 0 && Math.abs(soma - valorNum) < 0.01
  const pgtosOk = pgtos.every(p => p.tipo && p.valor && !pgtoIncompleto(p, null))
  const valido = clienteCompleto(cliente) && somaOk && pgtosOk

  function marcar() {
    if (!valido) return
    startTransition(async () => {
      try {
        await marcarSinalDemandaAction(demandaId, {
          ...cliente,
          valorSinal: valorNum,
          pagamentos: pgtos.map(p => ({
            tipo: p.tipo,
            valor: parseFloat(p.valor),
            ...(p.operadora ? { operadora: p.operadora } : {}),
            ...(p.parcelas ? { parcelas: parseInt(p.parcelas) } : {}),
          })),
        })
        toast.success('Sinal registrado — recibo disponível')
        setOpen(false)
        setValor(''); setPgtos([{ id: '1', tipo: '', valor: '' }]); setCliente(CLIENTE_VAZIO)
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao registrar sinal')
      }
    })
  }

  function desmarcar() {
    startTransition(async () => {
      try {
        await desmarcarSinalDemandaAction(demandaId)
        toast.success('Prioridade removida')
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : 'Erro ao desmarcar')
      }
    })
  }

  if (sinalRecebido) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs font-semibold text-warning bg-warning/10 rounded px-2 py-1">
          Prioridade{valorSinal ? ` · ${fmt(valorSinal)}` : ''}
        </span>
        <a
          href={`/demandas/${demandaId}/imprimir`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground underline"
          title="Imprimir recibo do sinal"
        >
          <Printer size={12} /> Recibo
        </a>
        {isAdmin && (
          <button
            onClick={desmarcar}
            disabled={pending}
            className="text-xs text-muted-foreground hover:text-destructive underline"
          >
            desmarcar
          </button>
        )}
      </div>
    )
  }

  return (
    <>
      <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setOpen(true)}>
        Marcar sinal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Recebimento de sinal</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Registrar o sinal exige o cadastro completo do cliente — isso gera o recibo.
            </p>
            <div className="space-y-1 sm:max-w-[240px]">
              <Label>Valor do sinal <span className="text-destructive">*</span></Label>
              <CurrencyInput value={valor} onChange={setValor} placeholder="0,00" />
            </div>

            <div className="space-y-2">
              <Label>Formas de pagamento <span className="text-destructive">*</span></Label>
              <PagamentosFields
                pgtos={pgtos}
                onAdd={() => setPgtos(p => [...p, { id: Date.now().toString(), tipo: '', valor: '' }])}
                onRemove={id => setPgtos(p => p.filter(x => x.id !== id))}
                onUpdate={(id, campo, val) => setPgtos(p => p.map(x => x.id === id
                  ? { ...x, [campo]: val, ...(campo === 'tipo' ? { operadora: undefined, parcelas: undefined } : {}) }
                  : x
                ))}
                taxasVenda={null}
              />
            </div>

            {valorNum > 0 && (
              <div className={`text-sm px-3 py-2 rounded-md border font-medium ${
                somaOk ? 'bg-success/10 text-success border-success/30' : 'bg-destructive/10 text-destructive border-destructive/30'
              }`}>
                {somaOk
                  ? `Somatório confere: R$ ${soma.toFixed(2).replace('.', ',')}`
                  : `Somatório R$ ${soma.toFixed(2).replace('.', ',')} ≠ Sinal R$ ${valorNum.toFixed(2).replace('.', ',')}`
                }
              </div>
            )}
            <ClienteCampos value={cliente} onChange={setCliente} />
            <Button onClick={marcar} disabled={pending || !valido} className="w-full">
              {pending ? 'Salvando…' : 'Confirmar sinal + gerar recibo'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
