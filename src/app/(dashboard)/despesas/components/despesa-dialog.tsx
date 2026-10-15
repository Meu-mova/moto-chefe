'use client'
import { useState } from 'react'
import { hojeBrt } from '@/lib/data-venda'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { CurrencyInput } from '@/components/ui/currency-input'
import { ArrowLeft, Plus, Pencil, X } from 'lucide-react'
import { toast } from 'sonner'
import { criarDespesaAction, editarDespesaAction } from '../actions'
import type { Loja, DespesaRow } from '../types'

// Campos >=16px no celular (iOS dá zoom abaixo disso) e compactos do sm para cima.
const CAMPO = 'h-11 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none md:h-9 md:text-sm'

const FORMAS_PAGAMENTO = ['PIX', 'Transferência', 'Boleto', 'Dinheiro', 'Cartão']

const BANCOS = [
  'Sicoob', 'Itaú', 'Bradesco', 'Caixa Econômica Federal',
  'Nubank', 'Santander', 'BTG Pactual', 'Outro',
]

type Props = {
  lojas: Loja[]
  categorias: string[]
  /** Categorias que exigem "a quem se destinou" — vem de categorias_despesa. */
  categoriasComBeneficiario: string[]
  /** Sócios do grupo ativo, do catálogo editável em /admin/categorias-caixa. */
  beneficiarios: string[]
  modo: 'criar' | 'editar'
  inicial?: DespesaRow
  open?: boolean
  onOpenChange?: (v: boolean) => void
}

export function DespesaDialog({ lojas, categorias, categoriasComBeneficiario, beneficiarios, modo, inicial, open, onOpenChange }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const hoje = hojeBrt()

  const [lojaId, setLojaId]               = useState(inicial?.lojaId ?? '')
  const [categoria, setCategoria]         = useState(inicial?.categoria ?? '')
  const [descricao, setDescricao]         = useState(inicial?.descricao ?? '')
  const [valor, setValor]                 = useState(inicial?.valor ?? '')
  const [data, setData]                   = useState(inicial?.data ?? hoje)
  const [formaPagamento, setFormaPagamento] = useState(inicial?.formaPagamento ?? '')
  const [banco, setBanco]                 = useState(inicial?.banco ?? '')
  const [beneficiario, setBeneficiario]   = useState(inicial?.beneficiario ?? '')

  const exigeBeneficiario = categoriasComBeneficiario.includes(categoria)

  function resetar() {
    setLojaId('')
    setCategoria('')
    setDescricao('')
    setValor('')
    setData(hoje)
    setFormaPagamento('')
    setBanco('')
    setBeneficiario('')
  }

  async function handleSalvar() {
    if (!categoria || !valor || !data || !formaPagamento || !banco) {
      toast.error('Preencha todos os campos obrigatórios')
      return
    }
    // Espelha a trava do servidor: sem o nome, a retirada some no bolo e não dá
    // para saber quanto saiu para cada sócio.
    if (exigeBeneficiario && !beneficiario) {
      toast.error(`A categoria "${categoria}" exige informar a quem se destinou`)
      return
    }
    setLoading(true)
    try {
      const dados = {
        lojaId:         lojaId || null,
        categoria,
        beneficiario:   exigeBeneficiario ? beneficiario : null,
        descricao:      descricao.trim() || undefined,
        valor,
        data,
        formaPagamento,
        banco,
      }
      if (modo === 'criar') {
        await criarDespesaAction(dados)
        toast.success('Despesa registrada!')
        resetar()
      } else {
        await editarDespesaAction(inicial!.id, dados)
        toast.success('Despesa atualizada!')
      }
      onOpenChange?.(false)
      router.refresh()
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Erro ao salvar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* Tela cheia no celular (mesmo padrão do cancelar venda); modal a partir de sm. */}
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[90vh] flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:max-w-lg max-md:inset-0 max-md:top-0 max-md:left-0 max-md:h-dvh max-md:max-h-none max-md:max-w-none max-md:translate-x-0 max-md:translate-y-0 max-md:rounded-none max-md:ring-0"
      >
        <div className="flex items-center gap-2 border-b border-border px-2 py-2 md:px-4">
          <button type="button" onClick={() => onOpenChange?.(false)} aria-label="Voltar" className="rounded-md p-2 text-foreground hover:bg-muted md:hidden">
            <ArrowLeft className="size-5" />
          </button>
          <DialogTitle className="min-w-0 flex-1 text-base font-semibold">{modo === 'criar' ? 'Nova Despesa' : 'Editar Despesa'}</DialogTitle>
          <button type="button" onClick={() => onOpenChange?.(false)} aria-label="Fechar" className="hidden rounded-md p-2 text-muted-foreground hover:bg-muted md:block">
            <X className="size-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
          {/* Loja */}
          <div className="space-y-1.5">
            <Label className="text-sm md:text-xs">Loja</Label>
            <select
              value={lojaId}
              onChange={e => setLojaId(e.target.value)}
              className={CAMPO}
            >
              <option value="">Geral — empresa toda</option>
              {lojas.map(l => (
                <option key={l.id} value={l.id}>{l.nome}</option>
              ))}
            </select>
          </div>

          {/* Categoria */}
          <div className="space-y-1.5">
            <Label className="text-sm md:text-xs">Categoria *</Label>
            <select
              value={categoria}
              onChange={e => setCategoria(e.target.value)}
              className={CAMPO}
            >
              <option value="">Selecione...</option>
              {categorias.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* A quem se destinou — só nas categorias marcadas (retirada, pró-labore). */}
          {exigeBeneficiario && (
            <div className="space-y-1.5">
              <Label className="text-sm md:text-xs">A quem se destinou *</Label>
              <select
                value={beneficiario}
                onChange={e => setBeneficiario(e.target.value)}
                className={CAMPO}
              >
                <option value="">Selecione...</option>
                {beneficiarios.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          )}

          {/* Valor + Data */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm md:text-xs">Valor (R$) *</Label>
              <CurrencyInput value={valor} onChange={setValor} placeholder="0,00" className="h-11 text-base md:h-9 md:text-sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm md:text-xs">Data *</Label>
              <Input type="date" value={data} onChange={e => setData(e.target.value)} className="h-11 text-base md:h-9 md:text-sm" />
            </div>
          </div>

          {/* Forma de pagamento + Banco */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm md:text-xs">Forma de pagamento *</Label>
              <select
                value={formaPagamento}
                onChange={e => setFormaPagamento(e.target.value)}
                className={CAMPO}
              >
                <option value="">Selecione...</option>
                {FORMAS_PAGAMENTO.map(f => (
                  <option key={f} value={f}>{f}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm md:text-xs">Banco *</Label>
              <select
                value={banco}
                onChange={e => setBanco(e.target.value)}
                className={CAMPO}
              >
                <option value="">Selecione...</option>
                {BANCOS.map(b => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label className="text-sm md:text-xs">Descrição <span className="text-muted-foreground">(opcional)</span></Label>
            <Textarea
              value={descricao}
              onChange={e => setDescricao(e.target.value)}
              placeholder="Detalhes do pagamento..."
              rows={3}
              className="resize-none text-base md:text-sm"
            />
          </div>
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-border px-4 py-3 md:flex-row md:justify-end">
          <Button variant="outline" className="h-11 md:h-8" onClick={() => onOpenChange?.(false)}>Cancelar</Button>
          <Button className="h-11 md:h-8" onClick={handleSalvar} disabled={loading}>
            {loading ? 'Salvando...' : modo === 'criar' ? 'Registrar' : 'Salvar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

type OpcoesBeneficiario = { categoriasComBeneficiario: string[]; beneficiarios: string[] }

export function NovaDespesaButton({ lojas, categorias, categoriasComBeneficiario, beneficiarios }: { lojas: Loja[]; categorias: string[] } & OpcoesBeneficiario) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" className="h-11 gap-1.5 text-base md:h-8 md:text-sm">
        <Plus size={15} /> Nova Despesa
      </Button>
      <DespesaDialog
        lojas={lojas} categorias={categorias}
        categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
        modo="criar" open={open} onOpenChange={setOpen}
      />
    </>
  )
}

export function EditarDespesaButton({ lojas, despesa, categorias, categoriasComBeneficiario, beneficiarios }: { lojas: Loja[]; despesa: DespesaRow; categorias: string[] } & OpcoesBeneficiario) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted-foreground hover:text-foreground p-1"
        title="Editar"
      >
        <Pencil size={14} />
      </button>
      <DespesaDialog
        key={`${despesa.id}-${despesa.valor}-${despesa.data}`}
        lojas={lojas} categorias={categorias}
        categoriasComBeneficiario={categoriasComBeneficiario} beneficiarios={beneficiarios}
        modo="editar" inicial={despesa} open={open} onOpenChange={setOpen}
      />
    </>
  )
}
